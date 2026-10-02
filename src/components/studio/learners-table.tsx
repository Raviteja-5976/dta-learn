"use client";

import { useState } from "react";
import { Gift, Loader2, X } from "lucide-react";
import { Alert, Chip } from "@/components/ui";
import { useAction } from "./use-action";
import { grantAccess, revokeEntitlement, setUserRole } from "@/app/(app)/studio/actions";
import { formatDate } from "@/lib/utils";
import type { Role } from "@/lib/types";

interface Learner {
  id: string;
  email: string;
  full_name: string | null;
  role: Role;
  created_at: string;
  enrollments: number;
  completed: number;
  entitlements: { id: string; scope_type: string; course_title: string | null; status: string; ends_at: string | null }[];
}

export function LearnersTable({ learners, courses, selfId }: { learners: Learner[]; courses: { id: string; title: string }[]; selfId: string }) {
  const { run, pending, error } = useAction();
  const [granting, setGranting] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      {error && <Alert tone="danger">{error}</Alert>}
      <div className="overflow-x-auto rounded-3xl border-4 border-ink bg-white shadow-brut-sm">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="border-b-4 border-ink bg-paper-sunk font-mono text-[11px] uppercase tracking-wider">
            <tr>
              <th className="px-4 py-3 text-left">Person</th>
              <th className="px-4 py-3 text-left">Role</th>
              <th className="px-4 py-3 text-left">Courses</th>
              <th className="px-4 py-3 text-left">Access grants</th>
              <th className="px-4 py-3 text-right">Joined</th>
            </tr>
          </thead>
          <tbody>
            {learners.map((l) => (
              <tr key={l.id} className="border-b-2 border-ink/10 align-top last:border-0">
                <td className="px-4 py-3">
                  <p className="font-semibold">{l.full_name || "—"}</p>
                  <p className="text-xs text-ink/60">{l.email}</p>
                </td>
                <td className="px-4 py-3">
                  <select
                    value={l.role}
                    disabled={pending || l.id === selfId}
                    onChange={(e) => {
                      const role = e.target.value as Role;
                      if (role === "admin" && !confirm(`Make ${l.email} an admin? Admins can change everything.`)) return;
                      run(() => setUserRole(l.id, role));
                    }}
                    className="rounded-lg border-2 border-ink bg-white px-2 py-1"
                    aria-label={`Role for ${l.email}`}
                  >
                    <option value="student">Student</option>
                    <option value="instructor">Instructor</option>
                    <option value="admin">Admin</option>
                  </select>
                </td>
                <td className="px-4 py-3 font-mono text-xs">
                  {l.enrollments} enrolled · {l.completed} done
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1.5">
                    {l.entitlements.map((e) => (
                      <span key={e.id} className={`chip ${e.status === "active" ? "bg-mint" : "bg-paper-sunk line-through"}`}>
                        {e.scope_type === "catalog" ? "All courses" : e.course_title ?? "course"}
                        {e.ends_at ? ` → ${formatDate(e.ends_at)}` : ""}
                        {e.status === "active" && (
                          <button type="button" onClick={() => confirm("Revoke this access?") && run(() => revokeEntitlement(e.id))} aria-label="Revoke">
                            <X className="size-3" />
                          </button>
                        )}
                      </span>
                    ))}
                    <button type="button" className="chip bg-yellow" onClick={() => setGranting(granting === l.id ? null : l.id)}>
                      <Gift className="size-3" /> Grant
                    </button>
                  </div>
                  {granting === l.id && <GrantForm userId={l.id} courses={courses} pending={pending} onSubmit={(args) => run(() => grantAccess(...args), { onSuccess: () => setGranting(null) })} />}
                </td>
                <td className="px-4 py-3 text-right font-mono text-xs text-ink/60">{formatDate(l.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {learners.length === 0 && <Chip>No users match</Chip>}
    </div>
  );
}

function GrantForm({
  userId,
  courses,
  pending,
  onSubmit,
}: {
  userId: string;
  courses: { id: string; title: string }[];
  pending: boolean;
  onSubmit: (args: Parameters<typeof grantAccess>) => void;
}) {
  const [scope, setScope] = useState<"course" | "catalog">("course");
  const [courseId, setCourseId] = useState(courses[0]?.id ?? "");
  const [endsAt, setEndsAt] = useState("");
  const [note, setNote] = useState("");
  return (
    <form
      className="mt-3 space-y-2 rounded-2xl border-[3px] border-ink bg-paper-sunk p-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit([userId, scope, scope === "course" ? courseId : null, endsAt || null, note]);
      }}
    >
      <div className="flex flex-wrap gap-2">
        <select value={scope} onChange={(e) => setScope(e.target.value as "course" | "catalog")} className="rounded-lg border-2 border-ink bg-white px-2 py-1 text-xs" aria-label="Scope">
          <option value="course">One course</option>
          <option value="catalog">All courses</option>
        </select>
        {scope === "course" && (
          <select value={courseId} onChange={(e) => setCourseId(e.target.value)} className="min-w-0 flex-1 rounded-lg border-2 border-ink bg-white px-2 py-1 text-xs" aria-label="Course">
            {courses.map((c) => (
              <option key={c.id} value={c.id}>{c.title}</option>
            ))}
          </select>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <label className="flex items-center gap-1 text-xs">
          Until <input type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className="rounded-lg border-2 border-ink bg-white px-1.5 py-0.5" />
        </label>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" className="min-w-0 flex-1 rounded-lg border-2 border-ink bg-white px-2 py-0.5 text-xs" />
        <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
          {pending && <Loader2 className="size-3 animate-spin" />} Grant
        </button>
      </div>
    </form>
  );
}
