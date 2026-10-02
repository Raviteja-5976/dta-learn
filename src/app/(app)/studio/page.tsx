import type { Metadata } from "next";
import Link from "next/link";
import { Eyebrow, PageHeader, StatTile } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { relativeTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Studio" };

export default async function StudioOverview() {
  const viewer = await requireStaff();
  const admin = createAdminClient();
  const since30 = new Date(Date.now() - 30 * 86_400_000).toISOString();

  const [courses, learners, enrollments, completions, labPasses, runs, audit, hints, failedChecks] = await Promise.all([
    admin.from("courses").select("id, status", { count: "exact" }),
    admin.from("profiles").select("id", { count: "exact", head: true }),
    admin.from("enrollments").select("id", { count: "exact", head: true }).gte("enrolled_at", since30),
    admin.from("enrollments").select("id", { count: "exact", head: true }).gte("completed_at", since30),
    admin.from("lab_attempts").select("id", { count: "exact", head: true }).eq("status", "completed").gte("completed_at", since30),
    admin.from("code_runs").select("verdict").gte("created_at", since30).limit(5000),
    admin.from("audit_logs").select("action, resource_type, resource_id, created_at, actor_id").order("created_at", { ascending: false }).limit(12),
    admin.from("learning_events").select("object_id").eq("verb", "revealed_hint").gte("ts", since30).limit(5000),
    admin.from("validation_results").select("step_id, attempt_id").eq("passed", false).gte("created_at", since30).limit(5000),
  ]);

  const published = (courses.data ?? []).filter((c: { status: string }) => c.status === "published").length;
  const verdicts = new Map<string, number>();
  for (const r of (runs.data ?? []) as { verdict: string | null }[]) verdicts.set(r.verdict ?? "unknown", (verdicts.get(r.verdict ?? "unknown") ?? 0) + 1);
  const totalRuns = [...verdicts.values()].reduce((a, b) => a + b, 0);
  const platformErrors = verdicts.get("internal_error") ?? 0;

  // "Hardest steps": hint reveals per lab step (design §6).
  const hintCounts = new Map<string, number>();
  for (const h of (hints.data ?? []) as { object_id: string | null }[]) if (h.object_id) hintCounts.set(h.object_id, (hintCounts.get(h.object_id) ?? 0) + 1);
  const hardest = [...hintCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const labIds = [...new Set(hardest.map(([k]) => k.split(":")[0]))];
  const { data: labTitles } = labIds.length ? await admin.from("labs").select("id, title").in("id", labIds) : { data: [] };
  const labTitle = new Map(((labTitles ?? []) as { id: string; title: string }[]).map((l) => [l.id, l.title]));

  return (
    <div className="space-y-10 p-4 md:p-8">
      <PageHeader eyebrow="Studio" title="Overview" description={`Signed in as ${viewer.profile.role}. Numbers cover the last 30 days.`} />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <StatTile label="Courses live" value={published} hint={`${courses.count ?? 0} total`} />
        <StatTile label="Learners" value={learners.count ?? 0} />
        <StatTile label="Enrollments" value={enrollments.count ?? 0} />
        <StatTile label="Completions" value={completions.count ?? 0} accent="text-ink" />
        <StatTile label="Labs passed" value={labPasses.count ?? 0} />
        <StatTile label="Code runs" value={totalRuns} hint={totalRuns ? `${((platformErrors / totalRuns) * 100).toFixed(1)}% platform errors` : "—"} />
      </div>

      <div className="grid gap-8 xl:grid-cols-2">
        <section className="card-brut space-y-4 p-6">
          <Eyebrow>Hardest lab steps (hint reveals)</Eyebrow>
          {hardest.length ? (
            <table className="w-full text-sm">
              <tbody>
                {hardest.map(([key, n]) => {
                  const [labId, step] = key.split(":");
                  return (
                    <tr key={key} className="border-b-2 border-ink/10 last:border-0">
                      <td className="py-2">
                        <Link href={`/studio/labs/${labId}`} className="font-semibold hover:underline">{labTitle.get(labId) ?? "Lab"}</Link>
                        <span className="ml-2 font-mono text-xs text-ink/60">{step}</span>
                      </td>
                      <td className="py-2 text-right font-mono tabular-nums">{n}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-ink/60">No hint reveals yet.</p>
          )}
          <p className="text-xs text-ink/50">Failed checks in the period: {(failedChecks.data ?? []).length}</p>
        </section>

        <section className="card-brut space-y-4 p-6">
          <Eyebrow>Recent changes (audit log)</Eyebrow>
          {(audit.data ?? []).length ? (
            <ul className="space-y-2 text-sm">
              {(audit.data as { action: string; resource_type: string; resource_id: string | null; created_at: string }[]).map((a, i) => (
                <li key={i} className="flex items-center gap-3 border-b-2 border-ink/10 pb-2 last:border-0">
                  <code className="rounded border-2 border-ink bg-paper-sunk px-1.5 font-mono text-xs">{a.action}</code>
                  <span className="truncate text-ink/60">{a.resource_type}</span>
                  <span className="ml-auto shrink-0 font-mono text-xs text-ink/50">{relativeTime(a.created_at)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink/60">Nothing yet.</p>
          )}
        </section>
      </div>
    </div>
  );
}
