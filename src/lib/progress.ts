import "server-only";
import { createHash, randomInt } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/server";
import { logEvent } from "@/lib/events";
import { generateCertificateCode } from "@/lib/certificate-code";
import type { Course, Item, ItemProgress, Profile } from "@/lib/types";

/**
 * Progress and completion (design §2, §22). Item completion rules:
 *   article → learner marks it read           (evidence: self)
 *   quiz    → score ≥ pass score              (evidence: server)
 *   lab     → every graded step passed        (evidence: server for compile, client for terminal)
 * A course is complete when all REQUIRED items are complete; completion is
 * evaluated on the server whenever an item changes state.
 */

export type Evidence = "server" | "client" | "self";

export async function touchItem(userId: string, item: Pick<Item, "id" | "course_id">): Promise<void> {
  const admin = createAdminClient();
  await Promise.all([
    admin
      .from("enrollments")
      .update({ last_item_id: item.id, last_activity_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("course_id", item.course_id),
    admin
      .from("item_progress")
      .upsert(
        { user_id: userId, item_id: item.id, course_id: item.course_id, status: "in_progress" },
        { onConflict: "user_id,item_id", ignoreDuplicates: true },
      ),
  ]);
}

export interface CompletionOutcome {
  newlyCompleted: boolean;
  courseCompleted: boolean;
  certificateCode: string | null;
}

export async function completeItem(
  userId: string,
  item: Pick<Item, "id" | "course_id" | "kind">,
  opts: { score?: number | null; evidence: Evidence },
): Promise<CompletionOutcome> {
  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("item_progress")
    .select("*")
    .eq("user_id", userId)
    .eq("item_id", item.id)
    .maybeSingle<ItemProgress>();

  const alreadyDone = existing?.status === "completed";
  const bestScore =
    opts.score == null ? existing?.score ?? null : existing?.score != null ? Math.max(Number(existing.score), opts.score) : opts.score;

  await admin.from("item_progress").upsert(
    {
      user_id: userId,
      item_id: item.id,
      course_id: item.course_id,
      status: "completed",
      score: bestScore,
      // Server evidence outranks client or self evidence.
      evidence: existing?.evidence === "server" ? "server" : opts.evidence,
      completed_at: existing?.completed_at ?? new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,item_id" },
  );

  if (!alreadyDone) {
    await logEvent({ actorId: userId, verb: "completed", objectType: item.kind, objectId: item.id, result: { score: opts.score ?? null, evidence: opts.evidence } });
  }

  const course = await evaluateCourseCompletion(userId, item.course_id);
  return { newlyCompleted: !alreadyDone, ...course };
}

/** Record a non-completing score (e.g. a failed quiz) without regressing a completed item. */
export async function recordAttemptScore(userId: string, item: Pick<Item, "id" | "course_id">, score: number): Promise<void> {
  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("item_progress")
    .select("status, score")
    .eq("user_id", userId)
    .eq("item_id", item.id)
    .maybeSingle<Pick<ItemProgress, "status" | "score">>();
  if (existing?.status === "completed") return;
  await admin.from("item_progress").upsert(
    {
      user_id: userId,
      item_id: item.id,
      course_id: item.course_id,
      status: "in_progress",
      score: existing?.score != null ? Math.max(Number(existing.score), score) : score,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,item_id" },
  );
}

export interface CourseProgress {
  completed: Set<string>;
  inProgress: Set<string>;
  total: number;
  completedCount: number;
  requiredTotal: number;
  requiredCompleted: number;
  percent: number;
}

export async function getCourseProgress(userId: string, courseId: string, items?: Pick<Item, "id" | "required">[]): Promise<CourseProgress> {
  const admin = createAdminClient();
  const [itemsRes, progressRes] = await Promise.all([
    items ? Promise.resolve({ data: items }) : admin.from("items").select("id, required").eq("course_id", courseId),
    admin.from("item_progress").select("item_id, status").eq("user_id", userId).eq("course_id", courseId),
  ]);
  const all = (itemsRes.data ?? []) as Pick<Item, "id" | "required">[];
  const ids = new Set(all.map((i) => i.id));
  const completed = new Set<string>();
  const inProgress = new Set<string>();
  for (const p of (progressRes.data ?? []) as Pick<ItemProgress, "item_id" | "status">[]) {
    if (!ids.has(p.item_id)) continue;
    (p.status === "completed" ? completed : inProgress).add(p.item_id);
  }
  const required = all.filter((i) => i.required);
  const requiredCompleted = required.filter((i) => completed.has(i.id)).length;
  return {
    completed,
    inProgress,
    total: all.length,
    completedCount: completed.size,
    requiredTotal: required.length,
    requiredCompleted,
    percent: all.length ? Math.round((completed.size / all.length) * 100) : 0,
  };
}

async function evaluateCourseCompletion(userId: string, courseId: string): Promise<{ courseCompleted: boolean; certificateCode: string | null }> {
  const admin = createAdminClient();
  const progress = await getCourseProgress(userId, courseId);
  if (progress.requiredTotal === 0 || progress.requiredCompleted < progress.requiredTotal) {
    return { courseCompleted: false, certificateCode: null };
  }

  const { data: enrollment } = await admin
    .from("enrollments")
    .select("id, completed_at")
    .eq("user_id", userId)
    .eq("course_id", courseId)
    .maybeSingle<{ id: string; completed_at: string | null }>();
  if (enrollment && !enrollment.completed_at) {
    await admin.from("enrollments").update({ completed_at: new Date().toISOString() }).eq("id", enrollment.id);
    await logEvent({ actorId: userId, verb: "completed", objectType: "course", objectId: courseId });
  }
  const code = await issueCertificate(userId, courseId);
  return { courseCompleted: true, certificateCode: code };
}

// ── Certificates (design §22) ─────────────────────────────────────────────
async function issueCertificate(userId: string, courseId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("certificates")
    .select("public_code")
    .eq("user_id", userId)
    .eq("course_id", courseId)
    .maybeSingle<{ public_code: string }>();
  if (existing) return existing.public_code;

  const [{ data: profile }, { data: course }, { data: progress }] = await Promise.all([
    admin.from("profiles").select("full_name, email").eq("id", userId).single<Pick<Profile, "full_name" | "email">>(),
    admin.from("courses").select("title, skills, estimated_hours").eq("id", courseId).single<Pick<Course, "title" | "skills" | "estimated_hours">>(),
    admin.from("item_progress").select("evidence, status").eq("user_id", userId).eq("course_id", courseId).eq("status", "completed"),
  ]);
  if (!profile || !course) return null;

  const evidence = { serverVerified: 0, selfVerified: 0, items: 0 };
  for (const p of (progress ?? []) as { evidence: Evidence | null }[]) {
    evidence.items++;
    if (p.evidence === "server") evidence.serverVerified++;
    else evidence.selfVerified++;
  }

  const recipientName = profile.full_name?.trim() || profile.email.split("@")[0];
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = generateCertificateCode(randomInt);
    const issuedAt = new Date().toISOString();
    const payload = { code, recipientName, course: course.title, courseId, skills: course.skills, hours: course.estimated_hours, issuedAt };
    const payloadHash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
    const { error } = await admin.from("certificates").insert({
      public_code: code,
      user_id: userId,
      course_id: courseId,
      recipient_name: recipientName,
      course_title: course.title,
      skills: course.skills,
      hours: course.estimated_hours,
      evidence,
      payload_hash: payloadHash,
      issued_at: issuedAt,
    });
    if (!error) {
      await logEvent({ actorId: userId, verb: "earned", objectType: "certificate", objectId: code, context: { courseId } });
      return code;
    }
    if (!/public_code/.test(error.message)) {
      // A concurrent request already issued one (unique user_id, course_id).
      const { data } = await admin.from("certificates").select("public_code").eq("user_id", userId).eq("course_id", courseId).maybeSingle<{ public_code: string }>();
      return data?.public_code ?? null;
    }
  }
  return null;
}
