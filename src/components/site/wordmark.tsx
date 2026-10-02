import { cn } from "@/lib/utils";

/** "DevTrackAcademy" followed by the sub-brand pill tag (design §3.2). */
export function Wordmark({ className, inverted }: { className?: string; inverted?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span
        aria-hidden
        className={cn(
          "grid size-8 place-items-center rounded-lg border-[3px] font-mono text-sm font-bold shadow-brut-xs",
          inverted ? "border-paper bg-brand text-ink" : "border-ink bg-brand text-ink",
        )}
      >
        &gt;_
      </span>
      <span className={cn("font-display text-lg font-bold tracking-tight", inverted ? "text-paper" : "text-ink")}>
        DevTrack<span className="text-ink/55 [.section-dark_&]:text-paper/60">Academy</span>
      </span>
      <span className="chip bg-brand !px-2 !py-0 text-[10px]">LEARN</span>
    </span>
  );
}
