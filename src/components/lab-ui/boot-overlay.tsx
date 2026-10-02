"use client";

import { Check, Loader2 } from "lucide-react";
import type { BootPhase } from "@/lib/terminal-sandbox";
import { useSandbox } from "./store";
import { cn } from "@/lib/utils";

const PHASES: { id: BootPhase; label: string }[] = [
  { id: "engine", label: "Loading engine" },
  { id: "disk", label: "Connecting to disk image" },
  { id: "linux", label: "Booting Linux" },
  { id: "shell", label: "Starting shell" },
];

/** Never a blank screen: phase list, progress bar and "N disk blocks" (design §4.9). */
export function BootOverlay() {
  const progress = useSandbox((s) => s.progress);
  const current = PHASES.findIndex((p) => p.id === progress?.phase);

  return (
    <div className="absolute inset-0 z-10 grid place-items-center bg-ink/85 p-6">
      <div className="w-full max-w-sm rounded-3xl border-4 border-paper bg-ink p-6 text-paper shadow-[6px_6px_0_#FFF8F0]">
        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-paper/60">Starting your sandbox</p>
        <ul className="mt-4 space-y-2.5">
          {PHASES.map((p, i) => {
            const done = current > i || progress?.phase === "ready";
            const active = current === i;
            return (
              <li key={p.id} className={cn("flex items-center gap-3 text-sm", !done && !active && "text-paper/40")}>
                <span className={cn("grid size-6 place-items-center rounded-md border-2", done ? "border-mint bg-mint text-ink" : active ? "border-sky" : "border-paper/30")}>
                  {done ? <Check className="size-4" /> : active ? <Loader2 className="size-3.5 animate-spin" /> : null}
                </span>
                {p.label}
              </li>
            );
          })}
        </ul>
        <div className="mt-5 h-3 overflow-hidden rounded-full border-2 border-paper bg-[#24294A]">
          <div className="h-full bg-sky transition-[width] duration-300" style={{ width: `${progress?.percent ?? 2}%` }} />
        </div>
        <p className="mt-2 font-mono text-[11px] text-paper/60 tabular-nums">{progress?.detail ?? "First launch downloads the parts of Linux you use; later launches are fast."}</p>
      </div>
    </div>
  );
}
