"use client";

import { useState } from "react";
import { Bot, Link2, Plus, Save } from "lucide-react";
import { Alert, Chip, Field, Input } from "@/components/ui";
import { useAction } from "./use-action";
import { setBillingPlan, stopSellingPlan, updateAiTutorSettings } from "@/app/(app)/studio/actions";
import { formatDate, formatPrice } from "@/lib/utils";
import type { AiTutorSettings, BillingPlan } from "@/lib/types";

export function BillingPanel({
  plans,
  configured,
  webhookConfigured,
  courseAccessMonths,
}: {
  plans: BillingPlan[];
  configured: boolean;
  webhookConfigured: boolean;
  courseAccessMonths: number;
}) {
  const { run, pending, error } = useAction();
  const [name, setName] = useState("All-Access Monthly");
  const [amount, setAmount] = useState(999);
  const [planId, setPlanId] = useState("");
  const active = plans.find((p) => p.active);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Chip tone={configured ? "mint" : "coral"}>{configured ? "Razorpay keys set" : "RAZORPAY_KEY_ID / SECRET not set"}</Chip>
        <Chip tone={webhookConfigured ? "mint" : "coral"}>{webhookConfigured ? "Webhook secret set" : "RAZORPAY_WEBHOOK_SECRET not set"}</Chip>
        <Chip tone="sunk">Course purchases unlock {courseAccessMonths} months</Chip>
      </div>
      {error && <Alert tone="danger">{error}</Alert>}

      <div className="card-brut flex flex-wrap items-center gap-3 p-4">
        {active ? (
          <>
            <span className="font-display text-lg font-bold">{active.name}</span>
            <Chip tone="mint">On sale</Chip>
            <span className="font-mono text-sm">{formatPrice(active.amount_paise)}/month</span>
            <span className="font-mono text-xs text-ink/60">{active.provider_plan_id}</span>
            <button type="button" className="btn btn-ghost btn-sm ml-auto" disabled={pending} onClick={() => confirm("Stop selling this plan? Existing subscribers keep billing on it.") && run(() => stopSellingPlan())}>
              Stop selling
            </button>
          </>
        ) : (
          <p className="text-sm text-ink/70">No plan is on sale, so the pricing page and course pages show only single-course purchases.</p>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <form
          className="card-brut space-y-4 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (active && !confirm(`Replace ${active.name} (${formatPrice(active.amount_paise)}/mo)? Existing subscribers stay on their current price.`)) return;
            run(() => setBillingPlan({ mode: "create", name, amountRupees: amount }));
          }}
        >
          <p className="font-display font-bold">Create a new monthly plan</p>
          <p className="text-xs text-ink/60">Creates the plan in Razorpay and puts it on sale. Razorpay plans can&apos;t be edited, so changing the price means creating a new plan.</p>
          <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
            <Field label="Plan name" htmlFor="plan-name"><Input id="plan-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} /></Field>
            <Field label="₹ per month" htmlFor="plan-amount"><Input id="plan-amount" type="number" min={1} value={amount} onChange={(e) => setAmount(Number(e.target.value))} required /></Field>
          </div>
          <button type="submit" className="btn btn-primary btn-sm" disabled={pending || !configured}><Plus className="size-4" /> Create and sell</button>
        </form>
        <form
          className="card-brut space-y-4 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => setBillingPlan({ mode: "link", planId }), { onSuccess: () => setPlanId("") });
          }}
        >
          <p className="font-display font-bold">…or link an existing plan</p>
          <p className="text-xs text-ink/60">Made the plan in Razorpay Dashboard → Subscriptions → Plans? Paste its id here.</p>
          <Field label="Razorpay plan id" htmlFor="plan-id"><Input id="plan-id" value={planId} onChange={(e) => setPlanId(e.target.value)} placeholder="plan_XXXXXXXXXXXX" required className="font-mono" /></Field>
          <button type="submit" className="btn btn-secondary btn-sm" disabled={pending || !configured}><Link2 className="size-4" /> Link and sell</button>
        </form>
      </div>

      {plans.length > 1 && (
        <details className="card-brut p-4">
          <summary className="eyebrow cursor-pointer">Previous plans ({plans.length - 1})</summary>
          <ul className="mt-3 space-y-1 font-mono text-xs">
            {plans.filter((p) => !p.active).map((p) => (
              <li key={p.id}>{p.provider_plan_id} · {p.name} · {formatPrice(p.amount_paise)}/mo · {formatDate(p.created_at)}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

export function AiTutorPanel({ settings, configured, model, usedToday }: { settings: AiTutorSettings; configured: boolean; model: string; usedToday: number }) {
  const { run, pending, error } = useAction();
  const [enabled, setEnabled] = useState(settings.enabled);
  const [limit, setLimit] = useState(settings.dailyLimit);
  const dirty = enabled !== settings.enabled || limit !== settings.dailyLimit;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Chip tone={configured ? "mint" : "coral"}>{configured ? "XAI_API_KEY set" : "XAI_API_KEY not set"}</Chip>
        <Chip tone="sunk">model {model}</Chip>
        <Chip tone="sunk">{usedToday} questions in the last 24 h</Chip>
      </div>
      {error && <Alert tone="danger">{error}</Alert>}
      <form
        className="card-brut flex flex-wrap items-end gap-5 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => updateAiTutorSettings({ enabled, dailyLimit: limit }));
        }}
      >
        <div className="grid size-12 place-items-center rounded-2xl border-4 border-ink bg-brand text-on-brand"><Bot className="size-6" /></div>
        <label className="flex items-center gap-2 pb-2 font-semibold">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="size-4 accent-[#1B1F3B]" />
          Glitch is on
        </label>
        <Field label="Questions per learner per day" htmlFor="ai-limit" hint="Rolling 24 hours. Staff are not limited. 0 turns the tutor off for learners.">
          <Input id="ai-limit" type="number" min={0} max={1000} value={limit} onChange={(e) => setLimit(Number(e.target.value))} className="w-32" />
        </Field>
        <button type="submit" className="btn btn-primary btn-sm" disabled={!dirty || pending}><Save className="size-4" /> Save</button>
      </form>
    </div>
  );
}
