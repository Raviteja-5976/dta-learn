import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignupForm } from "@/components/auth/auth-forms";
import { getViewer } from "@/lib/auth";
import { safeNext } from "@/lib/utils";

export const metadata: Metadata = { title: "Create account" };

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next);
  if (await getViewer()) redirect(next);
  return (
    <AuthShell title="Start learning" subtitle="Free account. Real Linux and code labs in your browser.">
      <SignupForm next={next} />
    </AuthShell>
  );
}
