"use client";

import Link from "next/link";
import { useState } from "react";
import { Code2, ExternalLink, Loader2, SquareTerminal } from "lucide-react";
import { Alert } from "@/components/ui";
import { useAction } from "./use-action";
import { createLab, updateItem } from "@/app/(app)/studio/actions";

interface LabOption {
  id: string;
  title: string;
  slug: string;
  runtime_type: "terminal" | "compile";
}

export function LabPicker({ itemId, currentLabId, labs }: { itemId: string; currentLabId: string | null; labs: LabOption[] }) {
  const { run, pending, error } = useAction();
  const [selected, setSelected] = useState(currentLabId ?? "");
  const current = labs.find((l) => l.id === currentLabId);

  return (
    <div className="space-y-6">
      <div className="card-brut space-y-4 p-5">
        <p className="eyebrow">Attached lab</p>
        {current ? (
          <div className="flex flex-wrap items-center gap-3">
            {current.runtime_type === "terminal" ? <SquareTerminal className="size-5" /> : <Code2 className="size-5" />}
            <span className="font-display text-lg font-bold">{current.title}</span>
            <span className="font-mono text-xs text-ink/60">{current.runtime_type} · {current.slug}</span>
            <Link href={`/studio/labs/${current.id}`} className="btn btn-secondary btn-sm ml-auto">
              Edit lab spec <ExternalLink className="size-3.5" />
            </Link>
          </div>
        ) : (
          <p className="text-sm text-ink/60">No lab attached yet. Pick an existing lab or create a new one.</p>
        )}
        <div className="flex flex-wrap gap-2">
          <select value={selected} onChange={(e) => setSelected(e.target.value)} className="input-brut input-sm max-w-md" aria-label="Choose a lab">
            <option value="">— Choose a lab —</option>
            {labs.map((l) => (
              <option key={l.id} value={l.id}>
                {l.title} ({l.runtime_type})
              </option>
            ))}
          </select>
          <button type="button" className="btn btn-primary btn-sm" disabled={pending || selected === (currentLabId ?? "")} onClick={() => run(() => updateItem(itemId, { lab_id: selected || null }))}>
            {pending && <Loader2 className="size-4 animate-spin" />} {selected ? "Attach" : "Detach"}
          </button>
        </div>
        {error && <Alert tone="danger">{error}</Alert>}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {(["terminal", "compile"] as const).map((runtime) => (
          <form key={runtime} action={createLab} className="card-brut space-y-3 p-5">
            <input type="hidden" name="runtime" value={runtime} />
            <input type="hidden" name="itemId" value={itemId} />
            <div className="flex items-center gap-2">
              {runtime === "terminal" ? <SquareTerminal className="size-5" /> : <Code2 className="size-5" />}
              <p className="font-display font-bold">New {runtime === "terminal" ? "terminal" : "coding"} lab</p>
            </div>
            <p className="text-sm text-ink/65">
              {runtime === "terminal"
                ? "Linux, bash and git in the learner's browser, with step checks."
                : "Code in Python, Java, C/C++, Go, SQL… graded on hidden tests via Judge0."}
            </p>
            <input name="title" placeholder="Lab title" className="input-brut input-sm" aria-label="Lab title" />
            <button type="submit" className="btn btn-secondary btn-sm">Create & attach</button>
          </form>
        ))}
      </div>
    </div>
  );
}
