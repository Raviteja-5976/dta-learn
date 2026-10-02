import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/auth-forms";
import { getViewer } from "@/lib/auth";
import { safeNext } from "@/lib/utils";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  if (await getViewer()) redirect(next);
  return (
    <AuthShell title="Welcome back" subtitle="Sign in to pick up where you left off.">
      <LoginForm next={next} initialError={sp.error ? "Sign-in link was invalid or expired. Please try again." : undefined} />
    </AuthShell>
  );
}
