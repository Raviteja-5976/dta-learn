import "server-only";
import { enroll } from "@/lib/access";
import { displayName, type Viewer } from "@/lib/auth";
import { serverEnv } from "@/lib/env";
import { logEvent } from "@/lib/events";
import { HttpError } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase/server";
import type { BillingPlan, Course, Entitlement, Order, Subscription, SubscriptionStatus } from "@/lib/types";
import { fromUnix, razorpay, type RazorpaySubscription } from "./razorpay";

/**
 * Commerce rules (design §13). Payments only ever create or move
 * ENTITLEMENTS; the access check never looks at orders or subscriptions.
 *
 * Every function here is idempotent, because the same payment can arrive
 * twice — once from the Checkout callback and once from the webhook — and
 * whichever lands first grants access while the second is a no-op.
 */

const BRAND = "DevTrackAcademy Learn";
const DAY_MS = 86_400_000;

/** Subscription states in which the learner is (or is about to be) a paying member. */
export const LIVE_SUBSCRIPTION_STATUSES: SubscriptionStatus[] = ["authenticated", "active", "pending"];

export interface CheckoutOptions {
  key: string;
  name: string;
  description: string;
  currency: "INR";
  amount?: number;
  order_id?: string;
  subscription_id?: string;
  prefill: { name: string; email: string };
  notes: Record<string, string>;
  theme: { color: string };
}

function checkoutBase(viewer: Viewer, description: string, notes: Record<string, string>): CheckoutOptions {
  return {
    key: serverEnv.razorpay().keyId,
    name: BRAND,
    description,
    currency: "INR",
    prefill: { name: displayName(viewer.profile), email: viewer.profile.email },
    notes,
    theme: { color: "#FF6B35" },
  };
}

/** Add calendar months, clamping to the last day (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(from: Date, months: number): Date {
  const d = new Date(from);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d;
}

function assertBillingConfigured() {
  if (!serverEnv.razorpayConfigured()) throw new HttpError(503, "Online payments are not configured yet. Please try again later.");
}

// ═══ plans ═══════════════════════════════════════════════════════════════════
export async function getActivePlan(): Promise<BillingPlan | null> {
  const { data } = await createAdminClient().from("billing_plans").select("*").eq("active", true).maybeSingle<BillingPlan>();
  return data ?? null;
}

// ═══ one-time course purchase ════════════════════════════════════════════════
export async function createCourseOrder(viewer: Viewer, courseId: string): Promise<CheckoutOptions> {
  assertBillingConfigured();
  const admin = createAdminClient();
  const { data: course } = await admin.from("courses").select("*").eq("id", courseId).maybeSingle<Course>();
  if (!course || course.status !== "published") throw new HttpError(404, "Course not found");
  if (course.is_free) throw new HttpError(400, "This course is free — just enroll.");
  if (!course.price_paise || course.price_paise < 100) throw new HttpError(400, "This course has no price yet.");

  const months = serverEnv.billing().courseAccessMonths;
  const notes = { user_id: viewer.user.id, course_id: course.id, kind: "course_purchase" };
  const remote = await razorpay.createOrder({ amountPaise: course.price_paise, receipt: `c_${course.id.slice(0, 8)}_${Date.now().toString(36)}`, notes });

  const { error } = await admin.from("orders").insert({
    user_id: viewer.user.id,
    course_id: course.id,
    amount_paise: course.price_paise,
    access_months: months,
    provider_order_id: remote.id,
  });
  if (error) throw new Error(error.message);

  return {
    ...checkoutBase(viewer, `${course.title} — ${months} months of access`, notes),
    amount: course.price_paise,
    order_id: remote.id,
  };
}

/**
 * Mark an order paid and grant its course entitlement. Safe to call any
 * number of times for the same order. A repeat purchase of a course the
 * learner still owns extends access: the new period starts when the current
 * one ends.
 */
