"use client";

import { useState } from "react";
import { Loader2, Save } from "lucide-react";
import { Alert, Field, Input, Textarea } from "@/components/ui";
import { useAction } from "./use-action";
import { updateItem } from "@/app/(app)/studio/actions";
import type { Item } from "@/lib/types";

export function ItemSettings({ item }: { item: Item }) {
  const { run, pending, error } = useAction();
  const [title, setTitle] = useState(item.title);
  const [summary, setSummary] = useState(item.summary ?? "");
  const [minutes, setMinutes] = useState(item.estimated_minutes?.toString() ?? "");
  const [required, setRequired] = useState(item.required);
  const [preview, setPreview] = useState(item.is_preview);
  const [saved, setSaved] = useState(false);

  return (
    <form
      className="card-brut space-y-4 p-5"
      onSubmit={(e) => {
        e.preventDefault();
        setSaved(false);
        run(
          () =>
            updateItem(item.id, {
              title,
              summary: summary || null,
              estimated_minutes: minutes ? Number(minutes) : null,
              required,
              is_preview: preview,
            }),
          { onSuccess: () => setSaved(true) },
        );
      }}
    >
      <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
        <Field label="Title" htmlFor="item-title">
          <Input id="item-title" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={200} />
        </Field>
        <Field label="Minutes" htmlFor="item-minutes">
          <Input id="item-minutes" type="number" min={0} max={600} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
        </Field>
      </div>
      <Field label="Summary" htmlFor="item-summary" hint="One line shown under the title.">
        <Textarea id="item-summary" rows={2} value={summary} onChange={(e) => setSummary(e.target.value)} maxLength={500} />
      </Field>
      <div className="flex flex-wrap items-center gap-5">
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} className="size-4 accent-[#1B1F3B]" /> Required for completion
        </label>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" checked={preview} onChange={(e) => setPreview(e.target.checked)} className="size-4 accent-[#1B1F3B]" /> Free preview
        </label>
        <span className="ml-auto flex items-center gap-3">
          {saved && !pending && <span className="text-sm font-semibold">Saved ✓</span>}
          <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Save settings
          </button>
        </span>
      </div>
      {error && <Alert tone="danger">{error}</Alert>}
    </form>
  );
}
