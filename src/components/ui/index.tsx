import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

/* ── Button ─────────────────────────────────────────────────────────────── */
type Variant = "primary" | "secondary" | "ghost" | "danger" | "dark";
type Size = "sm" | "md" | "lg";

function btnClass(variant: Variant = "primary", size: Size = "md", className?: string) {
  return cn("btn", `btn-${variant}`, size === "sm" && "btn-sm", size === "lg" && "btn-lg", className);
}

export function Button({
  variant,
  size,
  className,
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button type="button" className={btnClass(variant, size, className)} {...props} />;
}

export function ButtonLink({
  variant,
  size,
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={btnClass(variant, size, className)} {...props} />;
}

/** Plain anchor (full page load) — required when entering/leaving the isolated terminal route. */
export function ButtonAnchor({
  variant,
  size,
  className,
  ...props
}: ComponentProps<"a"> & { variant?: Variant; size?: Size }) {
  return <a className={btnClass(variant, size, className)} {...props} />;
}

/* ── Card ───────────────────────────────────────────────────────────────── */
export function Card({ className, hover, ...props }: ComponentProps<"div"> & { hover?: boolean }) {
  return <div className={cn("card-brut p-[var(--sp-card)]", hover && "card-hover", className)} {...props} />;
}

/* ── Chip ───────────────────────────────────────────────────────────────── */
const CHIP_TONES = {
  default: "bg-white",
  brand: "bg-brand",
  sky: "bg-sky",
  mint: "bg-mint",
  yellow: "bg-yellow",
  coral: "bg-coral",
  orange: "bg-orange",
  ink: "bg-ink !text-paper",
  sunk: "bg-paper-sunk",
} as const;

export type ChipTone = keyof typeof CHIP_TONES;

export function Chip({ tone = "default", className, children, ...props }: ComponentProps<"span"> & { tone?: ChipTone }) {
  return (
    <span className={cn("chip", CHIP_TONES[tone], className)} {...props}>
      {children}
    </span>
  );
}

/* ── Eyebrow / headings ─────────────────────────────────────────────────── */
export function Eyebrow({ className, ...props }: ComponentProps<"p">) {
  return <p className={cn("eyebrow", className)} {...props} />;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-4 md:flex-row md:items-end md:justify-between", className)}>
      <div className="space-y-3">
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <h1 className="text-h2 font-extrabold">{title}</h1>
        {description && <p className="text-lead max-w-2xl text-ink/75">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-3">{actions}</div>}
    </div>
  );
}

/* ── Stat tile ──────────────────────────────────────────────────────────── */
export function StatTile({ label, value, accent = "text-ink", hint }: { label: string; value: ReactNode; accent?: string; hint?: ReactNode }) {
  return (
    <div className="rounded-3xl border-4 border-ink bg-white px-5 py-4 shadow-brut-sm">
      <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-ink/60">{label}</p>
      <p className={cn("mt-1 font-display text-3xl font-extrabold tabular-nums", accent)}>{value}</p>
      {hint && <p className="mt-1 text-xs text-ink/60">{hint}</p>}
    </div>
  );
}

/* ── Progress ───────────────────────────────────────────────────────────── */
export function Progress({ value, className, label }: { value: number; className?: string; label?: string }) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className={cn("progress-brut", className)} role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100} aria-label={label ?? "Progress"}>
      <span style={{ width: `${v}%`, borderRightWidth: v === 0 || v === 100 ? 0 : undefined }} />
    </div>
  );
}

/* ── Form fields ────────────────────────────────────────────────────────── */
export function Label({ className, ...props }: ComponentProps<"label">) {
  return <label className={cn("label-brut", className)} {...props} />;
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn("input-brut", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn("input-brut", className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cn("input-brut cursor-pointer", className)} {...props} />;
}

export function Field({ label, htmlFor, hint, children, className }: { label: string; htmlFor?: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-0", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="mt-1.5 text-xs text-ink/60">{hint}</p>}
    </div>
  );
}

/* ── Callout / alerts ───────────────────────────────────────────────────── */
const ALERT_TONES = {
  info: "bg-sky/25",
  success: "bg-mint/40",
  warning: "bg-yellow/40",
  danger: "bg-coral/25",
} as const;

export function Alert({ tone = "info", title, children, className }: { tone?: keyof typeof ALERT_TONES; title?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-2xl border-4 border-ink p-4 text-sm", ALERT_TONES[tone], className)} role={tone === "danger" ? "alert" : "status"}>
      {title && <p className="font-display font-bold">{title}</p>}
      {children && <div className={cn(title ? "mt-1" : null, "text-ink/85")}>{children}</div>}
    </div>
  );
}

/* ── Empty state ────────────────────────────────────────────────────────── */
export function EmptyState({ title, description, action, icon }: { title: string; description?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-3xl border-4 border-dashed border-ink/40 bg-paper-sunk/60 px-6 py-12 text-center">
      {icon && <div className="text-ink/70">{icon}</div>}
      <p className="font-display text-xl font-bold">{title}</p>
      {description && <p className="max-w-md text-sm text-ink/70">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Container({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("mx-auto w-full max-w-[1320px] px-4 md:px-8", className)} {...props} />;
}
