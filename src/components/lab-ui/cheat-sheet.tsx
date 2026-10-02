"use client";

import { CornerDownLeft } from "lucide-react";
import { useSandbox } from "./store";

export type CheatGroup = { title: string; items: { cmd: string; desc: string }[] };

export const DEFAULT_CHEATSHEET: CheatGroup[] = [
  {
    title: "Navigate",
    items: [
      { cmd: "pwd", desc: "Where am I?" },
      { cmd: "ls -la", desc: "List everything, with details" },
      { cmd: "cd ~/project", desc: "Change directory" },
      { cmd: "tree -L 2", desc: "Show a folder tree" },
    ],
  },
  {
    title: "Files",
    items: [
      { cmd: "cat notes.txt", desc: "Print a file" },
      { cmd: "nano notes.txt", desc: "Edit a file (Ctrl+O save, Ctrl+X exit)" },
      { cmd: "cp a.txt b.txt", desc: "Copy" },
      { cmd: "mv a.txt docs/", desc: "Move or rename" },
      { cmd: "rm -r old/", desc: "Delete (no undo!)" },
    ],
  },
  {
    title: "Search & text",
    items: [
      { cmd: "grep -n error app.log", desc: "Lines matching a pattern" },
      { cmd: "wc -l app.log", desc: "Count lines" },
      { cmd: "sort | uniq -c", desc: "Count unique lines" },
      { cmd: "awk '{print $1}' file", desc: "Print the first column" },
    ],
  },
  {
    title: "Git",
    items: [
      { cmd: "git status", desc: "What changed?" },
      { cmd: "git add -A && git commit -m \"msg\"", desc: "Commit everything" },
      { cmd: "git log --oneline --graph", desc: "History" },
      { cmd: "git switch -c feature", desc: "New branch" },
    ],
  },
  {
    title: "Processes",
    items: [
      { cmd: "ps aux", desc: "Running processes" },
      { cmd: "kill %1", desc: "Stop a background job" },
      { cmd: "history", desc: "Commands you've run" },
    ],
  },
];

export function CheatSheet({ groups }: { groups?: CheatGroup[] | null }) {
  const type = useSandbox((s) => s.typeInTerminal);
  const running = useSandbox((s) => s.status === "running");
  const list = groups?.length ? groups : DEFAULT_CHEATSHEET;
  return (
    <div className="space-y-5 p-4">
      {list.map((g) => (
        <section key={g.title}>
          <p className="eyebrow mb-2">{g.title}</p>
          <ul className="space-y-1.5">
            {g.items.map((it) => (
              <li key={it.cmd}>
                <button
                  type="button"
                  disabled={!running}
                  onClick={() => type(it.cmd, false)}
                  title="Type into the terminal (press Enter to run)"
                  className="group flex w-full items-start gap-2 rounded-xl border-[3px] border-transparent px-2 py-1.5 text-left hover:border-ink hover:bg-white disabled:opacity-60"
                >
                  <span className="min-w-0 flex-1">
                    <code className="block truncate font-mono text-xs font-bold">{it.cmd}</code>
                    {it.desc && <span className="block text-xs text-ink/60">{it.desc}</span>}
                  </span>
                  <CornerDownLeft className="mt-0.5 size-3.5 opacity-0 group-hover:opacity-60" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
