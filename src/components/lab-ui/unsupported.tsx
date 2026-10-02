"use client";

import { MonitorX, XCircle } from "lucide-react";
import type { Capability } from "@/lib/terminal-sandbox";

/** Full-page explanation instead of a broken terminal (design §4.11). */
export function UnsupportedBrowser({ capabilities, backHref }: { capabilities: Capability[]; backHref: string | null }) {
  const failing = capabilities.filter((c) => !c.ok);
  return (
    <div className="grid h-full place-items-center bg-paper p-6">
      <div className="card-brut max-w-lg p-8">
        <MonitorX className="size-10" />
        <h1 className="mt-4 font-display text-2xl font-extrabold">This browser can&apos;t run the terminal</h1>
        <p className="mt-2 text-sm text-ink/70">Terminal labs run a real Linux system inside your browser. Use a current desktop Chrome, Edge or Firefox.</p>
        <ul className="mt-5 space-y-3">
          {failing.map((c) => (
            <li key={c.id} className="flex gap-3 rounded-2xl border-[3px] border-ink bg-coral/15 p-3 text-sm">
              <XCircle className="mt-0.5 size-4 shrink-0" />
              <span>
                <strong>{c.label}:</strong> {c.help}
              </span>
            </li>
          ))}
        </ul>
        {backHref && (
          <a href={backHref} className="btn btn-secondary mt-6">
            Back to the lesson
          </a>
        )}
      </div>
    </div>
  );
}
