"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Alert } from "@/components/ui";
import { api } from "@/lib/api-client";

export function CancelSubscriptionButton({ periodEnd }: { periodEnd: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cancel() {
    const until = periodEnd ? new Date(periodEnd).toLocaleDateString("en-IN", { dateStyle: "medium" }) : "the end of this billing period";
    if (!confirm(`Cancel your subscription? You'll keep access until ${until}, and you won't be charged again.`)) return;
    setBusy(true);
    setError(null);
    try {
      await api("/api/billing/subscriptions/cancel", { body: {} });
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <button type="button" className="btn btn-ghost btn-sm" onClick={cancel} disabled={busy}>
        {busy && <Loader2 className="size-4 animate-spin" />} Cancel subscription
      </button>
      {error && <Alert tone="danger">{error}</Alert>}
    </div>
  );
}
