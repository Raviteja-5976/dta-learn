import { z } from "zod";
import { getViewer } from "@/lib/auth";
import { verifyOrderSignature } from "@/lib/billing/razorpay";
import { fulfillOrder } from "@/lib/billing/service";
import { HttpError, assertSameOrigin, handle, readJson } from "@/lib/http";

const schema = z.object({
  razorpay_order_id: z.string().min(1).max(64),
  razorpay_payment_id: z.string().min(1).max(64),
  razorpay_signature: z.string().min(1).max(256),
});

/**
 * Checkout success callback. The signature proves Razorpay captured the
 * payment for this order; the webhook may have granted access first, which
 * is fine — fulfilment is idempotent.
 */
export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const viewer = await getViewer();
    if (!viewer) throw new HttpError(401, "Sign in required");
    const body = await readJson(request, schema);
    if (!verifyOrderSignature(body.razorpay_order_id, body.razorpay_payment_id, body.razorpay_signature)) {
      throw new HttpError(400, "Payment verification failed. If money was deducted, it will be confirmed automatically within a few minutes.");
    }
    const result = await fulfillOrder({ providerOrderId: body.razorpay_order_id, providerPaymentId: body.razorpay_payment_id });
    if (!result || result.order.user_id !== viewer.user.id) throw new HttpError(404, "Order not found");
    return Response.json({ ok: true, redirect: result.courseSlug ? `/courses/${result.courseSlug}?purchased=1` : "/billing" });
  });
}
