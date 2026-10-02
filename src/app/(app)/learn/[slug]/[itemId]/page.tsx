import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { after } from "next/server";
import { ArrowLeft, ArrowRight, Clock } from "lucide-react";
import { Alert, ButtonLink, Chip } from "@/components/ui";
import { ArticleBody } from "@/components/blocks/block-renderer";
import { CompleteButton } from "@/components/learn/complete-button";
import { LearnSidebar, type SidebarSection } from "@/components/learn/learn-sidebar";
import { QuizPlayer, type QuizSubmitResponse } from "@/components/learn/quiz-player";
import { TerminalLabCard } from "@/components/learn/terminal-lab-card";
import { CompileLab } from "@/components/lab/compile-lab";
import { TutorChat } from "@/components/ai/tutor-chat";
import { isTutorAvailable } from "@/lib/settings";
import { KIND_META } from "@/components/course/item-icon";
import { getViewer } from "@/lib/auth";
import { loadItemForViewer } from "@/lib/access";
import { flattenOutline, getOutline } from "@/lib/catalog";
import { getCourseProgress, touchItem } from "@/lib/progress";
import { createAdminClient } from "@/lib/supabase/server";
import { parseBlocks } from "@/lib/blocks/schema";
import { buildCompilePayload, buildTerminalPayload, loadCurrentLab, startAttempt } from "@/lib/labs/server";
import { isTerminalSpec } from "@/lib/labs/spec";
import type { Article, Item, Question, Quiz } from "@/lib/types";

