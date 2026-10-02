"use client";

import { useState } from "react";
import { CloudDownload, Loader2, Plus, Save } from "lucide-react";
import { Alert, Chip, Field, Input, Select } from "@/components/ui";
import { useAction } from "./use-action";
import { addSandboxImage, fetchProviderLanguages, setImageStatus, updateLanguage } from "@/app/(app)/studio/actions";
import type { CompileLanguage, SandboxImage } from "@/lib/types";

export function LanguagesPanel({ languages, judge0Configured }: { languages: CompileLanguage[]; judge0Configured: boolean }) {
  const { run, pending, error } = useAction();
  const [provider, setProvider] = useState<{ id: number; name: string }[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function loadProvider() {
    setLoading(true);
    setLoadError(null);
    const res = await fetchProviderLanguages();
    setLoading(false);
    if (res.ok) setProvider(res.data ?? []);
    else setLoadError(res.error);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Chip tone={judge0Configured ? "mint" : "coral"}>{judge0Configured ? "Judge0 configured" : "JUDGE0_URL not set"}</Chip>
        <button type="button" className="btn btn-secondary btn-sm" onClick={loadProvider} disabled={!judge0Configured || loading}>
          {loading ? <Loader2 className="size-4 animate-spin" /> : <CloudDownload className="size-4" />} Fetch languages from Judge0
        </button>
      </div>
      {loadError && <Alert tone="danger">{loadError}</Alert>}
      {error && <Alert tone="danger">{error}</Alert>}
      <div className="overflow-x-auto rounded-3xl border-4 border-ink bg-white shadow-brut-sm">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b-4 border-ink bg-paper-sunk font-mono text-[11px] uppercase tracking-wider">
            <tr>
              <th className="px-3 py-2 text-left">Slug</th>
              <th className="px-3 py-2 text-left">Label</th>
              <th className="px-3 py-2 text-left">Judge0 id</th>
              <th className="px-3 py-2 text-left">CPU s · wall s · MiB</th>
              <th className="px-3 py-2 text-left">Enabled</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {languages.map((l) => (
              <LanguageRow key={l.slug} lang={l} provider={provider} pending={pending} onSave={(patch) => run(() => updateLanguage(l.slug, patch))} />
            ))}
          </tbody>
        </table>
      </div>
      {provider && (
        <details className="card-brut p-4">
          <summary className="eyebrow cursor-pointer">Judge0 reports {provider.length} languages</summary>
          <ul className="mt-3 grid gap-x-6 gap-y-1 font-mono text-xs sm:grid-cols-2 lg:grid-cols-3">
            {provider.map((p) => (
              <li key={p.id}><strong>{p.id}</strong> {p.name}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function LanguageRow({
  lang,
  provider,
  pending,
  onSave,
}: {
  lang: CompileLanguage;
  provider: { id: number; name: string }[] | null;
  pending: boolean;
  onSave: (patch: Parameters<typeof updateLanguage>[1]) => void;
}) {
  const [id, setId] = useState(lang.provider_language_id);
  const [label, setLabel] = useState(lang.label);
  const [enabled, setEnabled] = useState(lang.enabled);
  const [limits, setLimits] = useState(lang.default_limits);
  const providerName = provider?.find((p) => p.id === id)?.name;
  const dirty = id !== lang.provider_language_id || label !== lang.label || enabled !== lang.enabled || JSON.stringify(limits) !== JSON.stringify(lang.default_limits);

  return (
    <tr className="border-b-2 border-ink/10 last:border-0">
      <td className="px-3 py-2 font-mono font-bold">{lang.slug}</td>
      <td className="px-3 py-2"><input value={label} onChange={(e) => setLabel(e.target.value)} className="w-40 rounded-lg border-2 border-ink px-2 py-1" aria-label="Label" /></td>
      <td className="px-3 py-2">
        <input type="number" value={id} onChange={(e) => setId(Number(e.target.value))} className="w-20 rounded-lg border-2 border-ink px-2 py-1 font-mono" aria-label="Judge0 language id" />
        {provider && <span className={`ml-2 text-xs ${providerName ? "text-ink/60" : "text-[#C2183A]"}`}>{providerName ?? "not on this Judge0"}</span>}
      </td>
      <td className="px-3 py-2">
        <div className="flex gap-1">
          {(["cpuSeconds", "wallSeconds", "memoryMiB"] as const).map((k) => (
            <input key={k} type="number" value={limits[k]} onChange={(e) => setLimits({ ...limits, [k]: Number(e.target.value) })} className="w-16 rounded-lg border-2 border-ink px-1.5 py-1 font-mono" aria-label={k} />
          ))}
        </div>
      </td>
      <td className="px-3 py-2"><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="size-4 accent-[#1B1F3B]" aria-label="Enabled" /></td>
      <td className="px-3 py-2 text-right">
        <button type="button" className="btn btn-primary btn-sm" disabled={!dirty || pending} onClick={() => onSave({ provider_language_id: id, label, enabled, default_limits: limits })}>
          <Save className="size-3.5" />
        </button>
      </td>
    </tr>
  );
}

export function ImagesPanel({ images }: { images: SandboxImage[] }) {
  const { run, pending, error } = useAction();
  const [form, setForm] = useState({ slug: "", version: 1, url: "", image_type: "bytes" as SandboxImage["image_type"], sha256: "", notes: "" });

  return (
    <div className="space-y-4">
      {error && <Alert tone="danger">{error}</Alert>}
      <div className="space-y-3">
        {images.map((img) => (
          <div key={img.id} className="card-brut flex flex-wrap items-center gap-3 p-4">
            <span className="font-mono font-bold">{img.slug}:{img.version}</span>
            <Chip tone="sunk">{img.image_type}</Chip>
            <Chip tone={img.status === "active" ? "mint" : "sunk"}>{img.status}</Chip>
            <span className="min-w-0 flex-1 truncate font-mono text-xs text-ink/60" title={img.url}>{img.url}</span>
            <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => run(() => setImageStatus(img.id, img.status === "active" ? "retired" : "active"))}>
              {img.status === "active" ? "Retire" : "Reactivate"}
            </button>
            {img.notes && <p className="w-full text-xs text-ink/60">{img.notes}</p>}
          </div>
        ))}
      </div>
      <form
        className="card-brut space-y-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => addSandboxImage(form), { onSuccess: () => setForm({ ...form, url: "", sha256: "", notes: "" }) });
        }}
      >
        <p className="font-display font-bold">Register an image version</p>
        <p className="text-xs text-ink/60">Images are immutable: a changed image is a new version with a new file name (design §4.10). Labs reference <code>slug</code> (latest active) or <code>slug:version</code>.</p>
        <div className="grid gap-3 md:grid-cols-[1fr_100px_140px]">
          <Field label="Slug" htmlFor="img-slug"><Input id="img-slug" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="linux-git" required className="font-mono" /></Field>
          <Field label="Version" htmlFor="img-ver"><Input id="img-ver" type="number" min={1} value={form.version} onChange={(e) => setForm({ ...form, version: Number(e.target.value) })} /></Field>
          <Field label="Type" htmlFor="img-type">
            <Select id="img-type" value={form.image_type} onChange={(e) => setForm({ ...form, image_type: e.target.value as SandboxImage["image_type"] })}>
              <option value="bytes">bytes (HTTP range)</option>
              <option value="cloud">cloud (CloudDevice)</option>
              <option value="github">github (chunks)</option>
            </Select>
          </Field>
        </div>
        <Field label="Image URL" htmlFor="img-url"><Input id="img-url" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://images.example.com/rootfs-linux-git-v1.ext2" required className="font-mono" /></Field>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="SHA-256 (optional)" htmlFor="img-sha"><Input id="img-sha" value={form.sha256} onChange={(e) => setForm({ ...form, sha256: e.target.value })} className="font-mono" /></Field>
          <Field label="Notes" htmlFor="img-notes"><Input id="img-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
        </div>
        <button type="submit" className="btn btn-primary btn-sm" disabled={pending}><Plus className="size-4" /> Add image</button>
      </form>
    </div>
  );
}
