import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Award, CheckCircle2, Code2, Flame, PlayCircle, SquareTerminal } from "lucide-react";
import { ButtonLink, Chip, Container, EmptyState, Eyebrow, Progress, StatTile } from "@/components/ui";
import { CourseCard } from "@/components/course/course-card";
import { KIND_META } from "@/components/course/item-icon";
import { displayName, requireViewer } from "@/lib/auth";
import { loadDashboard } from "@/lib/dashboard";
import { formatDate, pluralize, relativeTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Dashboard" };

const VERB_LABEL: Record<string, string> = {
  completed: "Completed",
  passed: "Passed lab",
  attempted: "Took quiz",
  earned: "Earned",
  enrolled: "Enrolled in",
  answered: "Answered challenge",
};

export default async function DashboardPage() {
  const viewer = await requireViewer("/dashboard");
  const data = await loadDashboard(viewer.user.id);
  const resume = data.courses.find((c) => c.lastItem || c.nextItem);
  const resumeItem = resume?.lastItem && resume.percent < 100 ? resume.lastItem : resume?.nextItem;

  return (
    <Container className="space-y-12 py-[var(--sp-block)]">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-3">
          <Eyebrow>Dashboard</Eyebrow>
          <h1 className="text-h2 font-extrabold">Hey {displayName(viewer.profile).split(" ")[0]} 👋</h1>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatTile label="Streak" value={<span className="inline-flex items-center gap-1">{data.streak.current}<Flame className="size-6 text-orange" /></span>} hint={`Best ${pluralize(data.streak.best, "day")}`} />
          <StatTile label="Courses" value={data.courses.length} hint={`${data.courses.filter((c) => c.enrollment.completed_at).length} completed`} />
          <StatTile label="Labs passed" value={data.labs.filter((l) => l.status === "completed").length} accent="text-ink" />
          <StatTile label="Runs today" value={`${data.runsToday}/${data.runsPerDay}`} hint="Code runs on your plan" />
        </div>
      </div>

      {/* Continue learning */}
      {resume && resumeItem ? (
        <div className="section-dark flex flex-col gap-6 rounded-3xl border-4 border-ink p-8 shadow-brut md:flex-row md:items-center">
          <div className="flex-1 space-y-2">
            <p className="eyebrow">Continue learning</p>
            <p className="font-display text-3xl font-bold">{resumeItem.title}</p>
            <p className="text-paper/70">
              {KIND_META[resumeItem.kind].label} · {resume.course.title} · {resume.percent}% complete
            </p>
          </div>
          <ButtonLink href={`/learn/${resume.course.slug}/${resumeItem.id}`} size="lg" className="!border-paper">
            <PlayCircle className="size-5" /> Resume
          </ButtonLink>
        </div>
      ) : (
        <EmptyState
          title="Start your first course"
          description="Pick a course from the catalog. Your progress, labs and certificates will show up here."
          action={<ButtonLink href="/courses">Browse courses <ArrowRight className="size-4" /></ButtonLink>}
        />
      )}

      <div className="grid gap-10 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-10">
          {/* My courses */}
          {data.courses.length > 0 && (
            <section className="space-y-4">
              <Eyebrow>My courses</Eyebrow>
              <div className="space-y-4">
                {data.courses.map((c) => (
                  <div key={c.course.id} className="card-brut flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/courses/${c.course.slug}`} className="font-display text-lg font-bold hover:underline">{c.course.title}</Link>
                        {c.enrollment.completed_at && <Chip tone="mint">Completed</Chip>}
                        <Chip tone="sunk">{c.enrollment.source === "free" ? "Free" : c.enrollment.source}</Chip>
                      </div>
                      <Progress value={c.percent} />
                      <p className="text-sm text-ink/65">
                        {c.completed}/{c.total} items{c.nextItem && !c.enrollment.completed_at ? ` · next: ${c.nextItem.title}` : ""}
                      </p>
                    </div>
                    {c.nextItem && (
                      <ButtonLink href={`/learn/${c.course.slug}/${c.nextItem.id}`} variant="secondary" size="sm">
                        {c.completed ? "Continue" : "Start"} <ArrowRight className="size-4" />
                      </ButtonLink>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Labs */}
          {data.labs.length > 0 && (
            <section className="space-y-4">
              <Eyebrow>Lab progress</Eyebrow>
              <div className="grid gap-4 sm:grid-cols-2">
                {data.labs.map((l) => {
                  const Icon = l.runtime === "terminal" ? SquareTerminal : Code2;
                  const inner = (
                    <>
                      <div className="flex items-center gap-2">
                        <Icon className="size-5" />
                        <span className="min-w-0 flex-1 truncate font-display font-bold">{l.title}</span>
                        {l.status === "completed" ? <CheckCircle2 className="size-5" /> : null}
                      </div>
                      <Progress value={l.stepsTotal ? (l.stepsPassed / l.stepsTotal) * 100 : 0} />
                      <p className="font-mono text-[11px] font-bold uppercase tracking-wider text-ink/60">
                        {l.status === "completed" ? "Passed" : `Step ${Math.min(l.stepsPassed + 1, l.stepsTotal)} of ${l.stepsTotal}`} · {relativeTime(l.updatedAt)}
                      </p>
                    </>
                  );
                  return l.href ? (
                    <Link key={l.attemptId} href={l.href} className="card-brut card-hover space-y-3 p-4">{inner}</Link>
                  ) : (
                    <div key={l.attemptId} className="card-brut space-y-3 p-4">{inner}</div>
                  );
                })}
              </div>
            </section>
          )}

          {data.recommended.length > 0 && (
            <section className="space-y-4">
              <Eyebrow>Recommended next</Eyebrow>
              <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
                {data.recommended.map((c, i) => (
                  <CourseCard key={c.id} course={c} index={i} />
                ))}
              </div>
            </section>
          )}
        </div>

        <aside className="space-y-8">
          <section className="card-brut space-y-4 p-6">
            <Eyebrow>Certificates</Eyebrow>
            {data.certificates.length ? (
              <ul className="space-y-3">
                {data.certificates.map((c) => (
                  <li key={c.id}>
                    <Link href={`/verify/${c.public_code}`} className="flex items-center gap-3 rounded-2xl border-[3px] border-ink bg-yellow/40 p-3 hover:-translate-y-0.5 transition-transform">
                      <Award className="size-6 shrink-0" />
                      <span className="min-w-0">
                        <span className="block truncate font-bold">{c.course_title}</span>
                        <span className="font-mono text-[11px] text-ink/60">{c.public_code} · {formatDate(c.issued_at)}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink/60">Finish a course to earn a verifiable certificate.</p>
            )}
          </section>

          {data.skills.length > 0 && (
            <section className="card-brut space-y-4 p-6">
              <Eyebrow>Skill progress</Eyebrow>
              <ul className="space-y-3">
                {data.skills.map((s) => (
                  <li key={s.name} className="space-y-1">
                    <div className="flex justify-between text-sm font-semibold">
                      <span>{s.name}</span>
                      <span className="font-mono tabular-nums">{s.percent}%</span>
                    </div>
                    <Progress value={s.percent} label={s.name} />
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="card-brut space-y-4 p-6">
            <Eyebrow>Recent activity</Eyebrow>
            {data.activity.length ? (
              <ol className="space-y-3 border-l-4 border-ink pl-4">
                {data.activity.map((a, i) => (
                  <li key={i} className="relative text-sm">
                    <span className="absolute -left-[22px] top-1.5 size-3 rounded-full border-[3px] border-ink bg-brand" />
                    <span className="font-semibold">{VERB_LABEL[a.verb] ?? a.verb}</span> {a.label}
                    {typeof a.result?.score === "number" && <span className="text-ink/60"> · {Math.round(a.result.score as number)}%</span>}
                    <span className="block font-mono text-[11px] text-ink/50">{relativeTime(a.at)}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-ink/60">Your completions, quiz scores and lab passes will appear here.</p>
            )}
          </section>
        </aside>
      </div>
    </Container>
  );
}
