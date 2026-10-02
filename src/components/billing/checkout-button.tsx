"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Alert } from "@/components/ui";
import { api, ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";

/* Razorpay Checkout is a hosted script; card and UPI details never touch our servers. */
const CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

interface RazorpayResponse {
  razorpay_payment_id: string;
  razorpay_order_id?: string;
  razorpay_subscription_id?: string;
  razorpay_signature: string;
}

interface RazorpayInstance {
  open: () => void;
  on: (event: "payment.failed", cb: (e: { error: { description?: string } }) => void) => void;
}

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}

let scriptPromise: Promise<void> | null = null;

function loadCheckout(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  scriptPromise ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = CHECKOUT_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      scriptPromise = null;
      reject(new Error("Could not load Razorpay Checkout. Check your connection or disable blockers and try again."));
    };
    document.body.appendChild(s);
  });
  return scriptPromise;
}

export function CheckoutButton({
  kind,
  courseId,
  children,
  variant = "primary",
  size = "lg",
  className,
}: {
  kind: "course" | "subscription";
  courseId?: string;
  children: ReactNode;
  variant?: "primary" | "secondary" | "dark";
  size?: "sm" | "lg";
  className?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const [options] = await Promise.all([
        api<Record<string, unknown>>(kind === "course" ? "/api/billing/orders" : "/api/billing/subscriptions", { body: kind === "course" ? { courseId } : {} }),
        loadCheckout(),
      ]);
      if (!window.Razorpay) throw new Error("Razorpay Checkout failed to start.");
      const rzp = new window.Razorpay({
        ...options,
        handler: async (res: RazorpayResponse) => {
          try {
            const out = await api<{ redirect: string }>(kind === "course" ? "/api/billing/orders/verify" : "/api/billing/subscriptions/verify", { body: res });
            router.push(out.redirect);
            router.refresh();
          } catch (e) {
            setError((e as Error).message);
            setBusy(false);
          }
        },
        modal: { ondismiss: () => setBusy(false), confirm_close: true },
      });
      rzp.on("payment.failed", (e) => setError(e.error.description ?? "The payment failed. No money was taken — please try again."));
      rzp.open();
    } catch (e) {
      setError(e instanceof ApiError || e instanceof Error ? e.message : "Something went wrong.");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <button type="button" onClick={start} disabled={busy} className={cn("btn w-full", `btn-${variant}`, `btn-${size}`, className)}>
        {busy && <Loader2 className="size-4 animate-spin" />} {children}
      </button>
      {error && <Alert tone="danger">{error}</Alert>}
    </div>
  );
}
