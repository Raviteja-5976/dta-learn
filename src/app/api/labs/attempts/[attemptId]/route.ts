import { handle } from "@/lib/http";
import { attemptContext } from "@/lib/labs/route-helpers";
import { buildCompilePayload, buildTerminalPayload } from "@/lib/labs/server";
import { createAdminClient } from "@/lib/supabase/server";

type Ctx = { params: Promise<{ attemptId: string }> };

/** Attempt state, saved draft and step states. */
export async function GET(request: Request, { params }: Ctx) {
  return handle(async () => {
    const { attempt, version, lab, item } = await attemptContext(request, (await params).attemptId);
    const payload =
      version.runtime_type === "terminal" ? await buildTerminalPayload(attempt, version, lab, item) : await buildCompilePayload(attempt, version, lab);
    return Response.json({ runtime: version.runtime_type, payload });
  });
}

/** End the attempt. Stopping a terminal is client-side; this closes the record. */
export async function DELETE(request: Request, { params }: Ctx) {
  return handle(async () => {
    const { attempt } = await attemptContext(request, (await params).attemptId);
    if (attempt.status === "active") {
      await createAdminClient().from("lab_attempts").update({ status: "closed" }).eq("id", attempt.id);
    }
    return Response.json({ ok: true });
  });
}
