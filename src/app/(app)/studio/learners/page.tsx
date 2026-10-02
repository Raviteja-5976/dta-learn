import type { Metadata } from "next";
import { Search } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { LearnersTable } from "@/components/studio/learners-table";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

export const metadata: Metadata = { title: "Studio · Learners" };

export default async function LearnersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const viewer = await requireAdmin();
  const { q } = await searchParams;
  const admin = createAdminClient();
  let query = admin.from("profiles").select("*").order("created_at", { ascending: false }).limit(100);
  const term = q?.replace(/[%_,()]/g, " ").trim();
  if (term) query = query.or(`email.ilike.%${term}%,full_name.ilike.%${term}%`);
  const { data: profiles } = await query;
  const ids = ((profiles ?? []) as Profile[]).map((p) => p.id);

  const [{ data: enrollments }, { data: entitlements }, { data: courses }] = await Promise.all([
    ids.length ? admin.from("enrollments").select("user_id, completed_at").in("user_id", ids) : Promise.resolve({ data: [] }),
    ids.length ? admin.from("entitlements").select("id, user_id, scope_type, course_id, status, ends_at").in("user_id", ids).order("created_at", { ascending: false }) : Promise.resolve({ data: [] }),
    admin.from("courses").select("id, title").order("title"),
  ]);
  const titleBy = new Map(((courses ?? []) as { id: string; title: string }[]).map((c) => [c.id, c.title]));

  const learners = ((profiles ?? []) as Profile[]).map((p) => {
    const en = ((enrollments ?? []) as { user_id: string; completed_at: string | null }[]).filter((e) => e.user_id === p.id);
    return {
      id: p.id,
      email: p.email,
      full_name: p.full_name,
      role: p.role,
      created_at: p.created_at,
      enrollments: en.length,
      completed: en.filter((e) => e.completed_at).length,
      entitlements: ((entitlements ?? []) as { id: string; user_id: string; scope_type: string; course_id: string | null; status: string; ends_at: string | null }[])
        .filter((e) => e.user_id === p.id)
        .map((e) => ({ id: e.id, scope_type: e.scope_type, course_title: e.course_id ? titleBy.get(e.course_id) ?? null : null, status: e.status, ends_at: e.ends_at })),
    };
  });

  return (
    <div className="space-y-8 p-4 md:p-8">
      <PageHeader
        eyebrow="Studio · admin"
        title="Learners"
        description="Change roles and grant course access. Grants are entitlements — the same mechanism payments will use."
      />
      <form className="flex max-w-lg gap-3">
        <input name="q" defaultValue={q} placeholder="Search by email or name" className="input-brut input-sm" aria-label="Search learners" />
        <button type="submit" className="btn btn-dark btn-sm" aria-label="Search"><Search className="size-4" /></button>
      </form>
      <LearnersTable learners={learners} courses={(courses ?? []) as { id: string; title: string }[]} selfId={viewer.user.id} />
    </div>
  );
}
