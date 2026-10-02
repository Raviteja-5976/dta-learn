import { getViewer } from "@/lib/auth";
import { loadItemForViewer } from "@/lib/access";
import { HttpError, assertSameOrigin, handle } from "@/lib/http";
import { completeItem } from "@/lib/progress";

/** Mark an article as read (self-reported evidence). */
export async function POST(request: Request, { params }: { params: Promise<{ itemId: string }> }) {
  return handle(async () => {
    assertSameOrigin(request);
    const viewer = await getViewer();
    if (!viewer) throw new HttpError(401, "Sign in required");
    const { itemId } = await params;
    const loaded = await loadItemForViewer(viewer, itemId);
    if (!loaded || !loaded.canView) throw new HttpError(404, "Item not found");
    if (!loaded.access.enrolled) throw new HttpError(403, "Enroll in the course to track progress");
    if (loaded.item.kind !== "article") throw new HttpError(400, "Only articles are completed manually. Labs and quizzes complete when you pass them.");

    const outcome = await completeItem(viewer.user.id, loaded.item, { evidence: "self" });
    return Response.json(outcome);
  });
}
