import { z } from "zod";
import { HttpError, handle, readJson } from "@/lib/http";
import { attemptContext } from "@/lib/labs/route-helpers";
import { evaluateAttempt, recordValidation } from "@/lib/labs/server";
import { createAdminClient } from "@/lib/supabase/server";
import type { TerminalLabSpec } from "@/lib/labs/spec";

const bodySchema = z.object({
  results: z
    .array(
      z.object({
        stepId: z.string().min(1).max(100),
        checkId: z.string().min(1).max(100),
        passed: z.boolean(),
        details: z.object({ message: z.string().max(500).optional(), status: z.number().int().optional() }).optional(),
      }),
    )
    .min(1)
    .max(50),
});

/**
 * Terminal: the browser reports check results. The server validates that each
 * step/check belongs to the lab version and records them with source = client
 * (design §6). It cannot re-run the check, so these are self-verified.
 */
export async function POST(request: Request, { params }: { params: Promise<{ attemptId: string }> }) {
  return handle(async () => {
    const { attempt, version } = await attemptContext(request, (await params).attemptId);
    if (version.runtime_type !== "terminal") throw new HttpError(400, "Client results are only accepted for terminal labs");
    const { results } = await readJson(request, bodySchema);

    // Rate limit: at most 120 reported results per minute per attempt.
    const { count } = await createAdminClient()
      .from("validation_results")
      .select("id", { count: "exact", head: true })
      .eq("attempt_id", attempt.id)
      .gte("created_at", new Date(Date.now() - 60_000).toISOString());
    if ((count ?? 0) + results.length > 120) throw new HttpError(429, "Too many check results. Slow down a little.");

    const spec = version.spec as TerminalLabSpec;
    for (const r of results) {
      const step = spec.steps.find((s) => s.id === r.stepId);
      const check = step?.checks.find((c) => (c as { id: string }).id === r.checkId);
      if (!step || !check) throw new HttpError(400, `Unknown step or check: ${r.stepId}/${r.checkId}`);
      if (check.type === "challenge.answer") throw new HttpError(400, "Challenge answers are verified on the server via /answer");
    }

    await recordValidation(attempt, results.map((r) => ({ ...r, source: "client" as const })));
    return Response.json(await evaluateAttempt(attempt, version));
  });
}
