"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import YAML from "yaml";
import { z } from "zod";
import { requireAdmin, requireStaff } from "@/lib/auth";
import { audit } from "@/lib/events";
import { enroll } from "@/lib/access";
import { createAdminClient } from "@/lib/supabase/server";
import { estimateReadingMinutes, parseBlocks } from "@/lib/blocks/schema";
import { COMPILE_LAB_TEMPLATE, TERMINAL_LAB_TEMPLATE, parseLabYaml, type LabSpec } from "@/lib/labs/spec";
import { CHALLENGE_GENERATORS } from "@/lib/labs/challenges";
import { getCompiler } from "@/lib/compile/provider";
import { StudioError, assertCourseEditor, assertLabEditor, courseIdForItem, courseIdForSection, uniqueSlug } from "@/lib/studio";
import { slugify } from "@/lib/utils";
import { razorpay } from "@/lib/billing/razorpay";
import { serverEnv } from "@/lib/env";
import { saveAppSetting } from "@/lib/settings";
import type { ItemKind } from "@/lib/types";

export type ActionResult<T = void> = { ok: true; data?: T } | { ok: false; error: string; errors?: string[] };

async function guard<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (e instanceof StudioError) return { ok: false, error: e.message };
    if (e instanceof z.ZodError) return { ok: false, error: e.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ") };
    if (e && typeof e === "object" && "digest" in e) throw e; // let redirect()/notFound() through
    console.error(e);
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
  }
}

function revalidateCourse(courseId?: string) {
  revalidatePath("/studio", "layout");
  revalidatePath("/courses", "layout");
  if (courseId) revalidatePath(`/studio/courses/${courseId}`);
}

const list = (s: FormDataEntryValue | null) =>
  String(s ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 20);

// ═══ Courses ════════════════════════════════════════════════════════════════
export async function createCourse(formData: FormData): Promise<void> {
  const viewer = await requireStaff();
  const title = String(formData.get("title") ?? "").trim() || "Untitled course";
  const slug = await uniqueSlug("courses", slugify(title));
  const { data, error } = await createAdminClient()
    .from("courses")
    .insert({ title, slug, owner_id: viewer.user.id, status: "draft" })
    .select("id")
    .single<{ id: string }>();
  if (error || !data) throw new Error(error?.message ?? "Could not create course");
  await createAdminClient().from("sections").insert({ course_id: data.id, title: "Getting started", position: 0 });
  await audit({ actorId: viewer.user.id, action: "course.create", resourceType: "course", resourceId: data.id, after: { title, slug } });
  revalidateCourse();
  redirect(`/studio/courses/${data.id}`);
}

const courseSchema = z.object({
  title: z.string().trim().min(1).max(160),
  slug: z.string().trim().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Slug must be lowercase words separated by dashes"),
  subtitle: z.string().trim().max(300).optional(),
  description: z.string().max(20000).optional(),
  cover_image_url: z.string().trim().max(1000).optional(),
  level: z.enum(["beginner", "intermediate", "advanced"]),
  estimated_hours: z.string().optional(),
  is_free: z.boolean(),
  price_rupees: z.string().optional(),
});

export async function updateCourse(courseId: string, formData: FormData): Promise<ActionResult> {
  return guard(async () => {
    const viewer = await requireStaff();
    const before = await assertCourseEditor(viewer, courseId);
    const input = courseSchema.parse({
      title: formData.get("title"),
      slug: formData.get("slug"),
      subtitle: formData.get("subtitle") ?? undefined,
      description: formData.get("description") ?? undefined,
      cover_image_url: formData.get("cover_image_url") ?? undefined,
      level: formData.get("level"),
      estimated_hours: formData.get("estimated_hours") ?? undefined,
      is_free: formData.get("is_free") === "on",
      price_rupees: formData.get("price_rupees") ?? undefined,
    });
    if (input.slug !== before.slug) {
      const { data: clash } = await createAdminClient().from("courses").select("id").eq("slug", input.slug).neq("id", courseId).maybeSingle();
      if (clash) throw new StudioError("Another course already uses that slug");
    }
    const hours = input.estimated_hours ? Number(input.estimated_hours) : null;
    const price = input.price_rupees ? Math.round(Number(input.price_rupees) * 100) : null;
    const patch = {
      title: input.title,
      slug: input.slug,
      subtitle: input.subtitle || null,
      description: input.description || null,
      cover_image_url: input.cover_image_url || null,
      level: input.level,
      tags: list(formData.get("tags")).map((t) => t.toLowerCase()),
      skills: list(formData.get("skills")),
      estimated_hours: hours !== null && Number.isFinite(hours) ? hours : null,
      is_free: input.is_free,
      price_paise: input.is_free ? null : price !== null && Number.isFinite(price) ? price : null,
    };
    const { error } = await createAdminClient().from("courses").update(patch).eq("id", courseId);
    if (error) throw new StudioError(error.message);
    await audit({ actorId: viewer.user.id, action: "course.update", resourceType: "course", resourceId: courseId, before, after: patch });
    revalidateCourse(courseId);
  });
}

