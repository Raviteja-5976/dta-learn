import { z } from "zod";
import { HttpError, handle, readJson } from "@/lib/http";
import { attemptContext } from "@/lib/labs/route-helpers";
import { sanitizeFiles } from "@/lib/compile/service";
import { createAdminClient } from "@/lib/supabase/server";
import type { CompileLabSpec } from "@/lib/labs/spec";

const bodySchema = z.object({
  files: z.array(z.object({ path: z.string().max(200), content: z.string() })).max(50),
});

/** Autosave editor files (compile labs; the client calls this every 5 s while dirty). */
export async function PUT(request: Request, { params }: { params: Promise<{ attemptId: string }> }) {
  return handle(async () => {
    const { attempt, version } = await attemptContext(request, (await params).attemptId);
    if (version.runtime_type !== "compile") throw new HttpError(400, "Only compile labs keep a draft");
    const { files } = await readJson(request, bodySchema);
    const spec = version.spec as CompileLabSpec;
    const editable = new Set(spec.files.filter((f) => f.editable).map((f) => f.path));
    const clean = sanitizeFiles(spec, files).filter((f) => editable.has(f.path));
    await createAdminClient().from("lab_attempts").update({ draft: { files: clean } }).eq("id", attempt.id);
    return Response.json({ ok: true, savedAt: new Date().toISOString() });
  });
}
