import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { attachCounts, type CourseSummary } from "@/lib/catalog";
import { serverEnv } from "@/lib/env";
import type { Certificate, Course, Enrollment, Item } from "@/lib/types";

export interface DashboardCourse {
  course: CourseSummary;
  enrollment: Enrollment;
  percent: number;
  completed: number;
  total: number;
  nextItem: Pick<Item, "id" | "title" | "kind"> | null;
  lastItem: Pick<Item, "id" | "title" | "kind"> | null;
}

export interface DashboardLab {
  attemptId: string;
  title: string;
  runtime: "terminal" | "compile";
  status: string;
  stepsPassed: number;
  stepsTotal: number;
  href: string | null;
  updatedAt: string;
}

export interface DashboardData {
  courses: DashboardCourse[];
  labs: DashboardLab[];
  certificates: Certificate[];
  streak: { current: number; best: number; days: string[] };
  skills: { name: string; percent: number }[];
  activity: { verb: string; objectType: string; label: string; at: string; result: Record<string, unknown> | null }[];
  runsToday: number;
  runsPerDay: number;
  recommended: CourseSummary[];
}

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

export async function loadDashboard(userId: string): Promise<DashboardData> {
  const admin = createAdminClient();
  const since60 = new Date(Date.now() - 60 * 86_400_000).toISOString();
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const [enrollRes, progressRes, attemptsRes, certRes, eventsRes, runsRes, publishedRes] = await Promise.all([
    admin.from("enrollments").select("*").eq("user_id", userId).order("last_activity_at", { ascending: false }),
    admin.from("item_progress").select("item_id, course_id, status, completed_at").eq("user_id", userId),
    admin.from("lab_attempts").select("id, lab_version_id, item_id, course_id, runtime_type, status, steps_passed, updated_at").eq("user_id", userId).neq("status", "closed").order("updated_at", { ascending: false }).limit(12),
    admin.from("certificates").select("*").eq("user_id", userId).order("issued_at", { ascending: false }),
    admin.from("learning_events").select("verb, object_type, object_id, result, ts").eq("actor_id", userId).in("verb", ["completed", "passed", "attempted", "earned", "enrolled", "answered"]).gte("ts", since60).order("ts", { ascending: false }).limit(200),
    admin.from("code_runs").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("kind", "run").eq("cached", false).gte("created_at", today.toISOString()),
    admin.from("courses").select("*").eq("status", "published").order("published_at", { ascending: false }).limit(12),
  ]);

  const enrollments = (enrollRes.data ?? []) as Enrollment[];
  const courseIds = enrollments.map((e) => e.course_id);
  const [coursesRes, itemsRes] = courseIds.length
    ? await Promise.all([
        admin.from("courses").select("*").in("id", courseIds),
        admin.from("items").select("id, course_id, section_id, title, kind, position, required").in("course_id", courseIds),
      ])
    : [{ data: [] }, { data: [] }];
  const sectionIds = [...new Set(((itemsRes.data ?? []) as Item[]).map((i) => i.section_id))];
  const sectionsRes = sectionIds.length ? await admin.from("sections").select("id, position").in("id", sectionIds) : { data: [] };
  const sectionPos = new Map(((sectionsRes.data ?? []) as { id: string; position: number }[]).map((s) => [s.id, s.position]));

  const courseSummaries = await attachCounts((coursesRes.data ?? []) as Course[]);
  const courseById = new Map(courseSummaries.map((c) => [c.id, c]));
  const items = ((itemsRes.data ?? []) as Item[]).sort(
    (a, b) => (sectionPos.get(a.section_id) ?? 0) - (sectionPos.get(b.section_id) ?? 0) || a.position - b.position,
  );
  const progress = (progressRes.data ?? []) as { item_id: string; course_id: string; status: string; completed_at: string | null }[];
  const completedIds = new Set(progress.filter((p) => p.status === "completed").map((p) => p.item_id));
  const itemById = new Map(items.map((i) => [i.id, i]));

  const courses: DashboardCourse[] = enrollments
    .filter((e) => courseById.has(e.course_id))
    .map((e) => {
      const courseItems = items.filter((i) => i.course_id === e.course_id);
      const done = courseItems.filter((i) => completedIds.has(i.id)).length;
      const next = courseItems.find((i) => !completedIds.has(i.id)) ?? null;
      const last = e.last_item_id ? itemById.get(e.last_item_id) ?? null : null;
      return {
        course: courseById.get(e.course_id)!,
        enrollment: e,
        percent: courseItems.length ? Math.round((done / courseItems.length) * 100) : 0,
        completed: done,
        total: courseItems.length,
        nextItem: next ? { id: next.id, title: next.title, kind: next.kind } : null,
        lastItem: last ? { id: last.id, title: last.title, kind: last.kind } : null,
      };
    });

  // Labs
  const attempts = (attemptsRes.data ?? []) as { id: string; lab_version_id: string; item_id: string | null; course_id: string | null; runtime_type: "terminal" | "compile"; status: string; steps_passed: string[]; updated_at: string }[];
  const versionIds = [...new Set(attempts.map((a) => a.lab_version_id))];
  const versionsRes = versionIds.length ? await admin.from("lab_versions").select("id, spec").in("id", versionIds) : { data: [] };
  const specById = new Map(((versionsRes.data ?? []) as { id: string; spec: { metadata: { title: string }; steps: { id: string; checks: unknown[] }[] } }[]).map((v) => [v.id, v.spec]));
  const seenItems = new Set<string>();
  const labs: DashboardLab[] = [];
  for (const a of attempts) {
    const key = a.item_id ?? a.id;
    if (seenItems.has(key)) continue;
    seenItems.add(key);
    const spec = specById.get(a.lab_version_id);
    if (!spec) continue;
    const course = a.course_id ? courseById.get(a.course_id) : undefined;
    labs.push({
      attemptId: a.id,
      title: spec.metadata.title,
      runtime: a.runtime_type,
      status: a.status,
      stepsPassed: a.steps_passed.length,
      stepsTotal: spec.steps.filter((s) => s.checks.length > 0).length,
      href: course && a.item_id ? `/learn/${course.slug}/${a.item_id}` : null,
      updatedAt: a.updated_at,
    });
  }

  // Streak: days with a completed item or a passed check.
  const events = (eventsRes.data ?? []) as { verb: string; object_type: string; object_id: string | null; result: Record<string, unknown> | null; ts: string }[];
  const activeDays = new Set<string>();
  for (const p of progress) if (p.completed_at && p.completed_at >= since60) activeDays.add(dayKey(p.completed_at));
  for (const e of events) if (e.verb === "passed" || e.verb === "completed" || (e.verb === "attempted" && e.result?.passed)) activeDays.add(dayKey(e.ts));
  const days = [...activeDays].sort();
  let current = 0;
  const cursor = new Date();
  cursor.setUTCHours(0, 0, 0, 0);
  if (!activeDays.has(dayKey(cursor.toISOString()))) cursor.setUTCDate(cursor.getUTCDate() - 1); // today not done yet
  while (activeDays.has(dayKey(cursor.toISOString()))) {
    current++;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  let best = 0;
  let run = 0;
  let prev: Date | null = null;
  for (const d of days) {
    const dt = new Date(d + "T00:00:00Z");
    run = prev && dt.getTime() - prev.getTime() === 86_400_000 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = dt;
  }

  // Skills: each enrolled course's skills, weighted by its completion.
  const skillAcc = new Map<string, { sum: number; n: number }>();
  for (const c of courses) {
    for (const s of c.course.skills) {
      const acc = skillAcc.get(s) ?? { sum: 0, n: 0 };
      acc.sum += c.percent;
      acc.n++;
      skillAcc.set(s, acc);
    }
  }
  const skills = [...skillAcc.entries()].map(([name, a]) => ({ name, percent: Math.round(a.sum / a.n) })).sort((a, b) => b.percent - a.percent).slice(0, 8);

  // Activity labels
  const allItemIds = new Set(events.filter((e) => ["article", "quiz", "lab", "course"].includes(e.object_type) && e.object_id).map((e) => e.object_id as string));
  const missing = [...allItemIds].filter((id) => !itemById.has(id) && !courseById.has(id));
  const extraItems = missing.length ? ((await admin.from("items").select("id, title").in("id", missing)).data ?? []) : [];
  const extraLabs = missing.length ? ((await admin.from("labs").select("id, title").in("id", missing)).data ?? []) : [];
  const titles = new Map<string, string>([
    ...items.map((i) => [i.id, i.title] as [string, string]),
    ...courseSummaries.map((c) => [c.id, c.title] as [string, string]),
    ...(extraItems as { id: string; title: string }[]).map((i) => [i.id, i.title] as [string, string]),
    ...(extraLabs as { id: string; title: string }[]).map((l) => [l.id, l.title] as [string, string]),
  ]);
  const activity = events.slice(0, 12).map((e) => ({
    verb: e.verb,
    objectType: e.object_type,
    label: (e.object_id && titles.get(e.object_id)) || (e.object_type === "certificate" ? `Certificate ${e.object_id}` : e.object_type),
    at: e.ts,
    result: e.result,
  }));

  const enrolledSet = new Set(courseIds);
  const recommended = await attachCounts(((publishedRes.data ?? []) as Course[]).filter((c) => !enrolledSet.has(c.id)).slice(0, 3));

  return {
    courses,
    labs,
    certificates: (certRes.data ?? []) as Certificate[],
    streak: { current, best: Math.max(best, current), days },
    skills,
    activity,
    runsToday: runsRes.count ?? 0,
    runsPerDay: serverEnv.limits().runsPerDay,
    recommended,
  };
}