export async function setCourseStatus(courseId: string, status: "draft" | "published" | "archived"): Promise<ActionResult> {
  return guard(async () => {
    const viewer = await requireStaff();
    const course = await assertCourseEditor(viewer, courseId);
    if (status === "published") {
      const { count } = await createAdminClient().from("items").select("id", { count: "exact", head: true }).eq("course_id", courseId);
      if (!count) throw new StudioError("Add at least one item before publishing");
    }
    const { error } = await createAdminClient()
      .from("courses")
      .update({ status, published_at: status === "published" ? course.published_at ?? new Date().toISOString() : course.published_at })
      .eq("id", courseId);
    if (error) throw new StudioError(error.message);
    await audit({ actorId: viewer.user.id, action: `course.${status}`, resourceType: "course", resourceId: courseId, before: { status: course.status }, after: { status } });
    revalidateCourse(courseId);
  });
}

export async function deleteCourse(courseId: string): Promise<ActionResult> {
  return guard(async () => {
    const viewer = await requireStaff();
    const course = await assertCourseEditor(viewer, courseId);
    if (course.status === "published") throw new StudioError("Unpublish or archive the course before deleting it");
    const { error } = await createAdminClient().from("courses").delete().eq("id", courseId);
    if (error) throw new StudioError(error.message);
    await audit({ actorId: viewer.user.id, action: "course.delete", resourceType: "course", resourceId: courseId, before: course });
    revalidateCourse();
  });
}

// ═══ Sections ═══════════════════════════════════════════════════════════════
export async function addSection(courseId: string, title: string): Promise<ActionResult> {
  return guard(async () => {
    const viewer = await requireStaff();
    await assertCourseEditor(viewer, courseId);
    const admin = createAdminClient();
    const { data: last } = await admin.from("sections").select("position").eq("course_id", courseId).order("position", { ascending: false }).limit(1).maybeSingle<{ position: number }>();
    const { error } = await admin.from("sections").insert({ course_id: courseId, title: title.trim() || "New section", position: (last?.position ?? -1) + 1 });
    if (error) throw new StudioError(error.message);
    revalidateCourse(courseId);
  });
}

export async function updateSection(sectionId: string, patch: { title?: string; description?: string | null }): Promise<ActionResult> {
  return guard(async () => {
    const viewer = await requireStaff();
    const courseId = await courseIdForSection(sectionId);
    await assertCourseEditor(viewer, courseId);
    const clean: Record<string, unknown> = {};
    if (patch.title !== undefined) clean.title = patch.title.trim().slice(0, 160) || "Untitled section";
    if (patch.description !== undefined) clean.description = patch.description?.trim() || null;
    const { error } = await createAdminClient().from("sections").update(clean).eq("id", sectionId);
    if (error) throw new StudioError(error.message);
    revalidateCourse(courseId);
  });
}

export async function deleteSection(sectionId: string): Promise<ActionResult> {
  return guard(async () => {
    const viewer = await requireStaff();
    const courseId = await courseIdForSection(sectionId);
    await assertCourseEditor(viewer, courseId);
    const { error } = await createAdminClient().from("sections").delete().eq("id", sectionId);
    if (error) throw new StudioError(error.message);
    await audit({ actorId: viewer.user.id, action: "section.delete", resourceType: "section", resourceId: sectionId });
    revalidateCourse(courseId);
  });
}

