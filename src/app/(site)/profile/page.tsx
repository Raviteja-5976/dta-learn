import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Alert, Chip, Container, Field, Input, PageHeader } from "@/components/ui";
import { Avatar } from "@/components/site/user-menu";
import { displayName, requireViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Profile" };

async function saveProfile(formData: FormData) {
  "use server";
  await requireViewer("/profile");
  const fullName = String(formData.get("full_name") ?? "").trim().slice(0, 120);
  const headline = String(formData.get("headline") ?? "").trim().slice(0, 160);
  // Runs as the user under RLS; only full_name, headline and avatar_url are updatable.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { error } = await supabase.from("profiles").update({ full_name: fullName || null, headline: headline || null }).eq("id", user.id);
  if (error) redirect(`/profile?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/", "layout");
  redirect("/profile?saved=1");
}

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const viewer = await requireViewer("/profile");
  const sp = await searchParams;
  const { profile, user } = viewer;
  const provider = (user.app_metadata?.provider as string) ?? "email";

  return (
    <Container className="max-w-3xl space-y-10 py-[var(--sp-block)]">
      <PageHeader eyebrow="Account" title="Profile" />
      <div className="card-brut flex items-center gap-5 p-6">
        <Avatar name={displayName(profile)} url={profile.avatar_url} size={64} />
        <div className="space-y-1">
          <p className="font-display text-xl font-bold">{displayName(profile)}</p>
          <p className="text-sm text-ink/60">{profile.email}</p>
          <div className="flex gap-2">
            <Chip tone="sunk">{profile.role}</Chip>
            <Chip tone="sunk">via {provider}</Chip>
            <Chip tone="sunk">since {formatDate(profile.created_at)}</Chip>
          </div>
        </div>
      </div>

      <form action={saveProfile} className="card-brut space-y-5 p-6">
        {sp.saved && <Alert tone="success">Profile saved.</Alert>}
        {sp.error && <Alert tone="danger">{sp.error}</Alert>}
        <Field label="Full name" htmlFor="full_name" hint="Printed on your certificates.">
          <Input id="full_name" name="full_name" defaultValue={profile.full_name ?? ""} maxLength={120} />
        </Field>
        <Field label="Headline" htmlFor="headline" hint="For example: Backend developer in training">
          <Input id="headline" name="headline" defaultValue={profile.headline ?? ""} maxLength={160} />
        </Field>
        <div className="flex justify-end">
          <button type="submit" className="btn btn-primary">Save profile</button>
        </div>
      </form>

      {provider === "email" && (
        <div className="card-brut flex flex-col gap-3 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-display font-bold">Password</p>
            <p className="text-sm text-ink/60">Change the password you use to sign in.</p>
          </div>
          <a href="/reset-password" className="btn btn-secondary btn-sm">Change password</a>
        </div>
      )}
    </Container>
  );
}
