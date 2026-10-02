import Link from "next/link";
import { BookOpenText, CircleHelp, Clock, FlaskConical } from "lucide-react";
import { Chip, Progress } from "@/components/ui";
import type { CourseSummary } from "@/lib/catalog";
import { cn, formatPrice } from "@/lib/utils";

const LEVEL_TONE = { beginner: "mint", intermediate: "yellow", advanced: "coral" } as const;
const TILTS = ["tilt-neg-1", "tilt-pos-1", "", "tilt-neg-2", "tilt-pos-2", ""];

export function CourseCover({ course, className }: { course: Pick<CourseSummary, "title" | "cover_image_url" | "tags">; className?: string }) {
  if (course.cover_image_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={course.cover_image_url} alt="" className={cn("h-full w-full object-cover", className)} />
    );
  }
  const tag = course.tags[0] ?? "code";
  return (
    <div className={cn("bg-grid flex h-full w-full items-end bg-paper-sunk p-4", className)}>
      <span className="font-mono text-3xl font-bold text-ink/80">
        <span className="text-ink/40">$ </span>
        {tag}
        <span className="animate-blink">_</span>
      </span>
    </div>
  );
}

export function CourseCard({ course, index = 0, progress }: { course: CourseSummary; index?: number; progress?: number }) {
  return (
    <Link
      href={`/courses/${course.slug}`}
      className={cn("card-brut card-hover group flex flex-col overflow-hidden focus-visible:outline-offset-4", TILTS[index % TILTS.length])}
    >
      <div className="relative aspect-[16/8] border-b-4 border-ink">
        <CourseCover course={course} />
        <div className="absolute left-3 top-3 flex gap-2">
          <Chip tone={LEVEL_TONE[course.level]}>{course.level}</Chip>
          {course.is_free ? <Chip tone="mint">Free</Chip> : <Chip tone="yellow">{formatPrice(course.price_paise)}</Chip>}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-5">
        <h3 className="font-display text-xl font-bold leading-tight">{course.title}</h3>
        {course.subtitle && <p className="line-clamp-2 text-sm text-ink/70">{course.subtitle}</p>}
        <div className="mt-auto flex flex-wrap gap-x-4 gap-y-1 pt-2 font-mono text-[11px] font-bold uppercase tracking-wider text-ink/65">
          <span className="inline-flex items-center gap-1"><BookOpenText className="size-3.5" />{course.itemCounts.article} articles</span>
          <span className="inline-flex items-center gap-1"><FlaskConical className="size-3.5" />{course.itemCounts.lab} labs</span>
          <span className="inline-flex items-center gap-1"><CircleHelp className="size-3.5" />{course.itemCounts.quiz} quizzes</span>
          {course.estimated_hours ? <span className="inline-flex items-center gap-1"><Clock className="size-3.5" />{course.estimated_hours}h</span> : null}
        </div>
        {progress !== undefined && <Progress value={progress} label={`${course.title} progress`} />}
      </div>
    </Link>
  );
}