export async function fulfillOrder(input: { providerOrderId: string; providerPaymentId: string; method?: string | null }): Promise<{ order: Order; courseSlug: string | null } | null> {
  const admin = createAdminClient();
  const { data: order } = await admin.from("orders").select("*").eq("provider", "razorpay").eq("provider_order_id", input.providerOrderId).maybeSingle<Order>();
  if (!order) return null; // not one of ours (e.g. the order behind a subscription charge)
  if (order.status === "refunded") return { order, courseSlug: null };

  if (order.status !== "paid") {
    await admin
      .from("orders")
      .update({ status: "paid", provider_payment_id: input.providerPaymentId, paid_at: new Date().toISOString() })
      .eq("id", order.id)
      .neq("status", "paid");
  }

  await admin.from("payments").upsert(
    {
      user_id: order.user_id,
      order_id: order.id,
      provider_payment_id: input.providerPaymentId,
      amount_paise: order.amount_paise,
      currency: order.currency,
      method: input.method ?? null,
    },
    { onConflict: "provider,provider_payment_id", ignoreDuplicates: true },
  );

  let courseSlug: string | null = null;
  if (order.course_id) {
    const { data: existing } = await admin.from("entitlements").select("id").eq("order_id", order.id).maybeSingle();
    if (!existing) {
      // Stack on top of any purchase of this course that is still running.
      const { data: running } = await admin
        .from("entitlements")
        .select("ends_at")
        .eq("user_id", order.user_id)
        .eq("course_id", order.course_id)
        .eq("source", "purchase")
        .eq("status", "active")
        .gt("ends_at", new Date().toISOString())
        .order("ends_at", { ascending: false })
        .limit(1)
        .maybeSingle<{ ends_at: string }>();
      const start = running ? new Date(running.ends_at) : new Date();
      const { error } = await admin.from("entitlements").insert({
        user_id: order.user_id,
        scope_type: "course",
        course_id: order.course_id,
        source: "purchase",
        starts_at: start.toISOString(),
        ends_at: addMonths(start, order.access_months).toISOString(),
        order_id: order.id,
        note: `Razorpay ${input.providerPaymentId}`,
      });
      // 23505 = a concurrent call already granted this order.
      if (error && error.code !== "23505") throw new Error(error.message);
      if (!error) {
        await logEvent({ actorId: order.user_id, verb: "purchased", objectType: "course", objectId: order.course_id, result: { amountPaise: order.amount_paise } });
      }
    }
    const { data: course } = await admin.from("courses").select("id, slug").eq("id", order.course_id).maybeSingle<{ id: string; slug: string }>();
    if (course) {
      await enroll(order.user_id, course.id, "purchase");
      courseSlug = course.slug;
    }
  }
  return { order: { ...order, status: "paid" }, courseSlug };
}

// ═══ all-access subscription ════════════════════════════════════════════════
export async function getLiveSubscription(userId: string): Promise<Subscription | null> {
  const { data } = await createAdminClient()
    .from("subscriptions")
    .select("*")
    .eq("user_id", userId)
    .in("status", LIVE_SUBSCRIPTION_STATUSES)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<Subscription>();
  return data ?? null;
}

export async function startSubscription(viewer: Viewer): Promise<CheckoutOptions> {
  assertBillingConfigured();
  const plan = await getActivePlan();
  if (!plan) throw new HttpError(503, "The all-access plan isn't on sale yet.");
  if (await getLiveSubscription(viewer.user.id)) throw new HttpError(409, "You already have an active subscription. Manage it from Billing.");

  const notes = { user_id: viewer.user.id, plan_id: plan.id, kind: "all_access" };
  const remote = await razorpay.createSubscription({ planId: plan.provider_plan_id, totalCount: serverEnv.billing().subscriptionCycles, notes });
  const { error } = await createAdminClient().from("subscriptions").insert({
    user_id: viewer.user.id,
    plan_id: plan.id,
    status: remote.status,
    provider_subscription_id: remote.id,
  });
  if (error) throw new Error(error.message);

  return { ...checkoutBase(viewer, `${plan.name} — every course, billed monthly`, notes), subscription_id: remote.id };
}

/**
 * Pull the subscription's state from Razorpay (the source of truth, so
 * out-of-order webhooks cannot roll it back) and move the catalog
 * entitlement to match:
 *   active / pending      → access until the paid period ends + grace
 *   authenticated         → same, once the first payment's signature is verified
 *   cancelled / completed → access until the paid period ends, no grace
 *   halted / expired      → access ends now
 */
export async function syncSubscription(providerSubscriptionId: string, opts: { paymentVerified?: boolean } = {}): Promise<Subscription | null> {
  const admin = createAdminClient();
  const { data: row } = await admin.from("subscriptions").select("*").eq("provider", "razorpay").eq("provider_subscription_id", providerSubscriptionId).maybeSingle<Subscription>();
  if (!row) return null;

  const remote: RazorpaySubscription = await razorpay.fetchSubscription(providerSubscriptionId);
  const currentEnd = fromUnix(remote.current_end);
  const { data: updated } = await admin
    .from("subscriptions")
    .update({
      status: remote.status,
      current_start: fromUnix(remote.current_start),
      current_end: currentEnd,
      ended_at: fromUnix(remote.ended_at),
    })
    .eq("id", row.id)
    .select("*")
    .single<Subscription>();

  const now = Date.now();
  const graceMs = serverEnv.billing().graceDays * DAY_MS;
  const paidUntil = currentEnd ? new Date(currentEnd).getTime() : null;
  const provisional = addMonths(new Date(), 1).getTime(); // first charge verified, period not reported yet

  let endsAt: number | null = null; // null = leave the entitlement as it is
  switch (remote.status) {
    case "active":
    case "pending":
      endsAt = paidUntil ? paidUntil + graceMs : opts.paymentVerified ? provisional + graceMs : null;
      break;
    case "authenticated":
      if (opts.paymentVerified) endsAt = (paidUntil ?? provisional) + graceMs;
      break;
    case "cancelled":
    case "completed":
      endsAt = paidUntil && paidUntil > now ? paidUntil : now;
      break;
    case "halted":
    case "expired":
      endsAt = now;
      break;
  }

  if (endsAt !== null) {
    const { data: ent } = await admin.from("entitlements").select("id").eq("subscription_id", row.id).maybeSingle<Pick<Entitlement, "id">>();
    if (ent) {
      await admin.from("entitlements").update({ ends_at: new Date(endsAt).toISOString(), status: "active" }).eq("id", ent.id);
    } else if (endsAt > now) {
      const { error } = await admin.from("entitlements").insert({
        user_id: row.user_id,
        scope_type: "catalog",
        source: "subscription",
        ends_at: new Date(endsAt).toISOString(),
        subscription_id: row.id,
        note: `Razorpay ${providerSubscriptionId}`,
      });
      if (error && error.code !== "23505") throw new Error(error.message);
      if (!error) await logEvent({ actorId: row.user_id, verb: "subscribed", objectType: "plan", objectId: row.plan_id });
    }
  }
  return updated ?? row;
}

