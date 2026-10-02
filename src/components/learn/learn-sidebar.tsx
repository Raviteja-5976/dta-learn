"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CheckCircle2, Circle, CircleDot, Lock, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { ItemIcon } from "@/components/course/item-icon";
import { Progress } from "@/components/ui";
import type { ItemKind } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface SidebarSection {
  id: string;
  title: string;
  items: Array<{ id: string; title: string; kind: ItemKind; runtime: "terminal" | "compile" | null; status: "completed" | "in_progress" | "none"; locked: boolean; required: boolean }>;
}

export function LearnSidebar({
  courseSlug,
  courseTitle,
  currentItemId,
  sections,
  percent,
}: {
  courseSlug: string;
  courseTitle: string;
  currentItemId: string;
  sections: SidebarSection[];
  percent: number | null;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    try {
      // Restore a per-viewer preference after hydration.
      setCollapsed(localStorage.getItem("learn.sidebar") === "collapsed");
    } catch {
      /* storage blocked */
    }
  }, []);

  const toggle = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem("learn.sidebar", c ? "open" : "collapsed");
      } catch {
        /* ignore */
      }
      return !c;
    });
  };

  const list = (
    <nav aria-label="Course outline" className="space-y-5 p-4">
      {sections.map((s, si) => (
        <div key={s.id}>
          <p className="eyebrow mb-2 px-2">
            {String(si + 1).padStart(2, "0")} · {s.title}
          </p>
          <ul className="space-y-1">
            {s.items.map((it) => {
              const active = it.id === currentItemId;
              const StatusIcon = it.locked ? Lock : it.status === "completed" ? CheckCircle2 : it.status === "in_progress" ? CircleDot : Circle;
              const inner = (
                <>
                  <ItemIcon kind={it.kind} runtime={it.runtime} className="size-7" />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">{it.title}</span>
                  <StatusIcon className={cn("size-4 shrink-0", it.status === "completed" ? "text-ink" : "text-ink/35")} aria-label={it.status === "completed" ? "Completed" : undefined} />
                </>
              );
              return (
                <li key={it.id}>
                  {it.locked ? (
                    <div className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 opacity-50">{inner}</div>
                  ) : (
                    <Link
                      href={`/learn/${courseSlug}/${it.id}`}
                      onClick={() => setMobileOpen(false)}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-2.5 rounded-xl border-[3px] px-2 py-1.5 transition-colors",
                        active ? "border-ink bg-brand/30 shadow-brut-xs" : "border-transparent hover:bg-paper-sunk",
                      )}
                    >
                      {inner}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  const header = (
    <div className="space-y-3 border-b-4 border-ink p-4">
      <Link href={`/courses/${courseSlug}`} className="block font-display text-lg font-bold leading-tight hover:underline">
        {courseTitle}
      </Link>
      {percent !== null && (
        <div className="space-y-1.5">
          <Progress value={percent} />
          <p className="font-mono text-[11px] font-bold uppercase tracking-wider text-ink/60">{percent}% complete</p>
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Mobile toggle */}
      <div className="flex items-center gap-2 border-b-4 border-ink bg-paper px-4 py-2 lg:hidden">
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setMobileOpen((o) => !o)} aria-expanded={mobileOpen}>
          <PanelLeftOpen className="size-4" /> Outline
        </button>
        <span className="truncate text-sm font-semibold">{courseTitle}</span>
      </div>
      {mobileOpen && (
        <div className="max-h-[60vh] overflow-y-auto border-b-4 border-ink bg-white lg:hidden">
          {header}
          {list}
        </div>
      )}

      {/* Desktop */}
      <aside
        className={cn(
          "sticky top-[72px] hidden h-[calc(100dvh-72px)] shrink-0 flex-col border-r-4 border-ink bg-white transition-[width] duration-200 lg:flex",
          collapsed ? "w-14" : "w-80",
        )}
      >
        <button
          type="button"
          onClick={toggle}
          className="flex items-center gap-2 border-b-4 border-ink px-4 py-2.5 text-left font-mono text-[11px] font-bold uppercase tracking-wider hover:bg-paper-sunk"
          aria-label={collapsed ? "Expand outline" : "Collapse outline"}
        >
          {collapsed ? <PanelLeftOpen className="size-4" /> : <><PanelLeftClose className="size-4" /> Hide outline</>}
        </button>
        {!collapsed && (
          <div className="flex-1 overflow-y-auto">
            {header}
            {list}
          </div>
        )}
      </aside>
    </>
  );
}
