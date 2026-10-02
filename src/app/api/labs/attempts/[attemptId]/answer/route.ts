import { z } from "zod";
import { HttpError, handle, readJson } from "@/lib/http";
import { attemptContext } from "@/lib/labs/route-helpers";
import { evaluateAttempt, recordValidation } from "@/lib/labs/server";
import { generateChallenge, normalizeAnswer } from "@/lib/labs/challenges";
import { logEvent } from "@/lib/events";
import { createAdminClient } from "@/lib/supabase/server";
import type { TerminalCheck, TerminalLabSpec } from "@/lib/labs/spec";

const bodySchema = z.object({
  stepId: z.string().min(1).max(100),
  checkId: z.string().min(1).max(100),
  answer: z.string().max(200),
});

/**
 * Terminal: submit a seeded-challenge answer. The server recomputes the
 * expected value from the attempt's seed and records it with source = server.
 */
export async function POST(request: Request, { params }: { params: Promise<{ attemptId: string }> }) {
  return handle(async () => {
    const { attempt, version } = await attemptContext(request, (await params).attemptId);
    const { stepId, checkId, answer } = await readJson(request, bodySchema);
    const spec = version.spec as TerminalLabSpec;
    const step = spec.steps.find((s) => s.id === stepId);
    const check = step?.checks.find((c) => (c as TerminalCheck).id === checkId) as TerminalCheck | undefined;
    if (!check || check.type !== "challenge.answer") throw new HttpError(400, "This check does not take an answer");

    // Brute-force guard: 10 answers per minute per attempt.
    const { count } = await createAdminClient()
      .from("validation_results")
      .select("id", { count: "exact", head: true })
      .eq("attempt_id", attempt.id)
      .eq("check_id", checkId)
      .gte("created_at", new Date(Date.now() - 60_000).toISOString());
    if ((count ?? 0) >= 10) throw new HttpError(429, "Too many guesses. Take another look at the data.");

    const instance = generateChallenge(check.generator, attempt.seed ?? attempt.id);
    if (!instance) throw new HttpError(500, "Unknown challenge generator");
    const passed = normalizeAnswer(answer) === normalizeAnswer(instance.answer);

    await recordValidation(attempt, [{ stepId, checkId, passed, source: "server", details: { kind: "challenge" } }]);
    await logEvent({ actorId: attempt.user_id, verb: "answered", objectType: "lab_challenge", objectId: `${version.lab_id}:${stepId}`, result: { passed } });
    const evaluation = await evaluateAttempt(attempt, version);
    return Response.json({ passed, message: passed ? "Correct — verified on the server." : check.fail ?? "That's not it. Check your command and try again.", ...evaluation });
  });
}
