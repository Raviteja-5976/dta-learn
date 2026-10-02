import { ArrowRight, BookOpenText, CheckCircle2, Code2, SquareTerminal, Trophy } from "lucide-react";
import { ButtonLink, Chip, Container, Eyebrow } from "@/components/ui";
import { CourseCard } from "@/components/course/course-card";
import { listPublishedCourses } from "@/lib/catalog";
import { getViewer } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/env";

export default async function HomePage() {
  const [viewer, courses] = await Promise.all([getViewer(), isSupabaseConfigured() ? listPublishedCourses() : Promise.resolve([])]);

  return (
    <>
      {/* ── Hero ── */}
      <section className="bg-grid border-b-4 border-ink">
        <Container className="grid items-center gap-12 py-[var(--sp-block)] lg:grid-cols-[1.2fr_1fr] lg:py-24">
          <div className="space-y-7">
            <div className="flex flex-wrap gap-2">
              <Chip tone="brand">Real Linux in your browser</Chip>
              <Chip tone="mint">Auto-graded</Chip>
            </div>
            <h1 className="text-hero font-extrabold">
              Learn to code by <span className="marker">doing</span> it.
            </h1>
            <p className="text-lead max-w-xl text-ink/75">
              Short articles, then straight into a real terminal or code editor. Every step is checked automatically, so you always know you got it right.
            </p>
            <div className="flex flex-wrap gap-3">
              <ButtonLink href={viewer ? "/dashboard" : "/signup"} size="lg">
                {viewer ? "Continue learning" : "Start for free"} <ArrowRight className="size-5" />
              </ButtonLink>
              <ButtonLink href="/courses" variant="secondary" size="lg">
                Browse courses
              </ButtonLink>
            </div>
          </div>

          {/* Terminal mock */}
          <div className="tilt-pos-1 overflow-hidden rounded-3xl border-4 border-ink bg-ink shadow-brut-lg">
            <div className="flex items-center gap-2 border-b-4 border-ink bg-paper-sunk px-4 py-2.5">
              <span className="size-3 rounded-full border-2 border-ink bg-coral" />
              <span className="size-3 rounded-full border-2 border-ink bg-yellow" />
              <span className="size-3 rounded-full border-2 border-ink bg-mint" />
              <span className="ml-2 font-mono text-xs font-bold uppercase tracking-wider">git-branches-101 · step 2/3</span>
            </div>
            <pre className="space-y-1 p-5 font-mono text-[13px] leading-relaxed text-paper">
              <code>
                <span className="text-sky">user@sandbox</span>:<span className="text-yellow">~/project</span>$ git switch -c feature/login{"\n"}
                Switched to a new branch &apos;feature/login&apos;{"\n"}
                <span className="text-sky">user@sandbox</span>:<span className="text-yellow">~/project</span>$ echo &quot;form&quot; &gt; login.html{"\n"}
                <span className="text-sky">user@sandbox</span>:<span className="text-yellow">~/project</span>$ git commit -qam &quot;Add login form&quot;{"\n"}
                <span className="text-mint">✓ Check passed: one commit on feature/login</span>{"\n"}
                <span className="text-sky">user@sandbox</span>:<span className="text-yellow">~/project</span>$ <span className="animate-blink">▌</span>
              </code>
            </pre>
          </div>
        </Container>
      </section>

      {/* ── The loop ── */}
      <section className="py-[var(--sp-section)]">
        <Container className="space-y-12">
          <div className="max-w-2xl space-y-3">
            <Eyebrow>How every lesson works</Eyebrow>
            <h2 className="text-display font-extrabold">Read a little. Do a lot.</h2>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: BookOpenText, title: "Read", text: "A short article sets up exactly what you are about to do.", tone: "bg-white", tilt: "tilt-neg-1" },
              { icon: SquareTerminal, title: "Do", text: "Open a real Debian shell or a code editor — right in your browser tab.", tone: "bg-sky", tilt: "tilt-pos-1" },
              { icon: CheckCircle2, title: "Get checked", text: "Each step is verified automatically. Code is graded against hidden tests.", tone: "bg-mint", tilt: "tilt-neg-2" },
              { icon: Trophy, title: "Move on", text: "Quizzes lock it in. Finish the course and earn a verifiable certificate.", tone: "bg-yellow", tilt: "tilt-pos-2" },
            ].map((s, i) => (
              <div key={s.title} className={`card-brut card-hover p-6 ${s.tilt}`}>
                <div className={`mb-5 grid size-12 place-items-center rounded-2xl border-4 border-ink ${s.tone}`}>
                  <s.icon className="size-6" />
                </div>
                <p className="font-mono text-xs font-bold text-ink/50">0{i + 1}</p>
                <h3 className="font-display text-2xl font-bold">{s.title}</h3>
                <p className="mt-2 text-sm text-ink/70">{s.text}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      {/* ── Courses ── */}
      <section className="border-y-4 border-ink bg-paper-sunk py-[var(--sp-section)]">
        <Container className="space-y-10">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="space-y-3">
              <Eyebrow>Catalog</Eyebrow>
              <h2 className="text-h2 font-extrabold">Start with a course</h2>
            </div>
            <ButtonLink href="/courses" variant="secondary">
              All courses <ArrowRight className="size-4" />
            </ButtonLink>
          </div>
          {courses.length ? (
            <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {courses.slice(0, 6).map((c, i) => (
                <CourseCard key={c.id} course={c} index={i} />
              ))}
            </div>
          ) : (
            <p className="rounded-2xl border-4 border-dashed border-ink/40 p-8 text-center text-ink/70">
              Courses will appear here once they are published from the Studio.
            </p>
          )}
        </Container>
      </section>

      {/* ── Two runtimes ── */}
      <section className="py-[var(--sp-section)]">
        <Container className="grid gap-8 lg:grid-cols-2">
          <div className="card-brut p-8">
            <SquareTerminal className="size-10" />
            <h3 className="mt-4 font-display text-3xl font-bold">Terminal labs</h3>
            <p className="mt-3 text-ink/75">
              A real Debian Linux runs inside your browser tab: bash, git, vim, python3. A file manager, guided steps and live checks sit right next to it. Nothing to install, and nothing leaves your machine.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {["bash", "git", "grep · sed · awk", "tmux", "python3"].map((t) => (
                <Chip key={t} tone="sky">{t}</Chip>
              ))}
            </div>
          </div>
          <div className="card-brut p-8">
            <Code2 className="size-10" />
            <h3 className="mt-4 font-display text-3xl font-bold">Coding labs</h3>
            <p className="mt-3 text-ink/75">
              Write code in a full editor and run it on our sandboxed compile service. Check runs your solution against hidden tests, and a pass counts toward your certificate.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {["Python", "Java", "C / C++", "Go", "Rust", "JavaScript", "SQL"].map((t) => (
                <Chip key={t} tone="yellow">{t}</Chip>
              ))}
            </div>
          </div>
        </Container>
      </section>

      {/* ── Final CTA ── */}
      <section>
        <Container>
          <div className="section-dark flex flex-col items-start gap-6 rounded-3xl border-4 border-ink p-10 shadow-brut-lg md:flex-row md:items-center md:justify-between md:p-14">
            <div className="space-y-3">
              <h2 className="text-h2 font-extrabold">Your first lab takes five minutes.</h2>
              <p className="text-paper/70">Free courses, no credit card, nothing to install.</p>
            </div>
            <ButtonLink href={viewer ? "/courses" : "/signup"} size="lg">
              {viewer ? "Pick a course" : "Create a free account"} <ArrowRight className="size-5" />
            </ButtonLink>
          </div>
        </Container>
      </section>
    </>
  );
}
