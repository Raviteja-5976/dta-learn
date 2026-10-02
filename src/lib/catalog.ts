import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import type { Course, Item, Section, SectionWithItems } from "@/lib/types";

export interface CourseSummary extends Course {
  itemCounts: { article: number; lab: number; quiz: number; total: number };
}

export async function listPublishedCourses(filters: { q?: string; level?: string; tag?: string } = {}): Promise<CourseSummary[]> {
  const admin = createAdminClient();
  let query = admin.from("courses").select("*").eq("status", "published").order("published_at", { ascending: false });
  if (filters.level) query = query.eq("level", filters.level);
  if (filters.tag) query = query.contains("tags", [filters.tag]);
  if (filters.q) {
    const term = filters.q.replace(/[%_,()]/g, " ").trim();
    if (term) query = query.or(`title.ilike.%${term}%,subtitle.ilike.%${term}%`);
  }
  const { data: courses } = await query.returns<Course[]>();
  if (!courses?.length) return [];
  return attachCounts(courses);
}

export async function attachCounts(courses: Course[]): Promise<CourseSummary[]> {
  if (!courses.length) return [];
  const { data: items } = await createAdminClient()
    .from("items")
    .select("course_id, kind")
    .in("course_id", courses.map((c) => c.id));
  const counts = new Map<string, CourseSummary["itemCounts"]>();
  for (const it of (items ?? []) as Pick<Item, "course_id" | "kind">[]) {
    const c = counts.get(it.course_id) ?? { article: 0, lab: 0, quiz: 0, total: 0 };
    c[it.kind]++;
    c.total++;
    counts.set(it.course_id, c);
  }
  return courses.map((c) => ({ ...c, itemCounts: counts.get(c.id) ?? { article: 0, lab: 0, quiz: 0, total: 0 } }));
}

export async function getCourseBySlug(slug: string): Promise<Course | null> {
  const { data } = await createAdminClient().from("courses").select("*").eq("slug", slug).maybeSingle<Course>();
  return data ?? null;
}

export async function getOutline(courseId: string): Promise<SectionWithItems[]> {
  const admin = createAdminClient();
  const [{ data: sections }, { data: items }] = await Promise.all([
    admin.from("sections").select("*").eq("course_id", courseId).order("position").returns<Section[]>(),
    admin.from("items").select("*").eq("course_id", courseId).order("position").returns<Item[]>(),
  ]);
  const bySection = new Map<string, Item[]>();
  for (const it of items ?? []) {
    const arr = bySection.get(it.section_id) ?? [];
    arr.push(it);
    bySection.set(it.section_id, arr);
  }
  return (sections ?? []).map((s) => ({ ...s, items: bySection.get(s.id) ?? [] }));
}

export function flattenOutline(outline: SectionWithItems[]): Item[] {
  return outline.flatMap((s) => s.items);
}

export async function allTags(): Promise<string[]> {
  const { data } = await createAdminClient().from("courses").select("tags").eq("status", "published");
  const set = new Set<string>();
  for (const row of (data ?? []) as { tags: string[] }[]) row.tags.forEach((t) => set.add(t));
  return [...set].sort();
}
