import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { publicEnv, serverEnv } from "@/lib/env";

/**
 * Supabase client bound to the signed-in user's cookies. Every query runs
 * under RLS as that user. Use it for reads of the learner's own data.
 */
export async function createClient(): Promise<SupabaseClient> {
  const cookieStore = await cookies();
  return createServerClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component: cookies are read-only there.
          // The proxy refreshes the session, so this is safe to ignore.
        }
      },
    },
  });
}

let adminClient: SupabaseClient | null = null;

/**
 * Service-role client. Bypasses RLS — use ONLY on the server, and only after
 * the caller's identity and permissions have been checked in code.
 */
export function createAdminClient(): SupabaseClient {
  if (!adminClient) {
    adminClient = createSupabaseClient(publicEnv.supabaseUrl, serverEnv.supabaseServiceRoleKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return adminClient;
}
