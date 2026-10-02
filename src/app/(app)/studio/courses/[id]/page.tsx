import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Eyebrow, PageHeader } from "@/components/ui";
import { CourseDetailsForm, CourseStatusBar, OutlineEditor } from "@/components/studio/course-editor";
import { requireStaff } from "@/lib/auth";
import { getOutline } from "@/lib/catalog";
import { StudioError, assertCourseEditor } from "@/lib/studio";
import { createAdminClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Studio · Course builder" };

export default async function CourseBuilder({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireStaff();
  const { id } = await params;
  let course;
  try {
    course = await assertCourseEditor(viewer, id);
  } catch (e) {
    if (e instanceof StudioError) notFound();
    throw e;
  }
  const outline = await getOutline(course.id);
  const labIds = outline.flatMap((s) => s.items.map((i) => i.lab_id)).filter(Boolean) as string[];
  const { data: labs } = labIds.length ? await createAdminClient().from("labs").select("id, title, runtime_type").in("id", labIds) : { data: [] };
  const labTitles = Object.fromEntries(((labs ?? []) as { id: string; title: string; runtime_type: "terminal" | "compile" }[]).map((l) => [l.id, { title: l.title, runtime: l.runtime_type }]));

  return (
    <div className="space-y-10 p-4 md:p-8">
      <div className="space-y-4">
        <Link href="/studio/courses" className="eyebrow hover:underline">← Courses</Link>
        <PageHeader title={course.title} />
        <CourseStatusBar course={course} />
      </div>

      <div className="grid gap-10 2xl:grid-cols-[1fr_1fr]">
        <section className="space-y-4">
          <Eyebrow>Outline · sections & items</Eyebrow>
          <OutlineEditor courseId={course.id} outline={outline} labTitles={labTitles} />
        </section>
        <section className="space-y-4">
          <Eyebrow>Course details</Eyebrow>
          <CourseDetailsForm course={course} />
        </section>
      </div>
    </div>
  );
}
