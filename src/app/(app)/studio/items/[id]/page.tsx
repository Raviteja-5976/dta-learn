import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { Chip, Eyebrow, PageHeader } from "@/components/ui";
import { KIND_META } from "@/components/course/item-icon";
import { ItemSettings } from "@/components/studio/item-settings";
import { ArticleEditor } from "@/components/studio/article-editor";
import { QuizEditor, type EditableQuiz } from "@/components/studio/quiz-editor";
import { LabPicker } from "@/components/studio/lab-picker";
import { requireStaff } from "@/lib/auth";
import { StudioError, assertCourseEditor } from "@/lib/studio";
import { createAdminClient } from "@/lib/supabase/server";
import { parseBlocks } from "@/lib/blocks/schema";
import type { Item, Question, QuestionKey, Quiz } from "@/lib/types";

export const metadata: Metadata = { title: "Studio · Edit item" };

export default async function ItemEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireStaff();
  const { id } = await params;
  const admin = createAdminClient();
  const { data: item } = await admin.from("items").select("*").eq("id", id).maybeSingle<Item>();
  if (!item) notFound();
  let course;
  try {
    course = await assertCourseEditor(viewer, item.course_id);
  } catch (e) {
    if (e instanceof StudioError) notFound();
    throw e;
  }

  let editor: React.ReactNode = null;
  if (item.kind === "article") {
    const { data } = await admin.from("articles").select("blocks").eq("item_id", id).maybeSingle<{ blocks: unknown }>();
    editor = <ArticleEditor itemId={id} initial={parseBlocks(data?.blocks ?? []).blocks} />;
  } else if (item.kind === "quiz") {
    const [{ data: quiz }, { data: questions }] = await Promise.all([
      admin.from("quizzes").select("*").eq("item_id", id).maybeSingle<Quiz>(),
      admin.from("questions").select("*").eq("item_id", id).order("position").returns<Question[]>(),
    ]);
    const ids = (questions ?? []).map((q) => q.id);
    const { data: keys } = ids.length ? await admin.from("question_keys").select("*").in("question_id", ids).returns<QuestionKey[]>() : { data: [] as QuestionKey[] };
    const keyBy = new Map((keys ?? []).map((k) => [k.question_id, k]));
    const initial: EditableQuiz = {
      pass_score: quiz?.pass_score ?? 70,
      shuffle_questions: quiz?.shuffle_questions ?? false,
      max_attempts: quiz?.max_attempts ?? null,
      show_answers: quiz?.show_answers ?? true,
      questions: (questions ?? []).map((q) => {
        const k = keyBy.get(q.id);
        return {
          id: q.id,
          type: q.type,
          prompt: q.prompt,
          code: q.code ?? "",
          code_language: q.code_language ?? "",
          options: q.options,
          points: q.points,
          correct: k?.answer.correct ?? [],
          accepted: k?.answer.accepted ?? [],
          caseSensitive: Boolean(k?.answer.caseSensitive),
          explanation: k?.explanation ?? "",
        };
      }),
    };
    editor = <QuizEditor itemId={id} initial={initial} />;
  } else {
    let labsQuery = admin.from("labs").select("id, title, slug, runtime_type").order("updated_at", { ascending: false });
    if (viewer.profile.role !== "admin") labsQuery = labsQuery.or(`owner_id.eq.${viewer.user.id},id.eq.${item.lab_id ?? "00000000-0000-0000-0000-000000000000"}`);
    const { data: labs } = await labsQuery;
    editor = <LabPicker itemId={id} currentLabId={item.lab_id} labs={(labs ?? []) as { id: string; title: string; slug: string; runtime_type: "terminal" | "compile" }[]} />;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-4 md:p-8">
      <div className="space-y-4">
        <Link href={`/studio/courses/${course.id}`} className="eyebrow hover:underline">← {course.title}</Link>
        <PageHeader
          title={item.title}
          eyebrow={<Chip tone={item.kind === "quiz" ? "yellow" : item.kind === "lab" ? "sky" : "default"}>{KIND_META[item.kind].label}</Chip>}
          actions={
            <Link href={`/learn/${course.slug}/${item.id}`} target="_blank" className="btn btn-secondary btn-sm">
              View as learner <ExternalLink className="size-3.5" />
            </Link>
          }
        />
      </div>
      <section className="space-y-3">
        <Eyebrow>Settings</Eyebrow>
        <ItemSettings item={item} />
      </section>
      <section className="space-y-3">
        <Eyebrow>Content</Eyebrow>
        {editor}
      </section>
    </div>
  );
}
