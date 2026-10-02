import { getViewer } from "@/lib/auth";
import { cancelSubscription } from "@/lib/billing/service";
import { HttpError, assertSameOrigin, handle } from "@/lib/http";

/** Cancel at the end of the current billing period. */
export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const viewer = await getViewer();
    if (!viewer) throw new HttpError(401, "Sign in required");
    const sub = await cancelSubscription(viewer);
    return Response.json({ ok: true, status: sub.status, currentEnd: sub.current_end });
  });
}