async function swapPositions(table: "sections" | "items", rows: { id: string; position: number }[], id: string, direction: -1 | 1) {
  const sorted = [...rows].sort((a, b) => a.position - b.position);
  const i = sorted.findIndex((r) => r.id === id);
  const j = i + direction;
  if (i < 0 || j < 0 || j >= sorted.length) return;
  [sorted[i], sorted[j]] = [sorted[j], sorted[i]];
  const admin = createAdminClient();
  await Promise.all(sorted.map((r, idx) => admin.from(table).update({ position: idx }).eq("id", r.id)));
}

export async function moveSection(sectionId: string, direction: -1 | 1): Promise<ActionResult> {
  return guard(async () => {
    const viewer = await requireStaff();
    const courseId = await courseIdForSection(sectionId);
    await assertCourseEditor(viewer, courseId);
    const { data } = await createAdminClient().from("sections").select("id, position").eq("course_id", courseId);
    await swapPositions("sections", data ?? [], sectionId, direction);
    revalidateCourse(courseId);
  });
}

// ═══ Items ══════════════════════════════════════════════════════════════════
export async function addItem(sectionId: string, kind: ItemKind, title: string): Promise<ActionResult<{ id: string }>> {
  return guard(async () => {
    const viewer = await requireStaff();
    const courseId = await courseIdForSection(sectionId);
    await assertCourseEditor(viewer, courseId);
    const admin = createAdminClient();
    const { data: last } = await admin.from("items").select("position").eq("section_id", sectionId).order("position", { ascending: false }).limit(1).maybeSingle<{ position: number }>();
    const defaultTitle = kind === "article" ? "New article" : kind === "quiz" ? "Quick check" : "Hands-on lab";
    const { data: item, error } = await admin
      .from("items")
      .insert({ course_id: courseId, section_id: sectionId, kind, title: title.trim() || defaultTitle, position: (last?.position ?? -1) + 1 })
      .select("id")
      .single<{ id: string }>();
    if (error || !item) throw new StudioError(error?.message ?? "Could not add item");
    if (kind === "article") await admin.from("articles").insert({ item_id: item.id, blocks: [{ id: "intro", type: "markdown", v: 1, data: { md: "Write your article here." } }] });
    if (kind === "quiz") await admin.from("quizzes").insert({ item_id: item.id });
    await audit({ actorId: viewer.user.id, action: "item.create", resourceType: "item", resourceId: item.id, after: { kind, sectionId } });
    revalidateCourse(courseId);
    return { id: item.id };
  });
}

const itemPatchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  summary: z.string().trim().max(500).nullable().optional(),
  required: z.boolean().optional(),
  is_preview: z.boolean().optional(),
  estimated_minutes: z.number().int().min(0).max(600).nullable().optional(),
  lab_id: z.string().uuid().nullable().optional(),
  section_id: z.string().uuid().optional(),
});

export async function updateItem(itemId: string, patch: z.infer<typeof itemPatchSchema>): Promise<ActionResult> {
  return guard(async () => {
    const viewer = await requireStaff();
    const courseId = await courseIdForItem(itemId);
    await assertCourseEditor(viewer, courseId);
    const clean = itemPatchSchema.parse(patch);
    const admin = createAdminClient();
    if (clean.section_id) {
      const target = await courseIdForSection(clean.section_id);
      if (target !== courseId) throw new StudioError("Items can only move within the same course");
      const { data: last } = await admin.from("items").select("position").eq("section_id", clean.section_id).order("position", { ascending: false }).limit(1).maybeSingle<{ position: number }>();
      Object.assign(clean, { position: (last?.position ?? -1) + 1 });
    }
    const { error } = await admin.from("items").update(clean).eq("id", itemId);
    if (error) throw new StudioError(error.message);
    revalidateCourse(courseId);
  });
}

export async function deleteItem(itemId: string): Promise<ActionResult> {
  return guard(async () => {
    const viewer = await requireStaff();
    const courseId = await courseIdForItem(itemId);
    await assertCourseEditor(viewer, courseId);
    const { error } = await createAdminClient().from("items").delete().eq("id", itemId);
    if (error) throw new StudioError(error.message);
    await audit({ actorId: viewer.user.id, action: "item.delete", resourceType: "item", resourceId: itemId });
    revalidateCourse(courseId);
  });
}

