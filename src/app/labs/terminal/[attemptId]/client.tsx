"use client";

import dynamic from "next/dynamic";
import type { TerminalLabAppProps } from "@/components/lab-ui/terminal-lab-app";

// xterm and the engine are browser-only: never server-render them.
const TerminalLabApp = dynamic(() => import("@/components/lab-ui/terminal-lab-app").then((m) => m.TerminalLabApp), {
  ssr: false,
  loading: () => (
    <div className="grid h-dvh place-items-center bg-ink font-mono text-sm text-paper/70">Loading lab…</div>
  ),
});

export function TerminalLabClient(props: TerminalLabAppProps) {
  return <TerminalLabApp {...props} />;
}
