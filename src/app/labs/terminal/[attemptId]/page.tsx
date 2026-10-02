import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getViewer } from "@/lib/auth";
import { getCourseAccess } from "@/lib/access";
import { flattenOutline, getOutline } from "@/lib/catalog";
import { buildTerminalPayload, loadAttempt } from "@/lib/labs/server";
import { HttpError } from "@/lib/http";
import { publicEnv } from "@/lib/env";
import { isTutorAvailable } from "@/lib/settings";
import { createAdminClient } from "@/lib/supabase/server";
import type { Course } from "@/lib/types";
import { TerminalLabClient } from "./client";

export const metadata: Metadata = { title: "Terminal lab" };

/**
 * The cross-origin isolated terminal route (design §4.11). next.config.ts
 * sends COOP/COEP only for /labs/terminal/*. Every link into and out of this
 * page is a plain <a> so the browser does a full load and applies the right
 * headers. No third-party scripts, images or iframes are allowed here.
 */
export default async function TerminalLabPage({
  params,
  searchParams,
}: {
  params: Promise<{ attemptId: string }>;
  searchParams: Promise<{ engine?: string }>;
}) {
  const { attemptId } = await params;
  const { engine } = await searchParams;
  const viewer = await getViewer();
  if (!viewer) redirect(`/login?next=${encodeURIComponent(`/labs/terminal/${attemptId}`)}`);

  let ctx: Awaited<ReturnType<typeof loadAttempt>>;
  try {
    ctx = await loadAttempt(attemptId, viewer.user.id);
  } catch (e) {
    if (e instanceof HttpError) notFound();
    throw e;
  }
  if (ctx.version.runtime_type !== "terminal") notFound();

  let backHref: string | null = null;
  let nextHref: string | null = null;
  if (ctx.attempt.course_id) {
    const { data: course } = await createAdminClient().from("courses").select("*").eq("id", ctx.attempt.course_id).maybeSingle<Course>();
    if (course) {
      const access = await getCourseAccess(viewer, course);
      if (!access.hasAccess) redirect(`/courses/${course.slug}`);
      backHref = ctx.item ? `/learn/${course.slug}/${ctx.item.id}` : `/courses/${course.slug}`;
      const flat = flattenOutline(await getOutline(course.id));
      const idx = ctx.item ? flat.findIndex((i) => i.id === ctx.item!.id) : -1;
      if (idx >= 0 && idx < flat.length - 1) nextHref = `/learn/${course.slug}/${flat[idx + 1].id}`;
    }
  }

  const [payload, tutorOn] = await Promise.all([
    buildTerminalPayload(ctx.attempt, ctx.version, ctx.lab, ctx.item),
    isTutorAvailable(viewer.profile.role),
  ]);

  return (
    <TerminalLabClient
      tutorItemId={tutorOn && ctx.item ? ctx.item.id : null}
      payload={payload}
      engine={engine === "mock" ? "mock" : "cheerpx"}
      cheerpxVersion={publicEnv.cheerpxVersion}
      backHref={backHref}
      nextHref={nextHref}
    />
  );
}