type Props = { params: Promise<{ slug: string; itemId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { itemId } = await params;
  const { data } = await createAdminClient().from("items").select("title").eq("id", itemId).maybeSingle<{ title: string }>();
  return { title: data?.title ?? "Lesson" };
}

export default async function LearnPage({ params }: Props) {
  const { slug, itemId } = await params;
  const viewer = await getViewer();
  if (!viewer) redirect(`/login?next=${encodeURIComponent(`/learn/${slug}/${itemId}`)}`);

  const loaded = await loadItemForViewer(viewer, itemId);
  if (!loaded || loaded.course.slug !== slug) notFound();
  const { item, course, access } = loaded;
  if (!loaded.canView) redirect(`/courses/${course.slug}`);

  const outline = await getOutline(course.id);
  const flat = flattenOutline(outline);
  const index = flat.findIndex((i) => i.id === item.id);
  const prev = index > 0 ? flat[index - 1] : null;
  const next = index >= 0 && index < flat.length - 1 ? flat[index + 1] : null;
  const canOpen = (i: Item) => access.hasAccess || i.is_preview;
  const nextHref = next && canOpen(next) ? `/learn/${course.slug}/${next.id}` : null;

  const progress = access.enrolled ? await getCourseProgress(viewer.user.id, course.id, flat) : null;
  if (access.enrolled) after(() => touchItem(viewer.user.id, item));

  const labIds = flat.filter((i) => i.lab_id).map((i) => i.lab_id as string);
  const { data: labRows } = labIds.length ? await createAdminClient().from("labs").select("id, runtime_type").in("id", labIds) : { data: [] };
  const runtimeByLab = new Map((labRows ?? []).map((l: { id: string; runtime_type: "terminal" | "compile" }) => [l.id, l.runtime_type]));

  const sections: SidebarSection[] = outline.map((s) => ({
    id: s.id,
    title: s.title,
    items: s.items.map((i) => ({
      id: i.id,
      title: i.title,
      kind: i.kind,
      runtime: i.lab_id ? runtimeByLab.get(i.lab_id) ?? null : null,
      status: progress?.completed.has(i.id) ? "completed" : progress?.inProgress.has(i.id) ? "in_progress" : "none",
      locked: !canOpen(i),
      required: i.required,
    })),
  }));
  const completed = Boolean(progress?.completed.has(item.id));
  const sectionTitle = outline.find((s) => s.id === item.section_id)?.title;

  // Glitch: articles and labs (never quizzes); labs need an enrollment, like the lab itself.
  const tutorOn =
    item.kind !== "quiz" && (item.kind === "article" || access.enrolled || access.isStaff) && (await isTutorAvailable(viewer.profile.role));

  const content = await renderItem();

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <LearnSidebar courseSlug={course.slug} courseTitle={course.title} currentItemId={item.id} sections={sections} percent={progress?.percent ?? null} />
      <div className="flex min-w-0 flex-1 flex-col">{content}</div>
    </div>
  );

  async function renderItem() {
    const admin = createAdminClient();
    const notEnrolledNote = !access.enrolled && !access.isStaff && (
      <Alert tone="info" title="Preview">
        You&apos;re previewing this lesson. <Link href={`/courses/${course.slug}`} className="font-bold underline">Enroll</Link> to track progress.
      </Alert>
    );

    const header = (
      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Chip tone={item.kind === "quiz" ? "yellow" : item.kind === "lab" ? "sky" : "default"}>{KIND_META[item.kind].label}</Chip>
          {sectionTitle && <span className="eyebrow">{sectionTitle}</span>}
          {item.estimated_minutes ? (
            <span className="inline-flex items-center gap-1 font-mono text-[11px] font-bold uppercase text-ink/60">
              <Clock className="size-3.5" /> {item.estimated_minutes} min
            </span>
          ) : null}
          {completed && <Chip tone="mint">Completed</Chip>}
        </div>
        <h1 className="text-h2 font-extrabold">{item.title}</h1>
        {item.summary && <p className="text-lead text-ink/70">{item.summary}</p>}
      </header>
    );

    const navFooter = (extra?: React.ReactNode) => (
      <footer className="flex flex-col-reverse gap-4 border-t-4 border-ink pt-6 sm:flex-row sm:items-center sm:justify-between">
        {prev && canOpen(prev) ? (
          <ButtonLink href={`/learn/${course.slug}/${prev.id}`} variant="ghost">
            <ArrowLeft className="size-4" /> {prev.title}
          </ButtonLink>
        ) : (
          <span />
        )}
        {extra ??
          (nextHref ? (
            <ButtonLink href={nextHref} variant="secondary">
              {next?.title} <ArrowRight className="size-4" />
            </ButtonLink>
          ) : null)}
      </footer>
    );

    if (item.kind === "article") {
      const { data: article } = await admin.from("articles").select("*").eq("item_id", item.id).maybeSingle<Article>();
      const { blocks } = parseBlocks(article?.blocks ?? []);
      return (
        <article className="mx-auto w-full max-w-3xl space-y-10 px-4 py-10 md:px-8">
          {notEnrolledNote}
          {header}
          <ArticleBody blocks={blocks} itemId={item.id} />
          {navFooter(access.enrolled ? <CompleteButton itemId={item.id} completed={completed} nextHref={nextHref} /> : undefined)}
          {tutorOn && <TutorChat itemId={item.id} kind="article" />}
        </article>
      );
    }

    if (item.kind === "quiz") {
      const [{ data: quiz }, { data: questions }, { data: attempts }] = await Promise.all([
        admin.from("quizzes").select("*").eq("item_id", item.id).maybeSingle<Quiz>(),
        admin.from("questions").select("*").eq("item_id", item.id).order("position").returns<Question[]>(),
        admin.from("quiz_attempts").select("score, passed, answers, results, submitted_at").eq("user_id", viewer!.user.id).eq("item_id", item.id).order("submitted_at", { ascending: false }),
      ]);
      if (!quiz) return <EmptyContent />;
      let qs = questions ?? [];
      if (quiz.shuffle_questions) qs = [...qs].sort(() => Math.random() - 0.5);
      const used = attempts?.length ?? 0;
      const attemptsLeft = quiz.max_attempts ? Math.max(0, quiz.max_attempts - used) : null;
      const best = attempts?.length ? Math.max(...attempts.map((a: { score: number }) => Number(a.score))) : null;
      const last = attempts?.[0] as { score: number; passed: boolean; answers: Record<string, string[]>; results: QuizSubmitResponse["results"] } | undefined;
      const previous: QuizSubmitResponse | null = last
        ? { score: Number(last.score), passed: last.passed, passScore: quiz.pass_score, results: last.results, answers: last.answers, attemptsLeft, courseCompleted: false, certificateCode: null }
        : null;
      return (
        <div className="mx-auto w-full max-w-3xl space-y-10 px-4 py-10 md:px-8">
          {notEnrolledNote}
          {header}
          {qs.length ? (
            <QuizPlayer itemId={item.id} questions={qs} passScore={quiz.pass_score} attemptsLeft={attemptsLeft} bestScore={best} previous={previous} nextHref={nextHref} />
          ) : (
            <EmptyContent />
          )}
          {navFooter()}
        </div>
      );
    }

    // Lab
    const lab = item.lab_id ? await loadCurrentLab(item.lab_id) : null;
    if (!lab) {
      return (
        <div className="mx-auto w-full max-w-3xl space-y-8 px-4 py-10 md:px-8">
          {header}
          <EmptyContent text="This lab hasn't been published yet." />
        </div>
      );
    }
    if (!access.enrolled && !access.isStaff) {
      return (
        <div className="mx-auto w-full max-w-3xl space-y-8 px-4 py-10 md:px-8">
          {header}
          <Alert tone="info" title="Enroll to start this lab">
            Labs record your progress, so they need an enrollment. <Link href={`/courses/${course.slug}`} className="font-bold underline">Go to the course page</Link>.
          </Alert>
        </div>
      );
    }

    const attempt = await startAttempt(viewer!.user.id, item, lab.version);
    if (isTerminalSpec(lab.version.spec)) {
      const payload = await buildTerminalPayload(attempt, lab.version, lab.lab, item);
      return (
        <div className="mx-auto w-full max-w-3xl space-y-8 px-4 py-10 md:px-8">
          {header}
          <TerminalLabCard
            attemptId={attempt.id}
            description={lab.version.spec.metadata.description}
            steps={payload.steps.map((s) => ({ id: s.id, title: s.title, graded: s.checks.length > 0 }))}
            stepsPassed={payload.stepsPassed}
            image={payload.image}
            estimatedMinutes={lab.version.spec.metadata.estimatedMinutes}
          />
          {navFooter()}
          {tutorOn && <TutorChat itemId={item.id} kind="lab" />}
        </div>
      );
    }

    const payload = await buildCompilePayload(attempt, lab.version, lab.lab);
    return <CompileLab payload={payload} nextHref={nextHref} tutorItemId={tutorOn ? item.id : null} />;
  }
}

function EmptyContent({ text = "No content here yet." }: { text?: string }) {
  return <p className="rounded-2xl border-4 border-dashed border-ink/30 p-8 text-center text-ink/60">{text}</p>;
}
