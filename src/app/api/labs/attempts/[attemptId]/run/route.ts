import { z } from "zod";
import { HttpError, handle, readJson } from "@/lib/http";
import { attemptContext } from "@/lib/labs/route-helpers";
import { runCode } from "@/lib/compile/service";

export const maxDuration = 30;

const bodySchema = z.object({
  files: z.array(z.object({ path: z.string().max(200), content: z.string() })).max(50),
  stdin: z.string().default(""),
});

/** Compile: run files with the learner's stdin. Rate-limited and cached for 10 minutes. */
export async function POST(request: Request, { params }: { params: Promise<{ attemptId: string }> }) {
  return handle(async () => {
    const { attempt, version } = await attemptContext(request, (await params).attemptId);
    if (version.runtime_type !== "compile") throw new HttpError(400, "Run is for coding labs");
    const { files, stdin } = await readJson(request, bodySchema);
    return Response.json(await runCode(attempt, version, files, stdin));
  });
}
