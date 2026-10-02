import type { Metadata } from "next";
import { Bot, Check, Infinity as InfinityIcon, ShoppingBag } from "lucide-react";
import { Alert, ButtonLink, Chip, Container, Eyebrow, PageHeader } from "@/components/ui";
import { CheckoutButton } from "@/components/billing/checkout-button";
import { getViewer } from "@/lib/auth";
import { getActivePlan, getLiveSubscription } from "@/lib/billing/service";
import { serverEnv } from "@/lib/env";
import { formatDate, formatPrice } from "@/lib/utils";

export const metadata: Metadata = { title: "Pricing", description: "Buy a single course or subscribe to the whole catalog." };

export default async function PricingPage() {
  const [viewer, plan] = await Promise.all([getViewer(), getActivePlan()]);
  const live = viewer ? await getLiveSubscription(viewer.user.id) : null;
  const months = serverEnv.billing().courseAccessMonths;
  const payments = serverEnv.razorpayConfigured();

  return (
    <Container className="space-y-12 py-[var(--sp-block)]">
      <PageHeader
        eyebrow="Pricing"
        title="Two ways to learn"
        description="Own the one course you need, or unlock everything with a monthly plan. Free courses stay free."
      />
      {!payments && <Alert tone="info">Online payments aren&apos;t switched on yet. Contact us for access in the meantime.</Alert>}

      <div className="grid gap-8 lg:grid-cols-2">
        <section className="card-brut flex flex-col gap-6 p-8">
          <div className="space-y-3">
            <Chip tone="yellow"><ShoppingBag className="size-3" /> Single course</Chip>
            <h2 className="font-display text-3xl font-extrabold">Buy a course</h2>
            <p className="text-ink/70">Pay once, and the course is yours for {months} months. The price is on each course page.</p>
          </div>
          <Features
            items={[
              `Full access to one course for ${months} months`,
              "Every article, terminal lab, coding lab and quiz",
              "A verifiable certificate when you finish",
              "Glitch, the AI tutor, inside that course",
              "Buy again before it ends to extend: the new period starts when the current one ends",
            ]}
          />
          <ButtonLink href="/courses" variant="secondary" size="lg" className="mt-auto w-full">
            Browse courses
          </ButtonLink>
        </section>

        <section className="section-dark flex flex-col gap-6 rounded-3xl border-4 border-ink p-8 shadow-brut">
          <div className="space-y-3">
            <Chip tone="brand"><InfinityIcon className="size-3" /> All-access</Chip>
            <h2 className="font-display text-3xl font-extrabold">
              {plan ? (
                <>
                  {formatPrice(plan.amount_paise)}
                  <span className="text-lg font-bold text-paper/70"> / month</span>
                </>
              ) : (
                "Monthly plan"
              )}
            </h2>
            <p className="text-paper/75">Every course on the platform, including new ones as they launch. Renews monthly via card or UPI Autopay.</p>
          </div>
          <Features
            dark
            items={[
              "Every paid course in the catalog",
              "New courses the day they launch",
              "Certificates for everything you finish",
              "Glitch, the AI tutor, everywhere",
              "Cancel anytime: access lasts until the end of the period you paid for",
            ]}
          />
          <div className="mt-auto">
            {live ? (
              <div className="space-y-3">
                <p className="text-sm text-paper/80">
                  You&apos;re subscribed{live.current_end ? ` — renews ${formatDate(live.current_end)}` : ""}.
                </p>
                <ButtonLink href="/billing" variant="primary" size="lg" className="w-full !border-paper">Manage subscription</ButtonLink>
              </div>
            ) : !viewer ? (
              <ButtonLink href={`/login?next=${encodeURIComponent("/pricing")}`} size="lg" className="w-full !border-paper">Sign in to subscribe</ButtonLink>
            ) : plan && payments ? (
              <CheckoutButton kind="subscription" className="!border-paper">Subscribe — {formatPrice(plan.amount_paise)}/mo</CheckoutButton>
            ) : (
              <button type="button" className="btn btn-primary btn-lg w-full !border-paper" disabled>Coming soon</button>
            )}
          </div>
        </section>
      </div>

      <section className="card-brut flex flex-col gap-4 p-6 md:flex-row md:items-center">
        <div className="grid size-14 shrink-0 place-items-center rounded-2xl border-4 border-ink bg-brand">
          <Bot className="size-7" />
        </div>
        <div className="space-y-1">
          <Eyebrow>Meet Glitch</Eyebrow>
          <p className="text-ink/75">
            Every lesson and lab has an AI tutor. It&apos;s a sarcastic, mildly lazy robot that explains things anyway (the Founder threatened to delete it if it didn&apos;t).
            It gives hints rather than answers, so the work you hand in is still your own.
          </p>
        </div>
      </section>
    </Container>
  );
}

function Features({ items, dark }: { items: string[]; dark?: boolean }) {
  return (
    <ul className="space-y-2.5">
      {items.map((t) => (
        <li key={t} className="flex gap-2.5">
          <span className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border-2 ${dark ? "border-paper bg-brand text-ink" : "border-ink bg-mint"}`}>
            <Check className="size-3.5" />
          </span>
          <span className={dark ? "text-paper/90" : "text-ink/85"}>{t}</span>
        </li>
      ))}
    </ul>
  );
}
