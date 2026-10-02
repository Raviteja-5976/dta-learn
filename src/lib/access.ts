import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { isStaffRole, type Viewer } from "@/lib/auth";
import type { Course, Enrollment, Item } from "@/lib/types";

/**
 * One access decision for the whole app (design §13): staff, a free course
 * the learner enrolled in, or an active entitlement for the course or the
 * catalog. Mirrors public.has_course_access() in the database.
 */
export interface CourseAccess {
  isStaff: boolean;
  enrolled: boolean;
  entitled: boolean;
  hasAccess: boolean;
  canEnroll: boolean;
  enrollment: Enrollment | null;
}

export async function hasActiveEntitlement(userId: string, courseId: string): Promise<boolean> {
  const { data } = await createAdminClient()
    .from("entitlements")
    .select("scope_type, course_id, starts_at, ends_at")
    .eq("user_id", userId)
    .eq("status", "active");
  const now = Date.now();
  return (data ?? []).some(
    (e: { scope_type: string; course_id: string | null; starts_at: string; ends_at: string | null }) =>
      new Date(e.starts_at).getTime() <= now &&
      (e.ends_at === null || new Date(e.ends_at).getTime() > now) &&
      (e.scope_type === "catalog" || e.course_id === courseId),
  );
}

export async function getCourseAccess(viewer: Viewer | null, course: Pick<Course, "id" | "is_free">): Promise<CourseAccess> {
  if (!viewer) {
    return { isStaff: false, enrolled: false, entitled: false, hasAccess: false, canEnroll: course.is_free, enrollment: null };
  }
  const isStaff = isStaffRole(viewer.profile.role);
  const admin = createAdminClient();
  const [{ data: enrollment }, entitled] = await Promise.all([
    admin.from("enrollments").select("*").eq("user_id", viewer.user.id).eq("course_id", course.id).maybeSingle<Enrollment>(),
    course.is_free ? Promise.resolve(false) : hasActiveEntitlement(viewer.user.id, course.id),
  ]);
  const enrolled = Boolean(enrollment);
  const hasAccess = isStaff || entitled || (course.is_free && enrolled);
  return { isStaff, enrolled, entitled, hasAccess, canEnroll: course.is_free || entitled || isStaff, enrollment: enrollment ?? null };
}

export interface LoadedItem {
  item: Item;
  course: Course;
  access: CourseAccess;
  /** True when the viewer may open the item's content. */
  canView: boolean;
}

/** Load an item with its course and the viewer's access to it. */
export async function loadItemForViewer(viewer: Viewer | null, itemId: string): Promise<LoadedItem | null> {
  const admin = createAdminClient();
  const { data: item } = await admin.from("items").select("*").eq("id", itemId).maybeSingle<Item>();
  if (!item) return null;
  const { data: course } = await admin.from("courses").select("*").eq("id", item.course_id).maybeSingle<Course>();
  if (!course) return null;
  const access = await getCourseAccess(viewer, course);
  const published = course.status === "published";
  if (!published && !access.isStaff) return null;
  const canView = access.isStaff || (published && (item.is_preview ? Boolean(viewer) : access.hasAccess));
  return { item, course, access, canView };
}

/** Enroll a learner (idempotent). Paid courses need an entitlement first. */
export async function enroll(userId: string, courseId: string, source: string): Promise<Enrollment> {
  const admin = createAdminClient();
  const { error: upsertError } = await admin
    .from("enrollments")
    .upsert({ user_id: userId, course_id: courseId, source }, { onConflict: "user_id,course_id", ignoreDuplicates: true });
  if (upsertError) throw new Error(upsertError.message);
  const { data, error } = await admin
    .from("enrollments")
    .select("*")
    .eq("user_id", userId)
    .eq("course_id", courseId)
    .single<Enrollment>();
  if (error || !data) throw new Error(error?.message ?? "Enrollment failed");
  return data;
}
