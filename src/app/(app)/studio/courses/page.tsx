import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Chip, EmptyState, PageHeader } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { attachCounts } from "@/lib/catalog";
import { createAdminClient } from "@/lib/supabase/server";
import { formatPrice, relativeTime } from "@/lib/utils";
import type { Course } from "@/lib/types";
import { createCourse } from "../actions";

export const metadata: Metadata = { title: "Studio · Courses" };

const STATUS_TONE = { draft: "yellow", published: "mint", archived: "sunk" } as const;

export default async function StudioCourses() {
  const viewer = await requireStaff();
  let query = createAdminClient().from("courses").select("*").order("updated_at", { ascending: false });
  if (viewer.profile.role !== "admin") query = query.eq("owner_id", viewer.user.id);
  const { data } = await query;
  const courses = await attachCounts((data ?? []) as Course[]);

  return (
    <div className="space-y-8 p-4 md:p-8">
      <PageHeader eyebrow="Studio" title="Courses" description="Courses are made of sections; each section holds articles, labs and quizzes." />

      <form action={createCourse} className="card-brut flex flex-col gap-3 p-5 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label htmlFor="title" className="label-brut">New course title</label>
          <input id="title" name="title" required placeholder="e.g. Linux & Git Foundations" className="input-brut" />
        </div>
        <button type="submit" className="btn btn-primary"><Plus className="size-4" /> Create course</button>
      </form>

      {courses.length ? (
        <div className="overflow-hidden rounded-3xl border-4 border-ink bg-white shadow-brut-sm">
          <table className="w-full text-sm">
            <thead className="border-b-4 border-ink bg-paper-sunk font-mono text-[11px] uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3 text-left">Course</th>
                <th className="hidden px-4 py-3 text-left md:table-cell">Items</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="hidden px-4 py-3 text-left md:table-cell">Price</th>
                <th className="hidden px-4 py-3 text-right lg:table-cell">Updated</th>
              </tr>
            </thead>
            <tbody>
              {courses.map((c) => (
                <tr key={c.id} className="border-b-2 border-ink/10 last:border-0 hover:bg-paper-sunk/50">
                  <td className="px-4 py-3">
                    <Link href={`/studio/courses/${c.id}`} className="font-display font-bold hover:underline">{c.title}</Link>
                    <p className="font-mono text-[11px] text-ink/50">/{c.slug}</p>
                  </td>
                  <td className="hidden px-4 py-3 font-mono text-xs md:table-cell">
                    {c.itemCounts.article}A · {c.itemCounts.lab}L · {c.itemCounts.quiz}Q
                  </td>
                  <td className="px-4 py-3"><Chip tone={STATUS_TONE[c.status]}>{c.status}</Chip></td>
                  <td className="hidden px-4 py-3 md:table-cell">{c.is_free ? "Free" : formatPrice(c.price_paise)}</td>
                  <td className="hidden px-4 py-3 text-right font-mono text-xs text-ink/60 lg:table-cell">{relativeTime(c.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState title="No courses yet" description="Create your first course above, or run the seed script to load demo content." />
      )}
    </div>
  );
}
