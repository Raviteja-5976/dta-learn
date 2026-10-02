/**
 * Seed demo content: lab specs from labs/<slug>/lab.yaml and the courses in
 * content/courses.ts.
 *
 *   npm run seed            # create what's missing (safe to re-run)
 *   npm run seed -- --force # delete and recreate the demo courses
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (read from .env.local).
 * Optional: SEED_OWNER_EMAIL — the instructor who owns the demo content.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { parseLabYaml, type LabSpec } from "../src/lib/labs/spec";
import { estimateReadingMinutes, parseBlocks } from "../src/lib/blocks/schema";
import { courses, type SeedCourse } from "../content/courses";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local first.");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });
const force = process.argv.includes("--force");

function check<T>(res: { data: T; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
}

async function ownerId(): Promise<string | null> {
  const email = process.env.SEED_OWNER_EMAIL;
  if (!email) return null;
  const { data } = await db.from("profiles").select("id").eq("email", email).maybeSingle();
  if (!data) console.warn(`  ! SEED_OWNER_EMAIL ${email} has no profile yet (sign up first); content will have no owner.`);
  return (data as { id: string } | null)?.id ?? null;
}

async function imageIdFor(spec: LabSpec): Promise<string | null> {
  if (spec.runtime.type !== "terminal") return null;
  const [slug, version] = spec.runtime.image.split(":");
  let q = db.from("sandbox_images").select("id").eq("slug", slug);
  q = version ? q.eq("version", Number(version)) : q.order("version", { ascending: false });
  const { data } = await q.limit(1).maybeSingle();
  if (!data) throw new Error(`Sandbox image "${spec.runtime.image}" is not registered (run the migrations first).`);
  return (data as { id: string }).id;
}

async function seedLabs(owner: string | null): Promise<Map<string, string>> {
  const dir = path.join(process.cwd(), "labs");
  const slugs = (await readdir(dir, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);
  const ids = new Map<string, string>();

  for (const slug of slugs) {
    const yaml = await readFile(path.join(dir, slug, "lab.yaml"), "utf8");
    const parsed = parseLabYaml(yaml);
    if (!parsed.ok) throw new Error(`labs/${slug}/lab.yaml is invalid:\n  ${parsed.errors.join("\n  ")}`);
    const spec = parsed.spec;
    if (spec.metadata.slug !== slug) throw new Error(`labs/${slug}: metadata.slug must equal the folder name`);

    let { data: lab } = await db.from("labs").select("id, current_version_id").eq("slug", slug).maybeSingle<{ id: string; current_version_id: string | null }>();
    if (!lab) {
      lab = check(
        await db.from("labs").insert({ slug, title: spec.metadata.title, runtime_type: spec.runtime.type, owner_id: owner }).select("id, current_version_id").single(),
        `insert lab ${slug}`,
      ) as { id: string; current_version_id: string | null };
    }
    const { data: latest } = await db.from("lab_versions").select("id, version, spec_yaml").eq("lab_id", lab.id).order("version", { ascending: false }).limit(1).maybeSingle<{ id: string; version: number; spec_yaml: string }>();

    if (latest && latest.spec_yaml === yaml) {
      console.log(`  = lab ${slug} v${latest.version} (unchanged)`);
    } else {
      const version = (latest?.version ?? 0) + 1;
      const row = check(
        await db
          .from("lab_versions")
          .insert({
            lab_id: lab.id,
            version,
            spec_yaml: yaml,
            spec,
            runtime_type: spec.runtime.type,
            language: spec.runtime.type === "compile" ? spec.runtime.language : null,
            sandbox_image_id: await imageIdFor(spec),
            created_by: owner,
          })
          .select("id")
          .single(),
        `insert lab version ${slug}`,
      ) as { id: string };
      check(await db.from("labs").update({ current_version_id: row.id, title: spec.metadata.title }).eq("id", lab.id), "set current version");
      console.log(`  + lab ${slug} v${version}`);
    }
    ids.set(slug, lab.id);
  }
  return ids;
}

async function seedCourse(c: SeedCourse, labIds: Map<string, string>, owner: string | null) {
  const { data: existing } = await db.from("courses").select("id").eq("slug", c.slug).maybeSingle<{ id: string }>();
  if (existing && !force) {
    console.log(`  = course ${c.slug} exists (use --force to recreate)`);
    return;
  }
  if (existing) check(await db.from("courses").delete().eq("id", existing.id), "delete course");

  const course = check(
    await db
      .from("courses")
      .insert({
        slug: c.slug,
        title: c.title,
        subtitle: c.subtitle,
        description: c.description.trim(),
        level: c.level,
        tags: c.tags,
        skills: c.skills,
        estimated_hours: c.hours,
        is_free: c.isFree,
        price_paise: c.isFree ? null : c.pricePaise ?? null,
        status: "published",
        published_at: new Date().toISOString(),
        owner_id: owner,
      })
      .select("id")
      .single(),
    `insert course ${c.slug}`,
  ) as { id: string };

  for (const [si, s] of c.sections.entries()) {
    const section = check(
      await db.from("sections").insert({ course_id: course.id, title: s.title, description: s.description ?? null, position: si }).select("id").single(),
      "insert section",
    ) as { id: string };

    for (const [ii, it] of s.items.entries()) {
      const labId = it.kind === "lab" ? labIds.get(it.lab) : null;
      if (it.kind === "lab" && !labId) throw new Error(`Course ${c.slug} references unknown lab "${it.lab}"`);
      const item = check(
        await db
          .from("items")
          .insert({
            course_id: course.id,
            section_id: section.id,
            kind: it.kind,
            title: it.title,
            summary: it.summary ?? null,
            position: ii,
            required: it.kind === "lab" ? it.required ?? true : true,
            is_preview: "preview" in it ? Boolean(it.preview) : false,
            estimated_minutes: "minutes" in it ? it.minutes ?? null : null,
            lab_id: labId ?? null,
          })
          .select("id")
          .single(),
        "insert item",
      ) as { id: string };

      if (it.kind === "article") {
        const blocks = it.blocks.map((b, bi) => ({ ...b, id: `b${bi + 1}`, v: 1 }));
        const parsed = parseBlocks(blocks);
        if (parsed.errors.length) throw new Error(`Article "${it.title}": ${parsed.errors.join("; ")}`);
        check(await db.from("articles").insert({ item_id: item.id, blocks: parsed.blocks, reading_minutes: estimateReadingMinutes(parsed.blocks) }), "insert article");
      }

      if (it.kind === "quiz") {
        check(await db.from("quizzes").insert({ item_id: item.id, pass_score: it.passScore ?? 70 }), "insert quiz");
        for (const [qi, q] of it.questions.entries()) {
          const options = q.type === "single" || q.type === "multiple" ? q.options.map((text, oi) => ({ id: String.fromCharCode(97 + oi), text })) : [];
          const question = check(
            await db
              .from("questions")
              .insert({ item_id: item.id, position: qi, type: q.type, prompt: q.prompt, code: q.code ?? null, code_language: q.codeLanguage ?? null, options })
              .select("id")
              .single(),
            "insert question",
          ) as { id: string };
          const answer =
            "correct" in q
              ? { correct: q.correct.map((i) => options[i].id) }
              : { accepted: q.accepted, caseSensitive: q.caseSensitive ?? false };
          check(await db.from("question_keys").insert({ question_id: question.id, answer, explanation: q.explanation ?? null }), "insert answer key");
        }
      }
    }
  }
  console.log(`  + course ${c.slug}`);
}

async function main() {
  console.log("Seeding DevTrackAcademy Learn demo content…");
  const owner = await ownerId();
  console.log("Labs:");
  const labIds = await seedLabs(owner);
  console.log("Courses:");
  for (const c of courses) await seedCourse(c, labIds, owner);
  console.log("Done.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
