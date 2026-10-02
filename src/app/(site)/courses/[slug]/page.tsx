import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Award, Bot, CheckCircle2, Circle, Clock, Eye, Infinity as InfinityIcon, Lock, PlayCircle } from "lucide-react";
import { Alert, ButtonLink, Chip, Container, Eyebrow, Progress } from "@/components/ui";
import { CourseCover } from "@/components/course/course-card";
import { ItemIcon, KIND_META } from "@/components/course/item-icon";
import { Markdown } from "@/components/markdown";
import { CheckoutButton } from "@/components/billing/checkout-button";
import { getViewer } from "@/lib/auth";
import { getCourseAccess } from "@/lib/access";
import { getActivePlan, getCourseOwnership, type CourseOwnership } from "@/lib/billing/service";
import { serverEnv } from "@/lib/env";
import { flattenOutline, getCourseBySlug, getOutline } from "@/lib/catalog";
import { getCourseProgress } from "@/lib/progress";
import { createAdminClient } from "@/lib/supabase/server";
import { formatDate, formatPrice, pluralize } from "@/lib/utils";
import type { BillingPlan, Course } from "@/lib/types";
import { enrollAction } from "./actions";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ error?: string; purchased?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const course = await getCourseBySlug((await params).slug);
  return course ? { title: course.title, description: course.subtitle ?? undefined } : {};
}