export async function moveItem(itemId: string, direction: -1 | 1): Promise<ActionResult> {
  return guard(async () => {
    const viewer = await requireStaff();
    const courseId = await courseIdForItem(itemId);
    await assertCourseEditor(viewer, courseId);
    const admin = createAdminClient();
    const { data: item } = await admin.from("items").select("section_id").eq("id", itemId).single<{ section_id: string }>();
    const { data } = await admin.from("items").select("id, position").eq("section_id", item!.section_id);
    await swapPositions("items", data ?? [], itemId, direction);
    revalidateCourse(courseId);
  });
}

// ═══ Articles ═══════════════════════════════════════════════════════════════
export async function saveArticle(itemId: string, blocks: unknown): Promise<ActionResult<{ readingMinutes: number }>> {
  return guard(async () => {
    const viewer = await requireStaff();
    const courseId = await courseIdForItem(itemId);
    await assertCourseEditor(viewer, courseId);
    const parsed = parseBlocks(blocks);
    if (parsed.errors.length) throw new StudioError(parsed.errors.join("; "));
    const readingMinutes = estimateReadingMinutes(parsed.blocks);
    const admin = createAdminClient();
    const { error } = await admin.from("articles").upsert({ item_id: itemId, blocks: parsed.blocks, reading_minutes: readingMinutes });
    if (error) throw new StudioError(error.message);
    await admin.from("items").update({ estimated_minutes: readingMinutes }).eq("id", itemId).is("estimated_minutes", null);
    revalidateCourse(courseId);
    return { readingMinutes };
  });
}

// ═══ Quizzes ════════════════════════════════════════════════════════════════
const questionInput = z.object({
  id: z.string().uuid().optional(),
  type: z.enum(["single", "multiple", "text", "code_output"]),
  prompt: z.string().trim().min(1, "Every question needs a prompt").max(5000),
  code: z.string().max(5000).nullable().optional(),
  code_language: z.string().max(40).nullable().optional(),
  options: z.array(z.object({ id: z.string().min(1).max(40), text: z.string().trim().min(1, "Options cannot be empty").max(1000) })).max(10),
  points: z.number().int().min(1).max(100),
  correct: z.array(z.string()).default([]),
  accepted: z.array(z.string()).default([]),
  caseSensitive: z.boolean().default(false),
  explanation: z.string().max(5000).nullable().optional(),
});

const quizInput = z.object({
  pass_score: z.number().int().min(0).max(100),
  shuffle_questions: z.boolean(),
  max_attempts: z.number().int().min(1).max(100).nullable(),
  show_answers: z.boolean(),
  questions: z.array(questionInput).max(100),
});

export type QuizInput = z.input<typeof quizInput>;

export async function saveQuiz(itemId: string, input: QuizInput): Promise<ActionResult> {
  return guard(async () => {
    const viewer = await requireStaff();
    const courseId = await courseIdForItem(itemId);
    await assertCourseEditor(viewer, courseId);
    const quiz = quizInput.parse(input);
    quiz.questions.forEach((q, i) => {
      if ((q.type === "single" || q.type === "multiple") && q.options.length < 2) throw new StudioError(`Question ${i + 1}: add at least two options`);
      if (q.type === "single" && q.correct.length !== 1) throw new StudioError(`Question ${i + 1}: pick exactly one correct option`);
      if (q.type === "multiple" && q.correct.length < 1) throw new StudioError(`Question ${i + 1}: pick at least one correct option`);
      if ((q.type === "text" || q.type === "code_output") && !q.accepted.filter((a) => a.trim()).length) throw new StudioError(`Question ${i + 1}: add at least one accepted answer`);
    });

    const admin = createAdminClient();
    await admin.from("quizzes").upsert({
      item_id: itemId,
      pass_score: quiz.pass_score,
      shuffle_questions: quiz.shuffle_questions,
      max_attempts: quiz.max_attempts,
      show_answers: quiz.show_answers,
    });

    const { data: existing } = await admin.from("questions").select("id").eq("item_id", itemId);
    const keep = new Set(quiz.questions.map((q) => q.id).filter(Boolean));
    const remove = (existing ?? []).map((q: { id: string }) => q.id).filter((id) => !keep.has(id));
    if (remove.length) await admin.from("questions").delete().in("id", remove);

    for (const [position, q] of quiz.questions.entries()) {
      const row = {
        item_id: itemId,
        position,
        type: q.type,
        prompt: q.prompt,
        code: q.code || null,
        code_language: q.code_language || null,
        options: q.type === "single" || q.type === "multiple" ? q.options : [],
        points: q.points,
      };
      const { data: saved, error } = q.id
        ? await admin.from("questions").update(row).eq("id", q.id).select("id").single<{ id: string }>()
        : await admin.from("questions").insert(row).select("id").single<{ id: string }>();
      if (error || !saved) throw new StudioError(error?.message ?? "Could not save a question");
      const answer =
        q.type === "single" || q.type === "multiple"
          ? { correct: q.correct.filter((c) => q.options.some((o) => o.id === c)) }
          : { accepted: q.accepted.map((a) => a.trim()).filter(Boolean), caseSensitive: q.caseSensitive };
      await admin.from("question_keys").upsert({ question_id: saved.id, answer, explanation: q.explanation || null });
    }
    await audit({ actorId: viewer.user.id, action: "quiz.save", resourceType: "item", resourceId: itemId, after: { questions: quiz.questions.length } });
    revalidateCourse(courseId);
  });
}

