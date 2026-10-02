import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { serverEnv } from "@/lib/env";
import { HttpError } from "@/lib/http";

/**
 * Thin Razorpay REST client (design §13: Razorpay first). Card and UPI data
 * never touch our servers — Checkout collects them; we only create orders and
 * subscriptions, verify signatures and read state back.
 */

const API = "https://api.razorpay.com/v1";

export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
  receipt: string | null;
  status: "created" | "attempted" | "paid";
}

export interface RazorpayPlan {
  id: string;
  period: "daily" | "weekly" | "monthly" | "yearly";
  interval: number;
  item: { name: string; amount: number; currency: string };
}

export interface RazorpaySubscription {
  id: string;
  plan_id: string;
  status: "created" | "authenticated" | "active" | "pending" | "halted" | "cancelled" | "completed" | "expired";
  current_start: number | null;
  current_end: number | null;
  ended_at: number | null;
  notes: Record<string, string> | [];
}

export interface RazorpayPayment {
  id: string;
  order_id: string | null;
  amount: number;
  currency: string;
  status: string;
  method: string | null;
  amount_refunded?: number;
  notes?: Record<string, string> | [];
}

async function rzp<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const { keyId, keySecret } = serverEnv.razorpay();
  const res = await fetch(`${API}${path}`, {
    method: init?.method ?? (init?.body ? "POST" : "GET"),
    headers: {
      Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: { description?: string } } & T;
  if (!res.ok) {
    console.error("Razorpay error", res.status, path, data?.error);
    throw new HttpError(502, `Payment provider error: ${data?.error?.description ?? res.statusText}`);
  }
  return data;
}

export const razorpay = {
  createOrder: (input: { amountPaise: number; receipt: string; notes: Record<string, string> }) =>
    rzp<RazorpayOrder>("/orders", { body: { amount: input.amountPaise, currency: "INR", receipt: input.receipt, notes: input.notes } }),

  createPlan: (input: { name: string; amountPaise: number; description?: string }) =>
    rzp<RazorpayPlan>("/plans", {
      body: { period: "monthly", interval: 1, item: { name: input.name, amount: input.amountPaise, currency: "INR", description: input.description } },
    }),

  fetchPlan: (planId: string) => rzp<RazorpayPlan>(`/plans/${encodeURIComponent(planId)}`),

  createSubscription: (input: { planId: string; totalCount: number; notes: Record<string, string> }) =>
    rzp<RazorpaySubscription>("/subscriptions", {
      body: { plan_id: input.planId, total_count: input.totalCount, customer_notify: 1, notes: input.notes },
    }),

  fetchSubscription: (id: string) => rzp<RazorpaySubscription>(`/subscriptions/${encodeURIComponent(id)}`),

  cancelSubscription: (id: string, atCycleEnd: boolean) =>
    rzp<RazorpaySubscription>(`/subscriptions/${encodeURIComponent(id)}/cancel`, { body: { cancel_at_cycle_end: atCycleEnd ? 1 : 0 } }),

  fetchPayment: (id: string) => rzp<RazorpayPayment>(`/payments/${encodeURIComponent(id)}`),
};

// ── signatures ──────────────────────────────────────────────────────────────
function hmacHex(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Checkout success for an Order: HMAC(order_id|payment_id). */
export function verifyOrderSignature(orderId: string, paymentId: string, signature: string): boolean {
  return safeEqualHex(hmacHex(`${orderId}|${paymentId}`, serverEnv.razorpay().keySecret), signature);
}

/** Checkout success for a Subscription: HMAC(payment_id|subscription_id). */
export function verifySubscriptionSignature(subscriptionId: string, paymentId: string, signature: string): boolean {
  return safeEqualHex(hmacHex(`${paymentId}|${subscriptionId}`, serverEnv.razorpay().keySecret), signature);
}

/** Webhooks: HMAC of the raw body with the webhook secret (not the key secret). */
export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  const secret = serverEnv.razorpay().webhookSecret;
  if (!secret) throw new HttpError(503, "RAZORPAY_WEBHOOK_SECRET is not set");
  return safeEqualHex(hmacHex(rawBody, secret), signature);
}

/** Razorpay timestamps are unix seconds. */
export function fromUnix(seconds: number | null | undefined): string | null {
  return seconds ? new Date(seconds * 1000).toISOString() : null;
}
