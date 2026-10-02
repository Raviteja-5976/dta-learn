import Image from "next/image";
import { cn } from "@/lib/utils";
import logo from "../../../public/images/logo.png";

/** Logo tile + "DevTrackAcademy" + the sub-brand pill tag (design §3.2). */
export function Wordmark({ className, inverted }: { className?: string; inverted?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <span
        aria-hidden
        className={cn(
          "relative size-9 shrink-0 overflow-hidden rounded-lg border-2 bg-white",
          inverted ? "border-paper shadow-[2px_2px_0_#FFF8F0]" : "border-ink shadow-brut-xs",
        )}
      >
        <Image src={logo} alt="" fill sizes="36px" className="object-contain p-1" priority />
      </span>
      <span className="flex items-baseline gap-2">
        <span className={cn("whitespace-nowrap font-display text-lg font-extrabold tracking-tight md:text-xl", inverted ? "text-paper" : "text-ink")}>
          DevTrack<span className="text-brand">Academy</span>
        </span>
        <span className="hidden rounded-full border border-ink bg-brand px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-widest text-on-brand shadow-[1px_1px_0_#1B1F3B] sm:inline-block">
          Learn
        </span>
      </span>
    </span>
  );
}
