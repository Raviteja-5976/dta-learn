import { verifyWebhookSignature, type RazorpayPayment, type RazorpaySubscription } from "@/lib/billing/razorpay";
import { applyRefund, fulfillOrder, recordSubscriptionPayment, syncSubscription } from "@/lib/billing/service";
import { createAdminClient } from "@/lib/supabase/server";

interface RazorpayEvent {
  event: string;
  payload: {
    payment?: { entity: RazorpayPayment };
    subscription?: { entity: RazorpaySubscription };
    refund?: { entity: { id: string; payment_id: string } };
  };
}

/**
 * Razorpay webhook (design §12–13): HMAC-verified against the raw body and
 * deduplicated by event id. Configure it in Razorpay Dashboard → Webhooks with
 * the events listed in the README. A non-2xx response makes Razorpay retry,
 * and every handler below is idempotent, so a retry is always safe.
 */
export async function POST(request: Request) {
  const raw = await request.text();
  const signature = request.headers.get("x-razorpay-signature") ?? "";
  try {
    if (!verifyWebhookSignature(raw, signature)) return Response.json({ error: "Invalid signature" }, { status: 400 });
  } catch (e) {
    console.error(e);
    return Response.json({ error: "Webhook not configured" }, { status: 503 });
  }

  let event: RazorpayEvent;
  try {
    event = JSON.parse(raw);
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const admin = createAdminClient();
  const eventId =
    request.headers.get("x-razorpay-event-id") ??
    `${event.event}:${event.payload.payment?.entity.id ?? event.payload.subscription?.entity.id ?? event.payload.refund?.entity.id ?? "unknown"}`;
  const { data: seen } = await admin
    .from("payment_events")
    .select("id, processed_at")
    .eq("provider", "razorpay")
    .eq("event_id", eventId)
    .maybeSingle<{ id: number; processed_at: string | null }>();
  if (seen?.processed_at) return Response.json({ ok: true, duplicate: true });
  let rowId = seen?.id;
  if (!rowId) {
    const { data: inserted } = await admin
      .from("payment_events")
      .insert({ event_id: eventId, event_type: event.event, payload: event })
      .select("id")
      .single<{ id: number }>();
    rowId = inserted?.id;
  }

  try {
    await processEvent(event);
    if (rowId) await admin.from("payment_events").update({ processed_at: new Date().toISOString(), error: null }).eq("id", rowId);
    return Response.json({ ok: true });
  } catch (e) {
    console.error("Razorpay webhook failed", event.event, e);
    if (rowId) await admin.from("payment_events").update({ error: (e as Error).message.slice(0, 500) }).eq("id", rowId);
    return Response.json({ error: "Processing failed" }, { status: 500 });
  }
}

async function processEvent(event: RazorpayEvent): Promise<void> {
  const payment = event.payload.payment?.entity;
  const subscription = event.payload.subscription?.entity;

  switch (event.event) {
    // One-time course purchases (subscription charges also fire these; fulfillOrder ignores orders it didn't create)
    case "payment.captured":
    case "order.paid":
      if (payment?.order_id) await fulfillOrder({ providerOrderId: payment.order_id, providerPaymentId: payment.id, method: payment.method });
      return;

    case "subscription.charged":
      if (!subscription) return;
      if (payment) await recordSubscriptionPayment(subscription.id, payment);
      await syncSubscription(subscription.id, { paymentVerified: true });
      return;

    // Every other lifecycle change: re-read the subscription from Razorpay
    case "subscription.authenticated":
    case "subscription.activated":
    case "subscription.pending":
    case "subscription.halted":
    case "subscription.cancelled":
    case "subscription.completed":
    case "subscription.paused":
    case "subscription.resumed":
    case "subscription.updated":
      if (subscription) await syncSubscription(subscription.id);
      return;

    case "refund.processed":
      if (event.payload.refund?.entity.payment_id) await applyRefund(event.payload.refund.entity.payment_id);
      return;
  }
}