/** Record a renewal (or first) charge against a subscription. */
export async function recordSubscriptionPayment(providerSubscriptionId: string, payment: { id: string; amount: number; currency: string; method: string | null }) {
  const admin = createAdminClient();
  const { data: row } = await admin.from("subscriptions").select("id, user_id").eq("provider_subscription_id", providerSubscriptionId).maybeSingle<{ id: string; user_id: string }>();
  if (!row) return;
  await admin.from("payments").upsert(
    {
      user_id: row.user_id,
      subscription_id: row.id,
      provider_payment_id: payment.id,
      amount_paise: payment.amount,
      currency: payment.currency,
      method: payment.method,
    },
    { onConflict: "provider,provider_payment_id", ignoreDuplicates: true },
  );
}

/** Cancel at the end of the paid period: access continues until then. */
export async function cancelSubscription(viewer: Viewer): Promise<Subscription> {
  assertBillingConfigured();
  const live = await getLiveSubscription(viewer.user.id);
  if (!live) throw new HttpError(404, "You don't have an active subscription.");
  // A subscription that never got paid can be cancelled right away.
  const atCycleEnd = live.status === "active" || live.status === "pending";
  await razorpay.cancelSubscription(live.provider_subscription_id, atCycleEnd);
  await createAdminClient().from("subscriptions").update({ cancel_at_period_end: atCycleEnd }).eq("id", live.id);
  await logEvent({ actorId: viewer.user.id, verb: "cancelled", objectType: "plan", objectId: live.plan_id });
  return (await syncSubscription(live.provider_subscription_id)) ?? live;
}

// ═══ refunds ═════════════════════════════════════════════════════════════════
/** Full refunds revoke the course access the payment bought (design §13). */
export async function applyRefund(providerPaymentId: string): Promise<void> {
  const admin = createAdminClient();
  const payment = await razorpay.fetchPayment(providerPaymentId);
  const full = (payment.amount_refunded ?? 0) >= payment.amount;
  const { data: row } = await admin
    .from("payments")
    .update({ status: full ? "refunded" : "partially_refunded" })
    .eq("provider", "razorpay")
    .eq("provider_payment_id", providerPaymentId)
    .select("order_id, user_id")
    .maybeSingle<{ order_id: string | null; user_id: string }>();
  if (!row || !full || !row.order_id) return;
  await admin.from("orders").update({ status: "refunded" }).eq("id", row.order_id);
  await admin.from("entitlements").update({ status: "revoked", note: `Refunded ${providerPaymentId}` }).eq("order_id", row.order_id);
  await logEvent({ actorId: row.user_id, verb: "refunded", objectType: "order", objectId: row.order_id });
}

// ═══ read models ═════════════════════════════════════════════════════════════
export interface CourseOwnership {
  /** Latest end of a running purchase of this course (null if none). */
  purchasedUntil: string | null;
  /** Access through the all-access subscription. */
  viaSubscription: boolean;
}

export async function getCourseOwnership(userId: string, courseId: string): Promise<CourseOwnership> {
  const { data } = await createAdminClient()
    .from("entitlements")
    .select("scope_type, course_id, source, starts_at, ends_at")
    .eq("user_id", userId)
    .eq("status", "active")
    .in("source", ["purchase", "subscription"]);
  const now = Date.now();
  let purchasedUntil: string | null = null;
  let viaSubscription = false;
  for (const e of (data ?? []) as Pick<Entitlement, "scope_type" | "course_id" | "source" | "starts_at" | "ends_at">[]) {
    const ends = e.ends_at ? new Date(e.ends_at).getTime() : Infinity;
    if (ends <= now) continue;
    if (e.source === "subscription" && new Date(e.starts_at).getTime() <= now) viaSubscription = true;
    if (e.source === "purchase" && e.course_id === courseId && e.ends_at && (!purchasedUntil || e.ends_at > purchasedUntil)) purchasedUntil = e.ends_at;
  }
  return { purchasedUntil, viaSubscription };
}
