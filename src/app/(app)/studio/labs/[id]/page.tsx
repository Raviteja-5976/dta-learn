import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { LabEditor } from "@/components/studio/lab-editor";
import { requireStaff } from "@/lib/auth";
import { StudioError, assertLabEditor } from "@/lib/studio";
import { createAdminClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Studio · Lab builder" };

export default async function LabBuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireStaff();
  const { id } = await params;
  let lab;
  try {
    lab = await assertLabEditor(viewer, id);
  } catch (e) {
    if (e instanceof StudioError) notFound();
    throw e;
  }
  const admin = createAdminClient();
  const [{ data: versions }, { data: items }] = await Promise.all([
    admin.from("lab_versions").select("id, version, created_at, spec_yaml").eq("lab_id", id).order("version", { ascending: false }),
    admin.from("items").select("id, title, course_id").eq("lab_id", id),
  ]);
  const courseIds = [...new Set(((items ?? []) as { course_id: string }[]).map((i) => i.course_id))];
  const { data: courses } = courseIds.length ? await admin.from("courses").select("id, slug").in("id", courseIds) : { data: [] };
  const slugBy = new Map(((courses ?? []) as { id: string; slug: string }[]).map((c) => [c.id, c.slug]));

  return (
    <div className="space-y-6 p-4 md:p-8">
      <div className="space-y-3">
        <Link href="/studio/labs" className="eyebrow hover:underline">← Labs</Link>
        <PageHeader title={lab.title} description={`${lab.runtime_type === "terminal" ? "Terminal" : "Coding"} lab · slug ${lab.slug}`} />
      </div>
      <LabEditor
        labId={lab.id}
        runtime={lab.runtime_type}
        currentVersionId={lab.current_version_id}
        versions={(versions ?? []) as { id: string; version: number; created_at: string; spec_yaml: string }[]}
        isAdmin={viewer.profile.role === "admin"}
        usedBy={((items ?? []) as { id: string; title: string; course_id: string }[]).map((i) => ({ itemId: i.id, title: i.title, courseSlug: slugBy.get(i.course_id) ?? "" }))}
      />
    </div>
  );
}
