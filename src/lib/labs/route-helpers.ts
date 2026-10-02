import "server-only";
import { getViewer, type Viewer } from "@/lib/auth";
import { getCourseAccess } from "@/lib/access";
import { HttpError, assertSameOrigin } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase/server";
import { loadAttempt } from "./server";
import type { Course } from "@/lib/types";

export type AttemptContext = Awaited<ReturnType<typeof loadAttempt>> & { viewer: Viewer };

/**
 * Load the caller's attempt and re-check course access on every call, so a
 * revoked entitlement stops lab use immediately. Results posts are checked
 * against the session user (design §12: no lab tokens).
 */
export async function attemptContext(request: Request, attemptId: string): Promise<AttemptContext> {
  if (request.method !== "GET") assertSameOrigin(request);
  const viewer = await getViewer();
  if (!viewer) throw new HttpError(401, "Sign in required");
  const ctx = await loadAttempt(attemptId, viewer.user.id);
  if (ctx.attempt.course_id) {
    const { data: course } = await createAdminClient().from("courses").select("id, is_free").eq("id", ctx.attempt.course_id).maybeSingle<Pick<Course, "id" | "is_free">>();
    if (course) {
      const access = await getCourseAccess(viewer, course);
      if (!access.hasAccess) throw new HttpError(403, "You no longer have access to this course.");
    }
  }
  if (ctx.attempt.status === "closed") throw new HttpError(409, "This lab attempt was closed. Reopen the lab from the course.");
  return { ...ctx, viewer };
}
