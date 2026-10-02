"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(href + "/");
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "whitespace-nowrap rounded-xl border-[3px] px-3 py-1.5 font-display text-sm font-bold transition-colors",
        active ? "border-ink bg-brand text-on-brand shadow-brut-xs" : "border-transparent hover:bg-paper-sunk hover:text-brand",
      )}
    >
      {children}
    </Link>
  );
}
