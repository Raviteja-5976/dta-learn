import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import { Container, EmptyState, PageHeader } from "@/components/ui";
import { CourseCard } from "@/components/course/course-card";
import { allTags, listPublishedCourses } from "@/lib/catalog";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Courses" };

const LEVELS = ["beginner", "intermediate", "advanced"] as const;

export default async function CoursesPage({ searchParams }: { searchParams: Promise<{ q?: string; level?: string; tag?: string }> }) {
  const sp = await searchParams;
  const level = LEVELS.includes(sp.level as (typeof LEVELS)[number]) ? sp.level : undefined;
  const [courses, tags] = await Promise.all([listPublishedCourses({ q: sp.q, level, tag: sp.tag }), allTags()]);

  const href = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { q: sp.q, level, tag: sp.tag, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/courses?${s}` : "/courses";
  };

  return (
    <Container className="space-y-10 py-[var(--sp-block)]">
      <PageHeader eyebrow="Catalog" title="Courses" description="Every course mixes short articles, hands-on labs and quick quizzes." />

      <div className="space-y-4">
        <form action="/courses" className="flex max-w-xl gap-3">
          {level && <input type="hidden" name="level" value={level} />}
          {sp.tag && <input type="hidden" name="tag" value={sp.tag} />}
          <label htmlFor="q" className="sr-only">Search courses</label>
          <input id="q" name="q" defaultValue={sp.q} placeholder="Search courses…" className="input-brut" />
          <button type="submit" className="btn btn-dark" aria-label="Search">
            <Search className="size-4" />
          </button>
        </form>
        <div className="flex flex-wrap items-center gap-2">
          <span className="eyebrow mr-1">Level</span>
          <FilterChip href={href({ level: undefined })} active={!level}>All</FilterChip>
          {LEVELS.map((l) => (
            <FilterChip key={l} href={href({ level: l })} active={level === l}>{l}</FilterChip>
          ))}
        </div>
        {tags.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="eyebrow mr-1">Topic</span>
            <FilterChip href={href({ tag: undefined })} active={!sp.tag}>All</FilterChip>
            {tags.map((t) => (
              <FilterChip key={t} href={href({ tag: t })} active={sp.tag === t}>{t}</FilterChip>
            ))}
          </div>
        )}
      </div>

      {courses.length ? (
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((c, i) => (
            <CourseCard key={c.id} course={c} index={i} />
          ))}
        </div>
      ) : (
        <EmptyState title="No courses match" description="Try a different search or clear the filters." action={<Link href="/courses" className="btn btn-secondary btn-sm">Clear filters</Link>} />
      )}
    </Container>
  );
}

function FilterChip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} className={cn("chip transition-transform hover:-translate-y-0.5", active ? "bg-ink !text-paper" : "bg-white")} aria-current={active ? "true" : undefined}>
      {children}
    </Link>
  );
}