export default async function CoursePage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { error, purchased } = await searchParams;
  const [viewer, course] = await Promise.all([getViewer(), getCourseBySlug(slug)]);
  if (!course) notFound();

  const access = await getCourseAccess(viewer, course);
  if (course.status !== "published" && !access.isStaff) notFound();

  const outline = await getOutline(course.id);
  const items = flattenOutline(outline);
  const progress = viewer && access.enrolled ? await getCourseProgress(viewer.user.id, course.id, items) : null;

  // Runtime per lab item, for icons.
  const labIds = items.filter((i) => i.lab_id).map((i) => i.lab_id as string);
  const { data: labs } = labIds.length
    ? await createAdminClient().from("labs").select("id, runtime_type").in("id", labIds)
    : { data: [] as { id: string; runtime_type: "terminal" | "compile" }[] };
  const runtimeByLab = new Map((labs ?? []).map((l: { id: string; runtime_type: "terminal" | "compile" }) => [l.id, l.runtime_type]));

  const certificate =
    viewer && progress
      ? (await createAdminClient().from("certificates").select("public_code").eq("user_id", viewer.user.id).eq("course_id", course.id).maybeSingle<{ public_code: string }>()).data
      : null;

  const nextItem = progress ? items.find((i) => !progress.completed.has(i.id)) ?? items[0] : items[0];
  const resumeItem = access.enrollment?.last_item_id ? items.find((i) => i.id === access.enrollment?.last_item_id) ?? nextItem : nextItem;
  const counts = { article: 0, lab: 0, quiz: 0 };
  items.forEach((i) => counts[i.kind]++);

  const canOpen = (isPreview: boolean) => access.hasAccess || (isPreview && Boolean(viewer));

  const paid = !course.is_free;
  const [ownership, plan] = await Promise.all([
    viewer && paid ? getCourseOwnership(viewer.user.id, course.id) : Promise.resolve(null),
    paid ? getActivePlan() : Promise.resolve(null),
  ]);
  const expired = Boolean(progress) && paid && !access.hasAccess;

  return (
    <>
      <section className="border-b-4 border-ink bg-paper-sunk">
        <Container className="grid gap-10 py-[var(--sp-block)] lg:grid-cols-[1.4fr_1fr]">
          <div className="space-y-5">
            <Link href="/courses" className="eyebrow hover:underline">← All courses</Link>
            <div className="flex flex-wrap gap-2">
              <Chip tone={course.level === "beginner" ? "mint" : course.level === "intermediate" ? "yellow" : "coral"}>{course.level}</Chip>
              {course.tags.map((t) => (
                <Chip key={t}>{t}</Chip>
              ))}
              {course.status !== "published" && <Chip tone="coral">{course.status}</Chip>}
            </div>
            <h1 className="text-display font-extrabold">{course.title}</h1>
            {course.subtitle && <p className="text-lead max-w-2xl text-ink/75">{course.subtitle}</p>}
            <div className="flex flex-wrap gap-x-6 gap-y-2 font-mono text-xs font-bold uppercase tracking-wider text-ink/70">
              <span>{pluralize(outline.length, "section")}</span>
              <span>{pluralize(counts.article, "article")}</span>
              <span>{pluralize(counts.lab, "lab")}</span>
              <span>{pluralize(counts.quiz, "quiz", "quizzes")}</span>
              {course.estimated_hours ? <span className="inline-flex items-center gap-1"><Clock className="size-3.5" />{course.estimated_hours} hours</span> : null}
            </div>
          </div>

          <div className="card-brut flex flex-col overflow-hidden">
            <div className="aspect-[16/8] border-b-4 border-ink">
              <CourseCover course={course} />
            </div>
            <div className="space-y-4 p-6">
              {error === "payment" && !access.hasAccess && (
                <Alert tone="warning" title="This is a paid course">Buy it or subscribe below to unlock every lesson and lab.</Alert>
              )}
              {purchased && access.hasAccess && (
                <Alert tone="success" title="Payment received 🎉">
                  {ownership?.purchasedUntil ? `The course is yours until ${formatDate(ownership.purchasedUntil)}.` : "You now have full access."}
                </Alert>
              )}
              {expired && (
                <Alert tone="warning" title="Your access has ended">
                  Your progress is saved. Renew below to pick up where you left off.
                </Alert>
              )}
              {progress && !expired ? (
                <>
                  <div className="flex items-baseline justify-between">
                    <span className="eyebrow">Your progress</span>
                    <span className="font-display text-2xl font-extrabold tabular-nums">{progress.percent}%</span>
                  </div>
                  <Progress value={progress.percent} />
                  <p className="text-sm text-ink/70">
                    {progress.completedCount} of {progress.total} items complete
                  </p>
                  {resumeItem && (
                    <ButtonLink href={`/learn/${course.slug}/${resumeItem.id}`} size="lg" className="w-full">
                      <PlayCircle className="size-5" /> {progress.completedCount ? "Continue" : "Start course"}
                    </ButtonLink>
                  )}
                  {certificate && (
                    <ButtonLink href={`/verify/${certificate.public_code}`} variant="secondary" className="w-full">
                      <Award className="size-4" /> View certificate
                    </ButtonLink>
                  )}
                  {ownership && <AccessNote ownership={ownership} course={course} />}
                </>
              ) : (
                <>
                  {!expired && <p className="font-display text-3xl font-extrabold">{course.is_free ? "Free" : formatPrice(course.price_paise)}</p>}
                  {!viewer ? (
                    <ButtonLink href={`/login?next=${encodeURIComponent(`/courses/${course.slug}`)}`} size="lg" className="w-full">
                      Sign in to enroll
                    </ButtonLink>
                  ) : access.canEnroll ? (
                    <form action={enrollAction}>
                      <input type="hidden" name="courseId" value={course.id} />
                      <button type="submit" className="btn btn-primary btn-lg w-full">
                        {access.isStaff && !course.is_free ? "Enroll (staff access)" : "Enroll now"}
                      </button>
                    </form>
                  ) : (
                    <PurchaseOptions course={course} plan={plan} />
                  )}
                  <p className="text-xs text-ink/60">Preview lessons are open to any signed-in learner.</p>
                </>
              )}
            </div>
          </div>
        </Container>
      </section>

      <Container className="grid gap-12 py-[var(--sp-block)] lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-10">
          {course.description && (
            <section className="space-y-4">
              <Eyebrow>About this course</Eyebrow>
              <Markdown>{course.description}</Markdown>
            </section>
          )}

          <section className="space-y-5">
            <Eyebrow>Course outline</Eyebrow>
            {outline.length === 0 && <p className="text-ink/60">No sections yet.</p>}
            {outline.map((section, si) => (
              <div key={section.id} className="card-brut overflow-hidden">
                <div className="flex items-center gap-3 border-b-4 border-ink bg-paper-sunk px-5 py-3">
                  <span className="font-mono text-xs font-bold text-ink/50">{String(si + 1).padStart(2, "0")}</span>
                  <h3 className="font-display text-lg font-bold">{section.title}</h3>
                  <span className="ml-auto font-mono text-[11px] font-bold uppercase tracking-wider text-ink/50">{pluralize(section.items.length, "item")}</span>
                </div>
                {section.description && <p className="border-b-2 border-ink/10 px-5 py-3 text-sm text-ink/70">{section.description}</p>}
                <ul>
                  {section.items.map((item) => {
                    const done = progress?.completed.has(item.id);
                    const open = canOpen(item.is_preview);
                    const content = (
                      <>
                        <ItemIcon kind={item.kind} runtime={item.lab_id ? runtimeByLab.get(item.lab_id) : null} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold">{item.title}</span>
                          <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-ink/50">
                            {item.kind === "lab" && item.lab_id ? `${runtimeByLab.get(item.lab_id) ?? ""} ` : ""}
                            {KIND_META[item.kind].label}
                            {item.estimated_minutes ? ` · ${item.estimated_minutes} min` : ""}
                            {!item.required ? " · optional" : ""}
                          </span>
                        </span>
                        {item.is_preview && !access.hasAccess && <Chip tone="sky"><Eye className="size-3" />Preview</Chip>}
                        {done ? (
                          <CheckCircle2 className="size-5 text-ink" aria-label="Completed" />
                        ) : open ? (
                          <Circle className="size-5 text-ink/30" aria-hidden />
                        ) : (
                          <Lock className="size-4 text-ink/40" aria-label="Locked" />
                        )}
                      </>
                    );
                    return (
                      <li key={item.id} className="border-b-2 border-ink/10 last:border-0">
                        {open ? (
                          <Link href={`/learn/${course.slug}/${item.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-paper-sunk/70">
                            {content}
                          </Link>
                        ) : (
                          <div className="flex items-center gap-3 px-5 py-3 opacity-80">{content}</div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </section>
        </div>

        <aside className="space-y-6">
          {course.skills.length > 0 && (
            <div className="card-brut p-6">
              <Eyebrow>Skills you&apos;ll practise</Eyebrow>
              <div className="mt-4 flex flex-wrap gap-2">
                {course.skills.map((s) => (
                  <Chip key={s} tone="brand">{s}</Chip>
                ))}
              </div>
            </div>
          )}
          <div className="card-brut p-6">
            <Eyebrow>Certificate</Eyebrow>
            <p className="mt-3 text-sm text-ink/75">
              Complete every required item to earn a certificate with a public verification link. Coding labs and quizzes are verified on our servers.
            </p>
          </div>
        </aside>
      </Container>
    </>
  );
}

/** The two ways to unlock a paid course: own it for N months, or subscribe to everything. */
function PurchaseOptions({ course, plan }: { course: Course; plan: BillingPlan | null }) {
  if (!serverEnv.razorpayConfigured()) {
    return <Alert tone="info">Online payments aren&apos;t switched on yet. Contact us to get access.</Alert>;
  }
  const months = serverEnv.billing().courseAccessMonths;
  return (
    <div className="space-y-4">
      {course.price_paise ? (
        <div className="space-y-2">
          <CheckoutButton kind="course" courseId={course.id}>
            Buy for {formatPrice(course.price_paise)}
          </CheckoutButton>
          <p className="text-xs text-ink/60">One-time payment · this course for {months} months · lessons, labs, quizzes, certificate and the AI tutor.</p>
        </div>
      ) : null}
      {plan && (
        <div className="space-y-2 rounded-2xl border-[3px] border-ink bg-sky/20 p-4">
          <p className="flex items-center gap-1.5 font-display font-bold">
            <InfinityIcon className="size-4" /> Or get every course
          </p>
          <p className="text-sm text-ink/75">
            <strong>{formatPrice(plan.amount_paise)}/month</strong> unlocks the whole catalog, plus <Bot className="inline size-3.5" /> Glitch, the AI tutor. Cancel anytime.
          </p>
          <CheckoutButton kind="subscription" variant="dark">
            Subscribe — {formatPrice(plan.amount_paise)}/mo
          </CheckoutButton>
          <Link href="/pricing" className="block text-center text-xs font-bold underline">Compare plans</Link>
        </div>
      )}
    </div>
  );
}

function AccessNote({ ownership, course }: { ownership: CourseOwnership; course: Course }) {
  if (ownership.viaSubscription) {
    return <p className="text-xs text-ink/60">Included in your All-Access subscription. <Link href="/billing" className="font-bold underline">Billing</Link></p>;
  }
  if (!ownership.purchasedUntil) return null;
  const daysLeft = Math.ceil((new Date(ownership.purchasedUntil).getTime() - Date.now()) / 86_400_000);
  return (
    <div className="space-y-2 border-t-2 border-ink/10 pt-3">
      <p className="text-xs text-ink/60">
        Your access runs until <strong>{formatDate(ownership.purchasedUntil)}</strong>
        {daysLeft <= 30 ? ` (${pluralize(daysLeft, "day")} left)` : ""}.
      </p>
      {daysLeft <= 30 && course.price_paise && serverEnv.razorpayConfigured() ? (
        <CheckoutButton kind="course" courseId={course.id} variant="secondary" size="sm">
          Extend {serverEnv.billing().courseAccessMonths} months · {formatPrice(course.price_paise)}
        </CheckoutButton>
      ) : null}
    </div>
  );
}
