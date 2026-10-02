import { z } from "zod";
import { HttpError, handle, readJson } from "@/lib/http";
import { attemptContext } from "@/lib/labs/route-helpers";
import { mergeDraft } from "@/lib/labs/server";
import { logEvent } from "@/lib/events";
import { createAdminClient } from "@/lib/supabase/server";
import type { CompileLabSpec, TerminalLabSpec } from "@/lib/labs/spec";

const bodySchema = z.object({ toStep: z.string().max(100).optional() });

/**
 * Compile labs: reset the editor files to the starter code.
 * Terminal labs: "reset to step N" — returns the solution scripts for the
 * steps before N so the client can replay them hidden after a relaunch.
 */
export async function POST(request: Request, { params }: { params: Promise<{ attemptId: string }> }) {
  return handle(async () => {
    const { attempt, version } = await attemptContext(request, (await params).attemptId);
    const { toStep } = await readJson(request, bodySchema);

    if (version.runtime_type === "compile") {
      const spec = version.spec as CompileLabSpec;
      await createAdminClient().from("lab_attempts").update({ draft: null }).eq("id", attempt.id);
      return Response.json({ files: mergeDraft(spec, null) });
    }

    const spec = version.spec as TerminalLabSpec;
    if (!toStep) return Response.json({ scripts: [] });
    const idx = spec.steps.findIndex((s) => s.id === toStep);
    if (idx < 0) throw new HttpError(400, "Unknown step");
    const before = spec.steps.slice(0, idx);
    if (before.some((s) => !s.solution)) throw new HttpError(400, "This lab cannot skip ahead: an earlier step has no reference solution.");
    await logEvent({ actorId: attempt.user_id, verb: "skipped_to_step", objectType: "lab_step", objectId: `${version.lab_id}:${toStep}` });
    return Response.json({ scripts: before.map((s) => ({ stepId: s.id, script: `cd "$HOME" || exit 1\n${s.solution}` })) });
  });
}
