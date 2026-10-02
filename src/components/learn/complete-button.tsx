"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, Check, Loader2 } from "lucide-react";
import { api } from "@/lib/api-client";

interface CompleteResponse {
  courseCompleted: boolean;
  certificateCode: string | null;
}

export function CompleteButton({ itemId, completed, nextHref }: { itemId: string; completed: boolean; nextHref: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    if (completed) {
      if (nextHref) router.push(nextHref);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await api<CompleteResponse>(`/api/items/${itemId}/complete`, { body: {} });
      if (res.certificateCode) router.push(`/verify/${res.certificateCode}?new=1`);
      else if (nextHref) router.push(nextHref);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button type="button" className="btn btn-primary btn-lg" onClick={onClick} disabled={busy || (completed && !nextHref)}>
        {busy ? <Loader2 className="size-5 animate-spin" /> : completed ? <ArrowRight className="size-5" /> : <Check className="size-5" />}
        {completed ? (nextHref ? "Next" : "Completed") : nextHref ? "Mark complete & continue" : "Mark complete"}
      </button>
      {error && <p className="text-sm text-coral">{error}</p>}
    </div>
  );
}
