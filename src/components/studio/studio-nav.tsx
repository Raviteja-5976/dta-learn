"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookMarked, FlaskConical, Gauge, Image as ImageIcon, Settings, Users } from "lucide-react";
import { cn } from "@/lib/utils";

export function StudioNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const links = [
    { href: "/studio", label: "Overview", icon: Gauge, exact: true },
    { href: "/studio/courses", label: "Courses", icon: BookMarked },
    { href: "/studio/labs", label: "Labs", icon: FlaskConical },
    { href: "/studio/media", label: "Media", icon: ImageIcon },
    ...(isAdmin
      ? [
          { href: "/studio/learners", label: "Learners", icon: Users },
          { href: "/studio/settings", label: "Settings", icon: Settings },
        ]
      : []),
  ];
  return (
    <nav aria-label="Studio" className="flex shrink-0 gap-1 overflow-x-auto border-b-4 border-ink bg-white p-2 lg:sticky lg:top-[72px] lg:h-[calc(100dvh-72px)] lg:w-56 lg:flex-col lg:border-b-0 lg:border-r-4 lg:p-4">
      <p className="eyebrow mb-2 hidden px-2 lg:block">Studio</p>
      {links.map((l) => {
        const active = l.exact ? pathname === l.href : pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 whitespace-nowrap rounded-xl border-[3px] px-3 py-2 font-display text-sm font-bold",
              active ? "border-ink bg-brand shadow-brut-xs" : "border-transparent hover:bg-paper-sunk",
            )}
          >
            <l.icon className="size-4" /> {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
