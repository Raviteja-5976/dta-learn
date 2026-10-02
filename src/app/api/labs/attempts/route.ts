import { z } from "zod";
import { getViewer } from "@/lib/auth";
import { loadItemForViewer } from "@/lib/access";
import { HttpError, assertSameOrigin, handle, readJson } from "@/lib/http";
import { buildCompilePayload, buildTerminalPayload, loadCurrentLab, startAttempt } from "@/lib/labs/server";

const bodySchema = z.object({ itemId: z.string().uuid() });

/** Start or resume a lab attempt for an item (design §29). */
export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const viewer = await getViewer();
    if (!viewer) throw new HttpError(401, "Sign in required");
    const { itemId } = await readJson(request, bodySchema);
    const loaded = await loadItemForViewer(viewer, itemId);
    if (!loaded || !loaded.canView || loaded.item.kind !== "lab" || !loaded.item.lab_id) throw new HttpError(404, "Lab not found");
    if (!loaded.access.enrolled && !loaded.access.isStaff) throw new HttpError(403, "Enroll in the course to start this lab");
    const lab = await loadCurrentLab(loaded.item.lab_id);
    if (!lab) throw new HttpError(404, "This lab has not been published yet");

    const attempt = await startAttempt(viewer.user.id, loaded.item, lab.version);
    const payload =
      lab.version.runtime_type === "terminal"
        ? await buildTerminalPayload(attempt, lab.version, lab.lab, loaded.item)
        : await buildCompilePayload(attempt, lab.version, lab.lab);
    return Response.json({ attemptId: attempt.id, runtime: lab.version.runtime_type, payload });
  });
}
