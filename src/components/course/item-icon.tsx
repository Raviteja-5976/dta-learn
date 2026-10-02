import { BookOpenText, CircleHelp, SquareTerminal, Code2 } from "lucide-react";
import type { ItemKind } from "@/lib/types";
import { cn } from "@/lib/utils";

export const KIND_META: Record<ItemKind, { label: string; tone: string }> = {
  article: { label: "Article", tone: "bg-white" },
  lab: { label: "Lab", tone: "bg-sky" },
  quiz: { label: "Quiz", tone: "bg-yellow" },
};

export function ItemIcon({ kind, runtime, className }: { kind: ItemKind; runtime?: "terminal" | "compile" | null; className?: string }) {
  const Icon = kind === "article" ? BookOpenText : kind === "quiz" ? CircleHelp : runtime === "compile" ? Code2 : SquareTerminal;
  return (
    <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg border-[3px] border-ink", KIND_META[kind].tone, className)}>
      <Icon className="size-4" aria-hidden />
    </span>
  );
}
