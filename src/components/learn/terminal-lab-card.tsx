"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Circle, Laptop, SquareTerminal, Rocket } from "lucide-react";
import { Markdown } from "@/components/markdown";
import { Alert, Chip } from "@/components/ui";
import { publicEnv } from "@/lib/env";
import { isSmallScreen } from "@/lib/terminal-sandbox/capabilities";
import { preloadModule, prefetchImageHead, prewarmEngine } from "@/lib/terminal-sandbox/prefetch";

/**
 * A terminal lab cannot be embedded in the lesson page: the sandbox needs a
 * cross-origin isolated top-level page (design §2, §4.11). This card links to
 * the isolated route with a FULL page load and pre-warms the engine.
 */
export function TerminalLabCard({
  attemptId,
  description,
  steps,
  stepsPassed,
  image,
  estimatedMinutes,
}: {
  attemptId: string;
  description?: string;
  steps: { id: string; title: string; graded: boolean }[];
  stepsPassed: string[];
  image: { url: string; type: "cloud" | "bytes" | "github"; bootManifest: string[] | null };
  estimatedMinutes?: number;
}) {
  const [small, setSmall] = useState(false);

  useEffect(() => {
    // Design §4.9 step 1: warm the engine module and the image head early.
    preloadModule(publicEnv.cheerpxVersion);
    prefetchImageHead(image.url, image.type);
    setSmall(isSmallScreen());
  }, [image.url, image.type]);

  const warm = () => prewarmEngine(publicEnv.cheerpxVersion, image.bootManifest);
  const graded = steps.filter((s) => s.graded);
  const passed = graded.filter((s) => stepsPassed.includes(s.id)).length;

  return (
    <div className="space-y-6">
      <div className="section-dark overflow-hidden rounded-3xl border-4 border-ink shadow-brut">
        <div className="flex flex-col gap-6 p-7 md:flex-row md:items-center">
          <div className="grid size-16 shrink-0 place-items-center rounded-2xl border-4 border-paper bg-brand text-ink">
            <SquareTerminal className="size-8" />
          </div>
          <div className="flex-1 space-y-2">
            <div className="flex flex-wrap gap-2">
              <Chip tone="brand">Terminal lab</Chip>
              <Chip tone="sunk" className="!border-paper">{passed}/{graded.length} steps</Chip>
              {estimatedMinutes ? <Chip tone="sunk" className="!border-paper">~{estimatedMinutes} min</Chip> : null}
            </div>
            <p className="text-paper/80">A real Debian shell runs in your browser tab, with a file manager and guided steps that check your work as you go.</p>
          </div>
          <a
            href={`/labs/terminal/${attemptId}`}
            className="btn btn-primary btn-lg !border-paper"
            onMouseEnter={warm}
            onFocus={warm}
          >
            <Rocket className="size-5" /> {passed > 0 ? "Resume lab" : "Open terminal lab"}
          </a>
        </div>
      </div>

      {small && (
        <Alert tone="warning" title="Built for a laptop">
          <span className="inline-flex items-center gap-2"><Laptop className="size-4" /> Terminal labs need a desktop browser (Chrome, Edge or Firefox). Read the steps here and continue on a laptop.</span>
        </Alert>
      )}

      {description && <Markdown>{description}</Markdown>}

      <div className="card-brut p-6">
        <p className="eyebrow mb-4">Steps</p>
        <ol className="space-y-2">
          {steps.map((s, i) => {
            const done = stepsPassed.includes(s.id);
            return (
              <li key={s.id} className="flex items-center gap-3">
                {done ? <CheckCircle2 className="size-5" aria-label="Passed" /> : <Circle className="size-5 text-ink/30" aria-hidden />}
                <span className="font-mono text-xs font-bold text-ink/50">{String(i + 1).padStart(2, "0")}</span>
                <span className={done ? "font-semibold" : ""}>{s.title}</span>
              </li>
            );
          })}
        </ol>
      </div>
      <p className="text-xs text-ink/60">
        Terminal checks run in your browser, so they count toward progress as <strong>self-verified</strong>. Your sandbox is wiped when you stop it.
      </p>
    </div>
  );
}
