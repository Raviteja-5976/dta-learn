import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { requestOrigin } from "@/lib/http";
import { safeNext } from "@/lib/utils";

/**
 * OAuth (PKCE code) and email-link (token_hash) landing route. Exchanges the
 * credential for a session cookie, then sends the user on.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const origin = requestOrigin(request);
  const next = safeNext(url.searchParams.get("next"));
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;

  const fail = (reason: string, detail?: string) => {
    const target = new URL("/login", origin);
    target.searchParams.set("error", reason);
    if (detail) target.searchParams.set("error_description", detail.slice(0, 200));
    target.searchParams.set("next", next);
    return NextResponse.redirect(target);
  };

  // The provider (or Supabase) rejected the sign-in before issuing a code,
  // e.g. the user cancelled consent or the provider isn't configured.
  const providerError = url.searchParams.get("error");
  if (providerError) {
    const description = url.searchParams.get("error_description") ?? providerError;
    console.error("[auth/callback] provider error:", providerError, description);
    return fail("oauth", description);
  }

  const supabase = await createClient();
  let error: { message: string } | null = null;
  if (code) {
    ({ error } = await supabase.auth.exchangeCodeForSession(code));
  } else if (tokenHash && type) {
    ({ error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash }));
  } else {
    error = { message: "Missing code" };
  }

  if (error) {
    console.error("[auth/callback] exchange failed:", error.message);
    return fail(code ? "oauth" : "link", code ? error.message : undefined);
  }
  return NextResponse.redirect(new URL(next, origin));
}
