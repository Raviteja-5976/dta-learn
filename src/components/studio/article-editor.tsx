"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Eye, FileDown, Loader2, Pencil, Plus, Save, Trash2 } from "lucide-react";
import { Alert, Field, Input, Select, Textarea } from "@/components/ui";
import { Markdown } from "@/components/markdown";
import { BLOCK_LABELS, BLOCK_TYPES, emptyBlock, type Block, type BlockType } from "@/lib/blocks/schema";
import { videoEmbedUrl } from "@/components/blocks/block-renderer";
import { UploadButton } from "./upload-button";
import { useAction } from "./use-action";
import { saveArticle } from "@/app/(app)/studio/actions";

type Patch<T extends BlockType> = Partial<Extract<Block, { type: T }>["data"]>;

export function ArticleEditor({ itemId, initial }: { itemId: string; initial: Block[] }) {
  const { run, pending, error } = useAction();
  const [blocks, setBlocks] = useState<Block[]>(initial);
  const [dirty, setDirty] = useState(false);
  const [preview, setPreview] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const update = (id: string, patch: Record<string, unknown>) => {
    setBlocks((bs) => bs.map((b) => (b.id === id ? ({ ...b, data: { ...b.data, ...patch } } as Block) : b)));
    setDirty(true);
    setSavedMsg(null);
  };
  const move = (i: number, d: -1 | 1) => {
    setBlocks((bs) => {
      const next = [...bs];
      const j = i + d;
      if (j < 0 || j >= next.length) return bs;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
    setDirty(true);
  };
  const remove = (id: string) => {
    setBlocks((bs) => bs.filter((b) => b.id !== id));
    setDirty(true);
  };
  const add = (type: BlockType, at?: number) => {
    setBlocks((bs) => {
      const next = [...bs];
      next.splice(at ?? next.length, 0, emptyBlock(type));
      return next;
    });
    setDirty(true);
  };

  const save = () =>
    run(() => saveArticle(itemId, blocks), {
      onSuccess: (d) => {
        setDirty(false);
        setSavedMsg(`Saved · about ${d?.readingMinutes ?? 1} min read`);
      },
    });

  return (
    <div className="space-y-5">
      <div className="sticky top-[72px] z-20 flex flex-wrap items-center gap-3 rounded-2xl border-4 border-ink bg-white px-4 py-2.5 shadow-brut-sm">
        <span className="font-display font-bold">Article · {blocks.length} blocks</span>
        {dirty && <span className="chip bg-yellow text-[10px]">unsaved</span>}
        {savedMsg && <span className="text-sm font-semibold">{savedMsg}</span>}
        <div className="ml-auto flex gap-2">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPreview((p) => !p)}>
            {preview ? <Pencil className="size-4" /> : <Eye className="size-4" />} {preview ? "Edit" : "Preview"}
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={pending || !dirty}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Save article
          </button>
        </div>
      </div>
      {error && <Alert tone="danger">{error}</Alert>}

      {preview ? (
        <div className="card-brut space-y-7 p-8">
          {blocks.map((b) => (
            <PreviewBlock key={b.id} block={b} />
          ))}
        </div>
      ) : (
        <>
          {blocks.map((block, i) => (
            <div key={block.id} className="card-brut overflow-hidden">
              <div className="flex items-center gap-2 border-b-[3px] border-ink bg-paper-sunk px-4 py-2">
                <span className="font-mono text-xs font-bold uppercase tracking-wider">{BLOCK_LABELS[block.type]}</span>
                <div className="ml-auto flex">
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up"><ArrowUp className="size-4" /></button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => move(i, 1)} disabled={i === blocks.length - 1} aria-label="Move down"><ArrowDown className="size-4" /></button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => remove(block.id)} aria-label="Delete block"><Trash2 className="size-4" /></button>
                </div>
              </div>
              <div className="space-y-4 p-4">
                <BlockFields block={block} onChange={(patch) => update(block.id, patch)} />
              </div>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-2 rounded-3xl border-4 border-dashed border-ink/40 p-4">
            <span className="eyebrow mr-2">Add block</span>
            {BLOCK_TYPES.map((t) => (
              <button key={t} type="button" className="btn btn-secondary btn-sm" onClick={() => add(t)}>
                <Plus className="size-4" /> {BLOCK_LABELS[t]}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function BlockFields({ block, onChange }: { block: Block; onChange: (patch: Record<string, unknown>) => void }) {
  switch (block.type) {
    case "markdown":
      return (
        <Textarea rows={Math.min(24, Math.max(6, block.data.md.split("\n").length + 1))} value={block.data.md} onChange={(e) => onChange({ md: e.target.value } satisfies Patch<"markdown">)} className="font-mono text-[13px]" placeholder="## Heading&#10;&#10;Write **Markdown** here…" aria-label="Markdown" />
      );
    case "code":
      return (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Language" htmlFor={`${block.id}-lang`}>
              <Input id={`${block.id}-lang`} value={block.data.language} onChange={(e) => onChange({ language: e.target.value })} placeholder="bash, python, js…" className="font-mono" />
            </Field>
            <Field label="File name (optional)" htmlFor={`${block.id}-fn`}>
              <Input id={`${block.id}-fn`} value={block.data.filename ?? ""} onChange={(e) => onChange({ filename: e.target.value || undefined })} className="font-mono" />
            </Field>
          </div>
          <Textarea rows={Math.min(24, Math.max(5, block.data.code.split("\n").length + 1))} value={block.data.code} onChange={(e) => onChange({ code: e.target.value })} className="font-mono text-[13px]" aria-label="Code" spellCheck={false} />
        </>
      );
    case "callout":
      return (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Tone" htmlFor={`${block.id}-tone`}>
              <Select id={`${block.id}-tone`} value={block.data.tone} onChange={(e) => onChange({ tone: e.target.value })}>
                <option value="info">Note</option>
                <option value="tip">Tip</option>
                <option value="warning">Heads up</option>
                <option value="danger">Careful</option>
              </Select>
            </Field>
            <Field label="Title (optional)" htmlFor={`${block.id}-title`}>
              <Input id={`${block.id}-title`} value={block.data.title ?? ""} onChange={(e) => onChange({ title: e.target.value || undefined })} />
            </Field>
          </div>
          <Textarea rows={4} value={block.data.md} onChange={(e) => onChange({ md: e.target.value })} className="font-mono text-[13px]" aria-label="Callout text" />
        </>
      );
    case "image":
      return (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Image URL" htmlFor={`${block.id}-url`} className="min-w-0 flex-1">
              <Input id={`${block.id}-url`} value={block.data.url} onChange={(e) => onChange({ url: e.target.value })} placeholder="https://…" />
            </Field>
            <UploadButton accept="image/*" label="Upload image" onUploaded={(f) => f.url && onChange({ url: f.url, alt: block.data.alt || f.name.replace(/\.[^.]+$/, "") })} />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Alt text" htmlFor={`${block.id}-alt`} hint="Describe the image for screen readers.">
              <Input id={`${block.id}-alt`} value={block.data.alt} onChange={(e) => onChange({ alt: e.target.value })} />
            </Field>
            <Field label="Caption (optional)" htmlFor={`${block.id}-cap`}>
              <Input id={`${block.id}-cap`} value={block.data.caption ?? ""} onChange={(e) => onChange({ caption: e.target.value || undefined })} />
            </Field>
          </div>
          {block.data.url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={block.data.url} alt="" className="max-h-48 rounded-xl border-[3px] border-ink" />
          )}
        </>
      );
    case "video":
      return (
        <>
          <div className="grid gap-3 md:grid-cols-[180px_1fr]">
            <Field label="Provider" htmlFor={`${block.id}-prov`}>
              <Select id={`${block.id}-prov`} value={block.data.provider} onChange={(e) => onChange({ provider: e.target.value })}>
                <option value="youtube">YouTube</option>
                <option value="vimeo">Vimeo</option>
                <option value="bunny">Bunny Stream (embed URL)</option>
                <option value="file">Uploaded MP4</option>
              </Select>
            </Field>
            <div className="flex flex-wrap items-end gap-3">
              <Field label="URL" htmlFor={`${block.id}-vurl`} className="min-w-0 flex-1">
                <Input id={`${block.id}-vurl`} value={block.data.url} onChange={(e) => onChange({ url: e.target.value })} placeholder={block.data.provider === "bunny" ? "https://iframe.mediadelivery.net/embed/<library>/<video>" : "https://…"} />
              </Field>
              {block.data.provider === "file" && <UploadButton accept="video/mp4,video/webm" label="Upload video" onUploaded={(f) => f.url && onChange({ url: f.url })} />}
            </div>
          </div>
          <Field label="Title (optional)" htmlFor={`${block.id}-vt`}>
            <Input id={`${block.id}-vt`} value={block.data.title ?? ""} onChange={(e) => onChange({ title: e.target.value || undefined })} />
          </Field>
          {block.data.url && block.data.provider !== "file" && !videoEmbedUrl(block.data.provider, block.data.url) && (
            <Alert tone="warning">This URL doesn&apos;t look like a {block.data.provider} link.</Alert>
          )}
        </>
      );
    case "file":
      return (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <UploadButton visibility="private" label={block.data.key ? "Replace file" : "Upload file"} onUploaded={(f) => onChange({ key: f.key, name: block.data.name || f.name, size: f.size })} />
            {block.data.key ? (
              <span className="flex items-center gap-2 font-mono text-xs"><FileDown className="size-4" /> {block.data.key}</span>
            ) : (
              <span className="text-sm text-ink/60">Private: only learners with access can download it.</span>
            )}
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Display name" htmlFor={`${block.id}-fname`}>
              <Input id={`${block.id}-fname`} value={block.data.name} onChange={(e) => onChange({ name: e.target.value })} />
            </Field>
            <Field label="Description (optional)" htmlFor={`${block.id}-fdesc`}>
              <Input id={`${block.id}-fdesc`} value={block.data.description ?? ""} onChange={(e) => onChange({ description: e.target.value || undefined })} />
            </Field>
          </div>
        </>
      );
  }
}

function PreviewBlock({ block }: { block: Block }) {
  switch (block.type) {
    case "markdown":
      return <Markdown>{block.data.md}</Markdown>;
    case "code":
      return <Markdown>{"```" + block.data.language + "\n" + block.data.code + "\n```"}</Markdown>;
    case "callout":
      return (
        <aside className="rounded-2xl border-4 border-ink bg-sky/20 p-4">
          {block.data.title && <p className="font-display font-bold">{block.data.title}</p>}
          <Markdown compact>{block.data.md}</Markdown>
        </aside>
      );
    case "image":
      // eslint-disable-next-line @next/next/no-img-element
      return block.data.url ? <img src={block.data.url} alt={block.data.alt} className="rounded-2xl border-4 border-ink" /> : null;
    case "video":
      return <p className="rounded-xl border-[3px] border-ink bg-ink p-6 text-center font-mono text-sm text-paper">▶ {block.data.title || block.data.url || "Video"}</p>;
    case "file":
      return <p className="rounded-xl border-[3px] border-ink p-4 font-semibold">⬇ {block.data.name || "File"}</p>;
  }
}
