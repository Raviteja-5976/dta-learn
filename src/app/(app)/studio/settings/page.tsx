import type { Metadata } from "next";
import { Eyebrow, PageHeader } from "@/components/ui";
import { ImagesPanel, LanguagesPanel } from "@/components/studio/settings-panels";
import { AiTutorPanel, BillingPanel } from "@/components/studio/commerce-panels";
import { requireAdmin } from "@/lib/auth";
import { serverEnv } from "@/lib/env";
import { getAiTutorSettings } from "@/lib/settings";
import { createAdminClient } from "@/lib/supabase/server";
import type { BillingPlan, CompileLanguage, SandboxImage } from "@/lib/types";

export const metadata: Metadata = { title: "Studio · Settings" };

export default async function SettingsPage() {
  await requireAdmin();
  const admin = createAdminClient();
  const [{ data: languages }, { data: images }, { data: plans }, aiSettings, { count: aiUsed }] = await Promise.all([
    admin.from("compile_languages").select("*").order("slug"),
    admin.from("sandbox_images").select("*").order("slug").order("version", { ascending: false }),
    admin.from("billing_plans").select("*").order("created_at", { ascending: false }),
    getAiTutorSettings(),
    admin.from("ai_messages").select("id", { count: "exact", head: true }).eq("role", "user").gte("created_at", new Date(Date.now() - 86_400_000).toISOString()),
  ]);
  return (
    <div className="space-y-10 p-4 md:p-8">
      <PageHeader eyebrow="Studio · admin" title="Platform settings" description="Payments, the AI tutor, compile languages (Judge0) and terminal sandbox images." />
      <section className="space-y-4">
        <Eyebrow>Payments · all-access plan</Eyebrow>
        <p className="max-w-3xl text-sm text-ink/70">
          Single courses are sold at the price set on each course. The monthly plan unlocks every course. Payments go through Razorpay, and access is granted as entitlements (Learners shows them).
        </p>
        <BillingPanel
          plans={(plans ?? []) as BillingPlan[]}
          configured={serverEnv.razorpayConfigured()}
          webhookConfigured={Boolean(process.env.RAZORPAY_WEBHOOK_SECRET)}
          courseAccessMonths={serverEnv.billing().courseAccessMonths}
        />
      </section>
      <section className="space-y-4">
        <Eyebrow>AI tutor · Glitch</Eyebrow>
        <p className="max-w-3xl text-sm text-ink/70">
          Grok answers learners&apos; questions on articles and labs. It never sees lab solutions or hidden tests, and it is switched off on quizzes.
        </p>
        <AiTutorPanel settings={aiSettings} configured={serverEnv.xaiConfigured()} model={process.env.XAI_MODEL ?? "grok-4.3"} usedToday={aiUsed ?? 0} />
      </section>
      <section className="space-y-4">
        <Eyebrow>Compile languages</Eyebrow>
        <p className="max-w-3xl text-sm text-ink/70">
          Labs reference a language by slug. Judge0 language ids differ between Judge0 versions — fetch the list from your Judge0 and update the ids if a language reports “not on this Judge0”.
        </p>
        <LanguagesPanel languages={(languages ?? []) as CompileLanguage[]} judge0Configured={serverEnv.judge0Configured()} />
      </section>
      <section className="space-y-4">
        <Eyebrow>Sandbox images</Eyebrow>
        <ImagesPanel images={(images ?? []) as SandboxImage[]} />
      </section>
    </div>
  );
}
