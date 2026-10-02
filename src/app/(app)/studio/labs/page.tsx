import type { Metadata } from "next";
import Link from "next/link";
import { Code2, Plus, SquareTerminal } from "lucide-react";
import { Chip, EmptyState, PageHeader } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { relativeTime } from "@/lib/utils";
import type { Lab } from "@/lib/types";
import { createLab } from "../actions";

export const metadata: Metadata = { title: "Studio · Labs" };

export default async function StudioLabs() {
  const viewer = await requireStaff();
  let q = createAdminClient().from("labs").select("*").order("updated_at", { ascending: false });
  if (viewer.profile.role !== "admin") q = q.eq("owner_id", viewer.user.id);
  const { data } = await q;
  const labs = (data ?? []) as Lab[];
  const ids = labs.map((l) => l.id);
  const { data: versions } = ids.length ? await createAdminClient().from("lab_versions").select("lab_id, version").in("lab_id", ids) : { data: [] };
  const latest = new Map<string, number>();
  for (const v of (versions ?? []) as { lab_id: string; version: number }[]) latest.set(v.lab_id, Math.max(latest.get(v.lab_id) ?? 0, v.version));

  return (
    <div className="space-y-8 p-4 md:p-8">
      <PageHeader
        eyebrow="Studio"
        title="Labs"
        description="A lab is data: a versioned lab.yaml with steps, typed checks and hints. Terminal labs run in the learner's browser; coding labs are graded on Judge0."
      />
      <div className="grid gap-4 md:grid-cols-2">
        {(["terminal", "compile"] as const).map((runtime) => (
          <form key={runtime} action={createLab} className="card-brut flex flex-col gap-3 p-5 sm:flex-row sm:items-end">
            <input type="hidden" name="runtime" value={runtime} />
            <div className="flex-1">
              <label className="label-brut" htmlFor={`new-${runtime}`}>New {runtime === "terminal" ? "terminal" : "coding"} lab</label>
              <input id={`new-${runtime}`} name="title" placeholder="Title" className="input-brut input-sm" />
            </div>
            <button type="submit" className="btn btn-primary btn-sm"><Plus className="size-4" /> Create</button>
          </form>
        ))}
      </div>

      {labs.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {labs.map((l) => (
            <Link key={l.id} href={`/studio/labs/${l.id}`} className="card-brut card-hover space-y-3 p-5">
              <div className="flex items-center gap-2">
                {l.runtime_type === "terminal" ? <SquareTerminal className="size-5" /> : <Code2 className="size-5" />}
                <span className="min-w-0 flex-1 truncate font-display text-lg font-bold">{l.title}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Chip tone={l.runtime_type === "terminal" ? "sky" : "yellow"}>{l.runtime_type}</Chip>
                <Chip tone="sunk">v{latest.get(l.id) ?? 0}</Chip>
              </div>
              <p className="font-mono text-[11px] text-ink/60">{l.slug} · updated {relativeTime(l.updated_at)}</p>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState title="No labs yet" description="Create a terminal or coding lab above, then attach it to a lab item in a course." />
      )}
    </div>
  );
}
