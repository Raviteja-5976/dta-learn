import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured, serverEnv } from "@/lib/env";
import type { Profile, Role } from "@/lib/types";

export interface Viewer {
  user: User;
  profile: Profile;
}

/** The signed-in user and profile, or null. Cached per request. */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient();
  let { data: profile } = await admin.from("profiles").select("*").eq("id", user.id).maybeSingle<Profile>();

  // The auth trigger normally creates the profile; recover if it is missing.
  if (!profile) {
    const inserted = await admin
      .from("profiles")
      .upsert({
        id: user.id,
        email: user.email ?? "",
        full_name: (user.user_metadata?.full_name as string) ?? (user.user_metadata?.name as string) ?? null,
        avatar_url: (user.user_metadata?.avatar_url as string) ?? null,
      })
      .select("*")
      .single<Profile>();
    profile = inserted.data;
  }
  if (!profile) return null;

  // Bootstrap admins listed in ADMIN_EMAILS.
  const email = (user.email ?? "").toLowerCase();
  if (profile.role !== "admin" && email && serverEnv.adminEmails().includes(email)) {
    const { data: promoted } = await admin
      .from("profiles")
      .update({ role: "admin" })
      .eq("id", user.id)
      .select("*")
      .single<Profile>();
    if (promoted) profile = promoted;
  }

  return { user, profile };
});

export async function requireViewer(next?: string): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect(`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  return viewer;
}

export function isStaffRole(role: Role | undefined | null): boolean {
  return role === "instructor" || role === "admin";
}

export async function requireStaff(): Promise<Viewer> {
  const viewer = await requireViewer("/studio");
  if (!isStaffRole(viewer.profile.role)) redirect("/dashboard");
  return viewer;
}

export async function requireAdmin(): Promise<Viewer> {
  const viewer = await requireViewer("/studio");
  if (viewer.profile.role !== "admin") redirect("/studio");
  return viewer;
}

/** For route handlers: returns the viewer or a 401 response. */
export async function apiViewer(): Promise<Viewer | Response> {
  const viewer = await getViewer();
  if (!viewer) return Response.json({ error: "Sign in required" }, { status: 401 });
  return viewer;
}

export function displayName(profile: Pick<Profile, "full_name" | "email">): string {
  return profile.full_name?.trim() || profile.email.split("@")[0];
}