// ═══ Labs ═══════════════════════════════════════════════════════════════════
async function validateRefs(spec: LabSpec): Promise<string[]> {
  const admin = createAdminClient();
  const errors: string[] = [];
  if (spec.runtime.type === "compile") {
    const { data } = await admin.from("compile_languages").select("slug").eq("slug", spec.runtime.language).maybeSingle();
    if (!data) errors.push(`runtime.language: "${spec.runtime.language}" is not a configured language`);
  } else {
    const [slug, version] = spec.runtime.image.split(":");
    let q = admin.from("sandbox_images").select("id").eq("slug", slug);
    if (version) q = q.eq("version", Number(version));
    const { data } = await q.limit(1).maybeSingle();
    if (!data) errors.push(`runtime.image: "${spec.runtime.image}" is not a registered sandbox image`);
    for (const step of spec.steps) {
      for (const c of step.checks) {
        if (c.type === "challenge.answer" && !CHALLENGE_GENERATORS.includes(c.generator)) {
          errors.push(`steps.${step.id}: unknown challenge generator "${c.generator}" (available: ${CHALLENGE_GENERATORS.join(", ")})`);
        }
      }
    }
  }
  return errors;
}

async function resolveImageId(spec: LabSpec): Promise<string | null> {
  if (spec.runtime.type !== "terminal") return null;
  const [slug, version] = spec.runtime.image.split(":");
  let q = createAdminClient().from("sandbox_images").select("id").eq("slug", slug).eq("status", "active");
  q = version ? q.eq("version", Number(version)) : q.order("version", { ascending: false });
  const { data } = await q.limit(1).maybeSingle<{ id: string }>();
  return data?.id ?? null;
}

export async function createLab(formData: FormData): Promise<void> {
  const viewer = await requireStaff();
  const runtime = formData.get("runtime") === "compile" ? "compile" : "terminal";
  const title = String(formData.get("title") ?? "").trim() || (runtime === "compile" ? "New coding exercise" : "New terminal lab");
  const slug = await uniqueSlug("labs", slugify(title));
  const template = runtime === "compile" ? COMPILE_LAB_TEMPLATE : TERMINAL_LAB_TEMPLATE;
  const doc = YAML.parseDocument(template);
  doc.setIn(["metadata", "slug"], slug);
  doc.setIn(["metadata", "title"], title);
  const yaml = doc.toString();
  const parsed = parseLabYaml(yaml);
  if (!parsed.ok) throw new Error(parsed.errors.join("; "));

  const admin = createAdminClient();
  const { data: lab, error } = await admin.from("labs").insert({ slug, title, runtime_type: runtime, owner_id: viewer.user.id }).select("id").single<{ id: string }>();
  if (error || !lab) throw new Error(error?.message ?? "Could not create lab");
  const { data: version } = await admin
    .from("lab_versions")
    .insert({
      lab_id: lab.id,
      version: 1,
      spec_yaml: yaml,
      spec: parsed.spec,
      runtime_type: runtime,
      language: parsed.spec.runtime.type === "compile" ? parsed.spec.runtime.language : null,
      sandbox_image_id: await resolveImageId(parsed.spec),
      created_by: viewer.user.id,
    })
    .select("id")
    .single<{ id: string }>();
  if (version) await admin.from("labs").update({ current_version_id: version.id }).eq("id", lab.id);
  await audit({ actorId: viewer.user.id, action: "lab.create", resourceType: "lab", resourceId: lab.id, after: { slug, runtime } });

  const itemId = String(formData.get("itemId") ?? "");
  if (itemId) {
    const courseId = await courseIdForItem(itemId);
    await assertCourseEditor(viewer, courseId);
    await admin.from("items").update({ lab_id: lab.id }).eq("id", itemId);
  }
  revalidatePath("/studio", "layout");
  redirect(`/studio/labs/${lab.id}`);
}

