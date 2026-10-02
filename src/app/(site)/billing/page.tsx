import type { Metadata } from "next";
import Link from "next/link";
import { CreditCard, Infinity as InfinityIcon, Receipt, ShoppingBag } from "lucide-react";
import { Alert, ButtonLink, Chip, Container, EmptyState, Eyebrow, PageHeader, type ChipTone } from "@/components/ui";
import { CancelSubscriptionButton } from "@/components/billing/cancel-subscription-button";
import { requireViewer } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { formatDate, formatPrice } from "@/lib/utils";
import type { BillingPlan, Entitlement, Payment, Subscription, SubscriptionStatus } from "@/lib/types";

export const metadata: Metadata = { title: "Billing" };

const SUB_STATUS: Record<SubscriptionStatus, { label: string; tone: ChipTone }> = {
  created: { label: "Awaiting payment", tone: "sunk" },
  authenticated: { label: "Starting", tone: "yellow" },
  active: { label: "Active", tone: "mint" },
  pending: { label: "Payment retrying", tone: "yellow" },
  halted: { label: "Payment failed", tone: "coral" },
  cancelled: { label: "Cancelled", tone: "sunk" },
  completed: { label: "Completed", tone: "sunk" },
  expired: { label: "Expired", tone: "sunk" },
};

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ subscribed?: string }> }) {
  const viewer = await requireViewer("/billing");
  const { subscribed } = await searchParams;
  const admin = createAdminClient();
  const uid = viewer.user.id;

  const [{ data: subs }, { data: purchases }, { data: payments }] = await Promise.all([
    admin.from("subscriptions").select("*").eq("user_id", uid).neq("status", "created").order("created_at", { ascending: false }).limit(1),
    admin.from("entitlements").select("*").eq("user_id", uid).eq("source", "purchase").order("ends_at", { ascending: false }),
    admin.from("payments").select("*").eq("user_id", uid).order("created_at", { ascending: false }).limit(50),
  ]);
  const sub = ((subs ?? []) as Subscription[])[0] ?? null;
  const { data: plan } = sub ? await admin.from("billing_plans").select("*").eq("id", sub.plan_id).maybeSingle<BillingPlan>() : { data: null };

  const courseIds = [...new Set(((purchases ?? []) as Entitlement[]).map((e) => e.course_id).filter(Boolean))] as string[];
  const { data: courses } = courseIds.length ? await admin.from("courses").select("id, slug, title").in("id", courseIds) : { data: [] };
  const courseBy = new Map(((courses ?? []) as { id: string; slug: string; title: string }[]).map((c) => [c.id, c]));

  const now = Date.now();
  const live = sub && ["active", "authenticated", "pending"].includes(sub.status);
  const accessUntil = sub?.current_end && new Date(sub.current_end).getTime() > now ? sub.current_end : null;

  return (
    <Container className="max-w-4xl space-y-10 py-[var(--sp-block)]">
      <PageHeader eyebrow="Account" title="Billing" description="Your subscription, purchased courses and receipts." />
      {subscribed && <Alert tone="success" title="Welcome to All-Access 🎉">Every course is unlocked. Go learn something, and say hi to Glitch.</Alert>}

      <section className="card-brut space-y-4 p-6">
        <div className="flex items-center gap-2">
          <InfinityIcon className="size-5" />
          <Eyebrow>All-access subscription</Eyebrow>
        </div>
        {sub ? (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-display text-xl font-bold">{plan?.name ?? "All-Access"}</p>
                <Chip tone={SUB_STATUS[sub.status].tone}>{sub.cancel_at_period_end && sub.status === "active" ? "Cancels at period end" : SUB_STATUS[sub.status].label}</Chip>
              </div>
              {plan && <p className="text-sm text-ink/70">{formatPrice(plan.amount_paise)} per month</p>}
              {live && sub.current_end && (
                <p className="text-sm text-ink/70">
                  {sub.cancel_at_period_end ? "Access ends" : "Renews"} on <strong>{formatDate(sub.current_end)}</strong>
                </p>
              )}
              {!live && accessUntil && <p className="text-sm text-ink/70">You keep access until <strong>{formatDate(accessUntil)}</strong>.</p>}
              {sub.status === "halted" && <p className="text-sm text-ink/70">Your renewals failed, so access is paused. Subscribe again to restore it.</p>}
            </div>
            {live && !sub.cancel_at_period_end ? (
              <CancelSubscriptionButton periodEnd={sub.current_end} />
            ) : !live ? (
              <ButtonLink href="/pricing" size="sm">Subscribe again</ButtonLink>
            ) : null}
          </div>
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-ink/70">One monthly price for every course on the platform.</p>
            <ButtonLink href="/pricing" size="sm">See the plan</ButtonLink>
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <ShoppingBag className="size-5" />
          <Eyebrow>Purchased courses</Eyebrow>
        </div>
        {(purchases ?? []).length ? (
          <ul className="card-brut divide-y-2 divide-ink/10 overflow-hidden">
            {((purchases ?? []) as Entitlement[]).map((e) => {
              const course = e.course_id ? courseBy.get(e.course_id) : null;
              const ended = e.ends_at ? new Date(e.ends_at).getTime() <= now : false;
              const upcoming = new Date(e.starts_at).getTime() > now;
              const tone: ChipTone = e.status === "revoked" ? "coral" : ended ? "sunk" : upcoming ? "sky" : "mint";
              const label = e.status === "revoked" ? "Refunded" : ended ? "Expired" : upcoming ? "Queued" : "Active";
              return (
                <li key={e.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <span className="min-w-0 flex-1">
                    {course ? <Link href={`/courses/${course.slug}`} className="font-semibold hover:underline">{course.title}</Link> : <span className="font-semibold">Deleted course</span>}
                    <span className="block font-mono text-[11px] text-ink/60">
                      {formatDate(e.starts_at)} → {formatDate(e.ends_at)}
                    </span>
                  </span>
                  <Chip tone={tone}>{label}</Chip>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState title="No purchased courses" description="Courses you buy show up here, with the date your access ends." icon={<CreditCard className="size-8" />} />
        )}
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Receipt className="size-5" />
          <Eyebrow>Payment history</Eyebrow>
        </div>
        {(payments ?? []).length ? (
          <div className="overflow-x-auto rounded-3xl border-4 border-ink bg-white shadow-brut-sm">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="border-b-4 border-ink bg-paper-sunk font-mono text-[11px] uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-2 text-left">Date</th>
                  <th className="px-4 py-2 text-left">For</th>
                  <th className="px-4 py-2 text-left">Amount</th>
                  <th className="px-4 py-2 text-left">Status</th>
                  <th className="px-4 py-2 text-left">Reference</th>
                </tr>
              </thead>
              <tbody>
                {((payments ?? []) as Payment[]).map((p) => (
                  <tr key={p.id} className="border-b-2 border-ink/10 last:border-0">
                    <td className="px-4 py-2">{formatDate(p.created_at)}</td>
                    <td className="px-4 py-2">{p.subscription_id ? "All-Access subscription" : "Course purchase"}</td>
                    <td className="px-4 py-2 tabular-nums">{formatPrice(p.amount_paise)}</td>
                    <td className="px-4 py-2 capitalize">{p.status.replace("_", " ")}</td>
                    <td className="px-4 py-2 font-mono text-xs text-ink/60">{p.provider_payment_id}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-ink/60">No payments yet.</p>
        )}
      </section>
    </Container>
  );
}
