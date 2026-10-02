"use server";

import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth";
import { enroll, getCourseAccess } from "@/lib/access";
import { flattenOutline, getOutline } from "@/lib/catalog";
import { logEvent } from "@/lib/events";
import { createAdminClient } from "@/lib/supabase/server";
import type { Course } from "@/lib/types";

export async function enrollAction(formData: FormData): Promise<void> {
  const courseId = String(formData.get("courseId") ?? "");
  const viewer = await getViewer();
  const { data: course } = await createAdminClient().from("courses").select("*").eq("id", courseId).maybeSingle<Course>();
  if (!course) redirect("/courses");
  if (!viewer) redirect(`/login?next=${encodeURIComponent(`/courses/${course.slug}`)}`);

  const access = await getCourseAccess(viewer, course);
  if (course.status !== "published" && !access.isStaff) redirect("/courses");
  if (!access.canEnroll) redirect(`/courses/${course.slug}?error=payment`);

  if (!access.enrolled) {
    await enroll(viewer.user.id, course.id, course.is_free ? "free" : access.entitled ? "entitlement" : "staff");
    await logEvent({ actorId: viewer.user.id, verb: "enrolled", objectType: "course", objectId: course.id });
  }
  const first = flattenOutline(await getOutline(course.id))[0];
  redirect(first ? `/learn/${course.slug}/${first.id}` : `/courses/${course.slug}`);
}
