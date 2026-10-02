import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import type { Viewer } from "@/lib/auth";
import type { Course, Lab } from "@/lib/types";

export class StudioError extends Error {}

/** Admins edit everything; instructors edit the courses they own. */
export async function assertCourseEditor(viewer: Viewer, courseId: string): Promise<Course> {
  const { data: course } = await createAdminClient().from("courses").select("*").eq("id", courseId).maybeSingle<Course>();
  if (!course) throw new StudioError("Course not found");
  if (viewer.profile.role !== "admin" && course.owner_id !== viewer.user.id) throw new StudioError("You can only edit courses you own");
  return course;
}

export async function assertLabEditor(viewer: Viewer, labId: string): Promise<Lab> {
  const { data: lab } = await createAdminClient().from("labs").select("*").eq("id", labId).maybeSingle<Lab>();
  if (!lab) throw new StudioError("Lab not found");
  if (viewer.profile.role !== "admin" && lab.owner_id !== viewer.user.id) throw new StudioError("You can only edit labs you own");
  return lab;
}

export async function courseIdForSection(sectionId: string): Promise<string> {
  const { data } = await createAdminClient().from("sections").select("course_id").eq("id", sectionId).maybeSingle<{ course_id: string }>();
  if (!data) throw new StudioError("Section not found");
  return data.course_id;
}

export async function courseIdForItem(itemId: string): Promise<string> {
  const { data } = await createAdminClient().from("items").select("course_id").eq("id", itemId).maybeSingle<{ course_id: string }>();
  if (!data) throw new StudioError("Item not found");
  return data.course_id;
}

/** Find a free slug by appending -2, -3, … */
export async function uniqueSlug(table: "courses" | "labs", base: string): Promise<string> {
  const admin = createAdminClient();
  const root = base || "untitled";
  for (let i = 1; i < 50; i++) {
    const candidate = i === 1 ? root : `${root}-${i}`;
    const { data } = await admin.from(table).select("id").eq("slug", candidate).maybeSingle();
    if (!data) return candidate;
  }
  return `${root}-${crypto.randomUUID().slice(0, 6)}`;
}
