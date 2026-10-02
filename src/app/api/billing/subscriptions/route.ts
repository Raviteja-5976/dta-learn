import { getViewer } from "@/lib/auth";
import { startSubscription } from "@/lib/billing/service";
import { HttpError, assertSameOrigin, handle } from "@/lib/http";

/** Create a Razorpay Subscription on the active plan and return the Checkout options. */
export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const viewer = await getViewer();
    if (!viewer) throw new HttpError(401, "Sign in required");
    return Response.json(await startSubscription(viewer));
  });
}
