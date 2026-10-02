import { z } from "zod";
import { HttpError, handle, readJson } from "@/lib/http";
import { attemptContext } from "@/lib/labs/route-helpers";
import { logEvent } from "@/lib/events";
import { createAdminClient } from "@/lib/supabase/server";

const bodySchema = z.object({ stepId: z.string().min(1).max(100) });

/** Reveal the next tiered hint. Each reveal is logged for "hardest step" analytics. */
export async function POST(request: Request, { params }: { params: Promise<{ attemptId: string }> }) {
  return handle(async () => {
    const { attempt, version } = await attemptContext(request, (await params).attemptId);
    const { stepId } = await readJson(request, bodySchema);
    const step = version.spec.steps.find((s) => s.id === stepId);
    if (!step) throw new HttpError(400, "Unknown step");

    const used = attempt.hints_used?.[stepId] ?? 0;
    const next = Math.min(used + 1, step.hints.length);
    if (next > used) {
      await createAdminClient()
        .from("lab_attempts")
        .update({ hints_used: { ...(attempt.hints_used ?? {}), [stepId]: next } })
        .eq("id", attempt.id);
      await logEvent({ actorId: attempt.user_id, verb: "revealed_hint", objectType: "lab_step", objectId: `${version.lab_id}:${stepId}`, result: { tier: next } });
    }
    return Response.json({ hints: step.hints.slice(0, next) });
  });
}
