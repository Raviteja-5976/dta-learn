"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Alert, Field, Input } from "@/components/ui";
import { publicEnv } from "@/lib/env";

function origin(): string {
  return typeof window !== "undefined" ? window.location.origin : publicEnv.siteUrl;
}

function callbackUrl(next: string): string {
  return `${origin()}/auth/callback?next=${encodeURIComponent(next)}`;
}

function OAuthButtons({ next }: { next: string }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function go(provider: "google" | "github") {
    setBusy(provider);
    setError(null);
    const { error } = await createClient().auth.signInWithOAuth({ provider, options: { redirectTo: callbackUrl(next) } });
    if (error) {
      setError(error.message);
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <button type="button" className="btn btn-secondary" onClick={() => go("google")} disabled={!!busy}>
          {busy === "google" ? <Loader2 className="size-4 animate-spin" /> : <GoogleMark />} Google
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => go("github")} disabled={!!busy}>
          {busy === "github" ? <Loader2 className="size-4 animate-spin" /> : <GitHubMark />} GitHub
        </button>
      </div>
      {error && <Alert tone="danger">{error}</Alert>}
      <div className="flex items-center gap-3 font-mono text-[11px] font-bold uppercase tracking-widest text-ink/50">
        <span className="h-[3px] flex-1 bg-ink/15" /> or with email <span className="h-[3px] flex-1 bg-ink/15" />
      </div>
    </div>
  );
}

export function LoginForm({ next, initialError }: { next: string; initialError?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError ?? null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await createClient().auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message === "Invalid login credentials" ? "That email and password don't match." : error.message);
      setBusy(false);
      return;
    }
    router.replace(next);
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <OAuthButtons next={next} />
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Email" htmlFor="email">
          <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Password" htmlFor="password">
          <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {error && <Alert tone="danger">{error}</Alert>}
        <button type="submit" className="btn btn-primary btn-lg w-full" disabled={busy}>
          {busy && <Loader2 className="size-4 animate-spin" />} Sign in
        </button>
      </form>
      <div className="flex justify-between text-sm">
        <Link href="/forgot-password" className="font-semibold underline decoration-brand decoration-[3px] underline-offset-4">Forgot password?</Link>
        <Link href={`/signup?next=${encodeURIComponent(next)}`} className="font-semibold underline decoration-brand decoration-[3px] underline-offset-4">Create account</Link>
      </div>
    </div>
  );
}

export function SignupForm({ next }: { next: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      setError("Use at least 8 characters for your password.");
      return;
    }
    setBusy(true);
    setError(null);
    const { data, error } = await createClient().auth.signUp({
      email,
      password,
      options: { emailRedirectTo: callbackUrl(next), data: { full_name: name } },
    });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    if (data.session) {
      router.replace(next);
      router.refresh();
    } else {
      setSent(true);
    }
  }

  if (sent) {
    return (
      <Alert tone="success" title="Check your inbox">
        We sent a confirmation link to <strong>{email}</strong>. Open it to activate your account.
      </Alert>
    );
  }

  return (
    <div className="space-y-5">
      <OAuthButtons next={next} />
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Full name" htmlFor="name" hint="Shown on your certificates.">
          <Input id="name" autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Email" htmlFor="email">
          <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Password" htmlFor="password" hint="At least 8 characters.">
          <Input id="password" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {error && <Alert tone="danger">{error}</Alert>}
        <button type="submit" className="btn btn-primary btn-lg w-full" disabled={busy}>
          {busy && <Loader2 className="size-4 animate-spin" />} Create account
        </button>
      </form>
      <p className="text-center text-sm">
        Already have an account?{" "}
        <Link href={`/login?next=${encodeURIComponent(next)}`} className="font-semibold underline decoration-brand decoration-[3px] underline-offset-4">Sign in</Link>
      </p>
    </div>
  );
}

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await createClient().auth.resetPasswordForEmail(email, { redirectTo: callbackUrl("/reset-password") });
    setBusy(false);
    if (error) setError(error.message);
    else setDone(true);
  }

  if (done) return <Alert tone="success" title="Email sent">If an account exists for {email}, a reset link is on its way.</Alert>;

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="Email" htmlFor="email">
        <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      {error && <Alert tone="danger">{error}</Alert>}
      <button type="submit" className="btn btn-primary btn-lg w-full" disabled={busy}>
        {busy && <Loader2 className="size-4 animate-spin" />} Send reset link
      </button>
    </form>
  );
}

export function ResetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    setBusy(true);
    const { error } = await createClient().auth.updateUser({ password });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="New password" htmlFor="password">
        <Input id="password" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      {error && <Alert tone="danger">{error}</Alert>}
      <button type="submit" className="btn btn-primary btn-lg w-full" disabled={busy}>
        {busy && <Loader2 className="size-4 animate-spin" />} Update password
      </button>
    </form>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.7z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24z" />
      <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.3a12 12 0 0 0 0 10.8l4-3.1z" />
      <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9z" />
    </svg>
  );
}

function GitHubMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden fill="currentColor">
      <path d="M12 .5a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2c-3.3.7-4-1.6-4-1.6-.6-1.4-1.4-1.8-1.4-1.8-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1.1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.8-1.6-2.7-.3-5.5-1.3-5.5-5.9 0-1.3.5-2.4 1.2-3.2-.1-.3-.5-1.5.1-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0C17.3 4.6 18.3 5 18.3 5c.7 1.7.2 2.9.1 3.2.8.8 1.2 1.9 1.2 3.2 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .5z" />
    </svg>
  );
}
