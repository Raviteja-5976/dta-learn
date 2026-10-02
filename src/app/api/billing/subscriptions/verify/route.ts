import { z } from "zod";
import { getViewer } from "@/lib/auth";
import { razorpay, verifySubscriptionSignature } from "@/lib/billing/razorpay";
import { recordSubscriptionPayment, syncSubscription } from "@/lib/billing/service";
import { HttpError, assertSameOrigin, handle, readJson } from "@/lib/http";

const schema = z.object({
  razorpay_subscription_id: z.string().min(1).max(64),
  razorpay_payment_id: z.string().min(1).max(64),
  razorpay_signature: z.string().min(1).max(256),
});

/** Checkout success for the first subscription payment. */
export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const viewer = await getViewer();
    if (!viewer) throw new HttpError(401, "Sign in required");
    const body = await readJson(request, schema);
    if (!verifySubscriptionSignature(body.razorpay_subscription_id, body.razorpay_payment_id, body.razorpay_signature)) {
      throw new HttpError(400, "Payment verification failed. If money was deducted, your subscription will activate automatically within a few minutes.");
    }
    const sub = await syncSubscription(body.razorpay_subscription_id, { paymentVerified: true });
    if (!sub || sub.user_id !== viewer.user.id) throw new HttpError(404, "Subscription not found");
    const payment = await razorpay.fetchPayment(body.razorpay_payment_id);
    await recordSubscriptionPayment(body.razorpay_subscription_id, payment);
    return Response.json({ ok: true, redirect: "/billing?subscribed=1" });
  });
}
