"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, CreditCard, LayoutDashboard, LogOut, PenTool, UserRound } from "lucide-react";
import type { Role } from "@/lib/types";

export function Avatar({ name, url, size = 36 }: { name: string; url?: string | null; size?: number }) {
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" width={size} height={size} referrerPolicy="no-referrer" className="rounded-full border-[3px] border-ink object-cover" style={{ width: size, height: size }} />
  ) : (
    <span className="grid place-items-center rounded-full border-[3px] border-ink bg-yellow font-display text-sm font-bold" style={{ width: size, height: size }}>
      {initials || "?"}
    </span>
  );
}

export function UserMenu({ name, email, avatarUrl, role }: { name: string; email: string; avatarUrl: string | null; role: Role }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-1.5 rounded-full border-[3px] border-transparent p-0.5 pr-2 hover:border-ink hover:bg-white"
      >
        <Avatar name={name} url={avatarUrl} />
        <ChevronDown className="size-4" aria-hidden />
        <span className="sr-only">Account menu</span>
      </button>
      {open && (
        <div role="menu" className="animate-pop absolute right-0 mt-2 w-64 rounded-2xl border-4 border-ink bg-white p-2 shadow-brut">
          <div className="border-b-2 border-ink/15 px-3 pb-2 pt-1">
            <p className="truncate font-display font-bold">{name}</p>
            <p className="truncate text-xs text-ink/60">{email}</p>
            {role !== "student" && <span className="chip mt-1.5 bg-yellow text-[10px]">{role}</span>}
          </div>
          <MenuLink href="/dashboard" icon={<LayoutDashboard className="size-4" />} onClick={() => setOpen(false)}>
            Dashboard
          </MenuLink>
          <MenuLink href="/profile" icon={<UserRound className="size-4" />} onClick={() => setOpen(false)}>
            Profile
          </MenuLink>
          <MenuLink href="/billing" icon={<CreditCard className="size-4" />} onClick={() => setOpen(false)}>
            Billing
          </MenuLink>
          {role !== "student" && (
            <MenuLink href="/studio" icon={<PenTool className="size-4" />} onClick={() => setOpen(false)}>
              Studio
            </MenuLink>
          )}
          <form action="/auth/signout" method="post">
            <button type="submit" role="menuitem" className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold hover:bg-coral/20">
              <LogOut className="size-4" /> Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function MenuLink({ href, icon, children, onClick }: { href: string; icon: React.ReactNode; children: React.ReactNode; onClick: () => void }) {
  return (
    <Link href={href} role="menuitem" onClick={onClick} className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold hover:bg-paper-sunk">
      {icon}
      {children}
    </Link>
  );
}
