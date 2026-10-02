import { z } from "zod";
import { HttpError, handle, readJson } from "@/lib/http";
import { attemptContext } from "@/lib/labs/route-helpers";
import { checkStep } from "@/lib/compile/service";

export const maxDuration = 30;

const bodySchema = z.object({
  stepId: z.string().min(1).max(100),
  files: z.array(z.object({ path: z.string().max(200), content: z.string() })).max(50),
});

/**
 * Compile: run the step's hidden cases on Judge0. Recorded with
 * source = server before it is returned; hidden cases return only name and verdict.
 */
export async function POST(request: Request, { params }: { params: Promise<{ attemptId: string }> }) {
  return handle(async () => {
    const { attempt, version } = await attemptContext(request, (await params).attemptId);
    if (version.runtime_type !== "compile") throw new HttpError(400, "Server checks are for coding labs");
    const { stepId, files } = await readJson(request, bodySchema);
    return Response.json(await checkStep(attempt, version, stepId, files));
  });
}