export async function saveLabVersion(labId: string, yaml: string): Promise<ActionResult<{ version: number }>> {
  const viewer = await requireStaff();
  let lab;
  try {
    lab = await assertLabEditor(viewer, labId);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  if (yaml.length > 500_000) return { ok: false, error: "The lab spec is too large (500 KB max)" };
  const parsed = parseLabYaml(yaml);
  if (!parsed.ok) return { ok: false, error: "The lab spec has errors", errors: parsed.errors };
  const spec = parsed.spec;
  const errors: string[] = [];
  if (spec.metadata.slug !== lab.slug) errors.push(`metadata.slug must stay "${lab.slug}"`);
  if (spec.runtime.type !== lab.runtime_type) errors.push(`runtime.type must stay "${lab.runtime_type}" (create a new lab to switch runtimes)`);
  errors.push(...(await validateRefs(spec)));
  if (errors.length) return { ok: false, error: "The lab spec has errors", errors };

  return guard(async () => {
    const admin = createAdminClient();
    const { data: last } = await admin.from("lab_versions").select("version").eq("lab_id", labId).order("version", { ascending: false }).limit(1).maybeSingle<{ version: number }>();
    const nextVersion = (last?.version ?? 0) + 1;
    const { data: version, error } = await admin
      .from("lab_versions")
      .insert({
        lab_id: labId,
        version: nextVersion,
        spec_yaml: yaml,
        spec,
        runtime_type: spec.runtime.type,
        language: spec.runtime.type === "compile" ? spec.runtime.language : null,
        sandbox_image_id: await resolveImageId(spec),
        created_by: viewer.user.id,
      })
      .select("id")
      .single<{ id: string }>();
    if (error || !version) throw new StudioError(error?.message ?? "Could not save the version");
    await admin.from("labs").update({ current_version_id: version.id, title: spec.metadata.title }).eq("id", labId);
    await audit({ actorId: viewer.user.id, action: "lab.publish_version", resourceType: "lab", resourceId: labId, after: { version: nextVersion } });
    revalidatePath("/studio", "layout");
    return { version: nextVersion };
  });
}

export async function setLabVersion(labId: string, versionId: string): Promise<ActionResult> {
  return guard(async () => {
    const viewer = await requireStaff();
    await assertLabEditor(viewer, labId);
    const admin = createAdminClient();
    const { data: v } = await admin.from("lab_versions").select("id, version, spec").eq("id", versionId).eq("lab_id", labId).maybeSingle<{ id: string; version: number; spec: LabSpec }>();
    if (!v) throw new StudioError("Version not found");
    await admin.from("labs").update({ current_version_id: v.id, title: v.spec.metadata.title }).eq("id", labId);
    await audit({ actorId: viewer.user.id, action: "lab.rollback", resourceType: "lab", resourceId: labId, after: { version: v.version } });
    revalidatePath("/studio", "layout");
  });
}

export async function deleteLab(labId: string): Promise<ActionResult> {
  return guard(async () => {
    const viewer = await requireAdmin();
    const lab = await assertLabEditor(viewer, labId);
    const { error } = await createAdminClient().from("labs").delete().eq("id", labId);
    if (error) throw new StudioError(error.message);
    await audit({ actorId: viewer.user.id, action: "lab.delete", resourceType: "lab", resourceId: labId, before: lab });
    revalidatePath("/studio", "layout");
  });
}

// ═══ Learners & access (admin) ══════════════════════════════════════════════
export async function setUserRole(userId: string, role: "student" | "instructor" | "admin"): Promise<ActionResult> {
  return guard(async () => {
    const viewer = await requireAdmin();
    if (userId === viewer.user.id && role !== "admin") throw new StudioError("You cannot remove your own admin role");
    const admin = createAdminClient();
    const { data: before } = await admin.from("profiles").select("role").eq("id", userId).maybeSingle();
    const { error } = await admin.from("profiles").update({ role }).eq("id", userId);
    if (error) throw new StudioError(error.message);
    await audit({ actorId: viewer.user.id, action: "user.set_role", resourceType: "profile", resourceId: userId, before, after: { role } });
    revalidatePath("/studio/learners");
  });
}

export async function grantAccess(userId: string, scope: "course" | "catalog", courseId: string | null, endsAt: string | null, note: string): Promise<ActionResult> {
  return guard(async () => {
    const viewer = await requireAdmin();
    if (scope === "course" && !courseId) throw new StudioError("Pick a course");
    const admin = createAdminClient();
    const row = {
      user_id: userId,
      scope_type: scope,
      course_id: scope === "course" ? courseId : null,
      source: "admin_grant",
      ends_at: endsAt ? new Date(endsAt).toISOString() : null,
      note: note.trim() || null,
      granted_by: viewer.user.id,
    };
    const { error } = await admin.from("entitlements").insert(row);
    if (error) throw new StudioError(error.message);
    if (scope === "course" && courseId) await enroll(userId, courseId, "admin_grant");
    await audit({ actorId: viewer.user.id, action: "entitlement.grant", resourceType: "profile", resourceId: userId, after: row });
    revalidatePath("/studio/learners");
  });
}

export async function revokeEntitlement(entitlementId: string): Promise<ActionResult> {
  return guard(async () => {
    const viewer = await requireAdmin();
    const { error } = await createAdminClient().from("entitlements").update({ status: "revoked" }).eq("id", entitlementId);
    if (error) throw new StudioError(error.message);
    await audit({ actorId: viewer.user.id, action: "entitlement.revoke", resourceType: "entitlement", resourceId: entitlementId });
    revalidatePath("/studio/learners");
  });
}

// ═══ Platform settings (admin) ══════════════════════════════════════════════
export async function updateLanguage(slug: string, patch: { provider_language_id: number; enabled: boolean; label: string; default_limits: { cpuSeconds: number; wallSeconds: number; memoryMiB: number } }): Promise<ActionResult> {
  return guard(async () => {
    const viewer = await requireAdmin();
    const clean = z
      .object({
        provider_language_id: z.number().int().positive(),
        enabled: z.boolean(),
        label: z.string().trim().min(1).max(80),
        default_limits: z.object({ cpuSeconds: z.number().positive().max(15), wallSeconds: z.number().positive().max(20), memoryMiB: z.number().int().positive().max(256) }),
      })
      .parse(patch);
    const { error } = await createAdminClient().from("compile_languages").update(clean).eq("slug", slug);
    if (error) throw new StudioError(error.message);
    await audit({ actorId: viewer.user.id, action: "language.update", resourceType: "compile_language", resourceId: slug, after: clean });
    revalidatePath("/studio/settings");
  });
}

export async function fetchProviderLanguages(): Promise<ActionResult<{ id: number; name: string }[]>> {
  return guard(async () => {
    await requireAdmin();
    return (await getCompiler().languages()).sort((a, b) => a.name.localeCompare(b.name));
  });
}

export async function addSandboxImage(input: { slug: string; version: number; url: string; image_type: "cloud" | "bytes" | "github"; sha256?: string; notes?: string }): Promise<ActionResult> {
  return guard(async () => {
    const viewer = await requireAdmin();
    const clean = z
      .object({
        slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
        version: z.number().int().positive(),
        url: z.string().regex(/^(https|wss):\/\/|^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//, "URL must start with https:// or wss:// (http://localhost for local testing)"),
        image_type: z.enum(["cloud", "bytes", "github"]),
        sha256: z.string().regex(/^[a-f0-9]{64}$/i).optional().or(z.literal("")),
        notes: z.string().max(500).optional(),
      })
      .parse(input);
    const { error } = await createAdminClient().from("sandbox_images").insert({ ...clean, sha256: clean.sha256 || null });
    if (error) throw new StudioError(error.message.includes("duplicate") ? "That slug and version already exist — images are immutable, bump the version" : error.message);
    await audit({ actorId: viewer.user.id, action: "sandbox_image.add", resourceType: "sandbox_image", resourceId: `${clean.slug}:${clean.version}`, after: clean });
    revalidatePath("/studio/settings");
  });
}

export async function setImageStatus(id: string, status: "active" | "retired"): Promise<ActionResult> {
  return guard(async () => {
    const viewer = await requireAdmin();
    const { error } = await createAdminClient().from("sandbox_images").update({ status }).eq("id", id);
    if (error) throw new StudioError(error.message);
    await audit({ actorId: viewer.user.id, action: `sandbox_image.${status}`, resourceType: "sandbox_image", resourceId: id });
    revalidatePath("/studio/settings");
  });
}

// ═══ Billing and AI tutor (admin) ═══════════════════════════════════════════
/**
 * Put a monthly all-access plan on sale. Either creates a new Razorpay Plan
 * (plans are immutable there, so a price change is a new plan) or links one
 * made in the Razorpay Dashboard. Existing subscribers stay on their plan.
 */
export async function setBillingPlan(input: { mode: "create"; name: string; amountRupees: number } | { mode: "link"; planId: string }): Promise<ActionResult> {
  return guard(async () => {
    const viewer = await requireAdmin();
    if (!serverEnv.razorpayConfigured()) throw new StudioError("Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET first.");
    let plan: { id: string; name: string; amountPaise: number };
    if (input.mode === "create") {
      const clean = z.object({ name: z.string().trim().min(2).max(80), amountRupees: z.number().int().min(1).max(100000) }).parse(input);
      const remote = await razorpay.createPlan({ name: clean.name, amountPaise: clean.amountRupees * 100, description: "Every course, billed monthly" });
      plan = { id: remote.id, name: clean.name, amountPaise: remote.item.amount };
    } else {
      const planId = z.string().trim().regex(/^plan_[A-Za-z0-9]+$/, "Razorpay plan ids look like plan_XXXXXXXX").parse(input.planId);
      const remote = await razorpay.fetchPlan(planId);
      if (remote.period !== "monthly" || remote.interval !== 1) throw new StudioError("That plan isn't billed every month.");
      if (remote.item.currency !== "INR") throw new StudioError("Only INR plans are supported.");
      plan = { id: remote.id, name: remote.item.name, amountPaise: remote.item.amount };
    }
    const admin = createAdminClient();
    await admin.from("billing_plans").update({ active: false }).eq("active", true);
    const { error } = await admin.from("billing_plans").upsert(
      { provider_plan_id: plan.id, name: plan.name, amount_paise: plan.amountPaise, interval: "month", active: true, created_by: viewer.user.id },
      { onConflict: "provider,provider_plan_id" },
    );
    if (error) throw new StudioError(error.message);
    await audit({ actorId: viewer.user.id, action: "billing_plan.activate", resourceType: "billing_plan", resourceId: plan.id, after: plan });
    revalidatePath("/studio/settings");
    revalidatePath("/pricing");
  });
}

export async function stopSellingPlan(): Promise<ActionResult> {
  return guard(async () => {
    const viewer = await requireAdmin();
    await createAdminClient().from("billing_plans").update({ active: false }).eq("active", true);
    await audit({ actorId: viewer.user.id, action: "billing_plan.deactivate", resourceType: "billing_plan" });
    revalidatePath("/studio/settings");
    revalidatePath("/pricing");
  });
}

export async function updateAiTutorSettings(input: { enabled: boolean; dailyLimit: number }): Promise<ActionResult> {
  return guard(async () => {
    const viewer = await requireAdmin();
    const clean = z.object({ enabled: z.boolean(), dailyLimit: z.number().int().min(0).max(1000) }).parse(input);
    await saveAppSetting("ai_tutor", clean, viewer.user.id);
    await audit({ actorId: viewer.user.id, action: "ai_tutor.settings", resourceType: "app_settings", resourceId: "ai_tutor", after: clean });
    revalidatePath("/studio/settings");
  });
}
