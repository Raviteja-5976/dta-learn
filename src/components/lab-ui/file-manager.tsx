"use client";

import { useCallback, useEffect, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import {
  ArrowUp,
  Download,
  Eye,
  EyeOff,
  File,
  FilePlus2,
  Folder,
  FolderPlus,
  Home,
  Link2,
  Loader2,
  Pencil,
  RefreshCw,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { MAX_EDITOR_BYTES, MAX_UPLOAD_BYTES, VmError, basename, dirname, joinPath, validateName, type VmEntry } from "@/lib/terminal-sandbox";
import { useSandbox } from "./store";
import { cn } from "@/lib/utils";

const HOME = "/home/user";

function formatSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function formatTime(ms: number): string {
  if (!ms) return "—";
  const d = new Date(ms);
  const sameDay = new Date().toDateString() === d.toDateString();
  return sameDay ? d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : d.toLocaleDateString();
}

function saveBlob(bytes: Uint8Array, name: string, type = "application/octet-stream") {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const isDirLike = (e: VmEntry) => e.type === "dir" || (e.type === "symlink" && e.linkToDir);

export function FileManager() {
  const session = useSandbox((s) => s.session);
  const running = useSandbox((s) => s.status === "running");
  const fsVersion = useSandbox((s) => s.fsVersion);
  const bumpFs = useSandbox((s) => s.bumpFs);
  const showDotfiles = useSandbox((s) => s.settings.showDotfiles);
  const updateSettings = useSandbox((s) => s.updateSettings);

  const [cwd, setCwd] = useState(HOME);
  const [entries, setEntries] = useState<VmEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ path: string; content: string } | null>(null);
  const [dropActive, setDropActive] = useState(false);
  const uploadRef = useRef<HTMLInputElement>(null);

  const fs = session?.adapter.fs;

  const refresh = useCallback(async () => {
    if (!fs || !running) return;
    setLoading(true);
    try {
      setEntries(await fs.list(cwd));
      setError(null);
    } catch (e) {
      if (e instanceof VmError && e.code === "not_found" && cwd !== HOME) setCwd(HOME);
      else setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [fs, running, cwd]);

  useEffect(() => {
    void refresh();
  }, [refresh, fsVersion]);

  async function act(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setError(null);
    try {
      await fn();
      bumpFs();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const visible = entries.filter((e) => showDotfiles || !e.name.startsWith("."));

  async function open(entry: VmEntry) {
    if (!fs) return;
    if (isDirLike(entry)) {
      setCwd(entry.path);
      setSelected(null);
      return;
    }
    if (entry.size > MAX_EDITOR_BYTES) {
      setError("Files over 1 MiB open as a download instead.");
      return download(entry);
    }
    await act("Opening…", async () => {
      const bytes = await fs.read(entry.path);
      setEditing({ path: entry.path, content: new TextDecoder().decode(bytes) });
    });
  }

  async function download(entry: VmEntry) {
    if (!fs) return;
    await act("Preparing download…", async () => {
      if (isDirLike(entry)) saveBlob(await fs.archive(entry.path), `${entry.name}.tar.gz`, "application/gzip");
      else saveBlob(await fs.read(entry.path), entry.name);
    });
  }

  async function create(kind: "file" | "folder") {
    const name = prompt(kind === "file" ? "New file name" : "New folder name");
    if (!name || !fs) return;
    await act("Creating…", async () => {
      validateName(name);
      const path = joinPath(cwd, name);
      if (entries.some((e) => e.name === name)) throw new Error(`${name} already exists`);
      if (kind === "file") await fs.write(path, "");
      else await fs.mkdir(path);
    });
  }

  async function rename(entry: VmEntry) {
    const name = prompt("Rename to", entry.name);
    if (!name || name === entry.name || !fs) return;
    await act("Renaming…", async () => {
      validateName(name);
      await fs.rename(entry.path, joinPath(dirname(entry.path), name));
    });
  }

  async function remove(entry: VmEntry) {
    if (!fs || !confirm(`Delete ${entry.name}${isDirLike(entry) ? " and everything inside it" : ""}? This cannot be undone.`)) return;
    await act("Deleting…", () => fs.remove(entry.path, { recursive: isDirLike(entry) }));
    setSelected(null);
  }

  async function upload(files: FileList | File[]) {
    if (!fs) return;
    const list = Array.from(files);
    await act(`Uploading ${list.length} file${list.length === 1 ? "" : "s"}…`, async () => {
      for (const f of list) {
        if (f.size > MAX_UPLOAD_BYTES) throw new Error(`${f.name} is larger than 200 MB`);
        validateName(f.name);
        await fs.write(joinPath(cwd, f.name), new Uint8Array(await f.arrayBuffer()));
      }
    });
  }

  async function move(fromPath: string, toDir: string) {
    if (!fs || dirname(fromPath) === toDir) return;
    await act("Moving…", () => fs.rename(fromPath, joinPath(toDir, basename(fromPath))));
  }

  function onRowKey(e: KeyboardEvent, entry: VmEntry) {
    if (e.key === "Enter") void open(entry);
    else if (e.key === "F2") {
      e.preventDefault();
      void rename(entry);
    } else if (e.key === "Delete") void remove(entry);
  }

  function onPanelDrop(e: DragEvent) {
    e.preventDefault();
    setDropActive(false);
    if (e.dataTransfer.files.length) void upload(e.dataTransfer.files);
  }

  const crumbs = cwd.split("/").filter(Boolean);

  if (!running) {
    return <p className="p-4 text-sm text-ink/60">Files appear here once the sandbox is running.</p>;
  }

  return (
    <div
      className={cn("flex h-full min-h-0 flex-col", dropActive && "bg-sky/15 outline-dashed outline-[3px] -outline-offset-4 outline-ink")}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          setDropActive(true);
        }
      }}
      onDragLeave={() => setDropActive(false)}
      onDrop={onPanelDrop}
    >
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1 border-b-[3px] border-ink px-2 py-1.5">
        <IconBtn label="New file" onClick={() => create("file")}><FilePlus2 className="size-4" /></IconBtn>
        <IconBtn label="New folder" onClick={() => create("folder")}><FolderPlus className="size-4" /></IconBtn>
        <IconBtn label="Upload files" onClick={() => uploadRef.current?.click()}><Upload className="size-4" /></IconBtn>
        <IconBtn label="Refresh" onClick={() => void refresh()}><RefreshCw className={cn("size-4", loading && "animate-spin")} /></IconBtn>
        <IconBtn label={showDotfiles ? "Hide dotfiles" : "Show dotfiles"} onClick={() => updateSettings({ showDotfiles: !showDotfiles })}>
          {showDotfiles ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </IconBtn>
        <input ref={uploadRef} type="file" multiple hidden onChange={(e) => e.target.files && void upload(e.target.files).finally(() => (e.target.value = ""))} />
        {busy && (
          <span className="ml-auto flex items-center gap-1 font-mono text-[10px] font-bold uppercase text-ink/60">
            <Loader2 className="size-3 animate-spin" /> {busy}
          </span>
        )}
      </div>

      {/* Breadcrumbs */}
      <div className="flex items-center gap-0.5 overflow-x-auto border-b-[3px] border-ink bg-paper-sunk px-2 py-1 font-mono text-xs">
        <button type="button" className="rounded p-1 hover:bg-white" onClick={() => setCwd(HOME)} title="Home" aria-label="Home folder">
          <Home className="size-3.5" />
        </button>
        <button type="button" className="rounded p-1 hover:bg-white disabled:opacity-30" onClick={() => setCwd(dirname(cwd))} disabled={cwd === "/"} title="Up" aria-label="Parent folder">
          <ArrowUp className="size-3.5" />
        </button>
        <span className="text-ink/40">/</span>
        {crumbs.map((c, i) => {
          const path = "/" + crumbs.slice(0, i + 1).join("/");
          return (
            <span key={path} className="flex items-center">
              <button
                type="button"
                className="rounded px-1 font-bold hover:bg-white"
                onClick={() => setCwd(path)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  const from = e.dataTransfer.getData("text/x-vm-path");
                  if (from) {
                    e.preventDefault();
                    e.stopPropagation();
                    void move(from, path);
                  }
                }}
              >
                {c}
              </button>
              {i < crumbs.length - 1 && <span className="text-ink/40">/</span>}
            </span>
          );
        })}
      </div>

      {error && (
        <div className="flex items-start gap-2 border-b-[3px] border-ink bg-coral/20 px-3 py-2 text-xs">
          <span className="flex-1">{error}</span>
          <button type="button" onClick={() => setError(null)} aria-label="Dismiss"><X className="size-3.5" /></button>
        </div>
      )}

      {/* Listing */}
      <div className="min-h-0 flex-1 overflow-y-auto" role="grid" aria-label={`Files in ${cwd}`}>
        <div className="sticky top-0 grid grid-cols-[1fr_64px_64px] gap-2 border-b-2 border-ink/15 bg-white px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-ink/50">
          <span>Name</span>
          <span className="text-right">Size</span>
          <span className="text-right">Modified</span>
        </div>
        {visible.length === 0 && !loading && <p className="px-3 py-6 text-center text-xs text-ink/50">Empty folder. Drop files here to upload.</p>}
        {visible.map((entry) => {
          const dir = isDirLike(entry);
          return (
            <div
              key={entry.path}
              role="row"
              tabIndex={0}
              draggable
              onDragStart={(e) => e.dataTransfer.setData("text/x-vm-path", entry.path)}
              onDragOver={(e) => {
                if (dir && e.dataTransfer.types.includes("text/x-vm-path")) e.preventDefault();
              }}
              onDrop={(e) => {
                const from = e.dataTransfer.getData("text/x-vm-path");
                if (dir && from && from !== entry.path) {
                  e.preventDefault();
                  e.stopPropagation();
                  void move(from, entry.path);
                }
              }}
              onClick={() => setSelected(entry.path)}
              onDoubleClick={() => void open(entry)}
              onKeyDown={(e) => onRowKey(e, entry)}
              className={cn(
                "group grid cursor-default grid-cols-[1fr_64px_64px] items-center gap-2 border-b border-ink/10 px-3 py-1.5 text-sm outline-none focus:bg-sky/20",
                selected === entry.path && "bg-sky/25",
              )}
            >
              <span className="flex min-w-0 items-center gap-2">
                {entry.type === "symlink" ? <Link2 className="size-4 shrink-0" /> : dir ? <Folder className="size-4 shrink-0 fill-yellow" /> : <File className="size-4 shrink-0" />}
                <span className="truncate">{entry.name}</span>
                <span className="ml-auto hidden shrink-0 gap-0.5 group-hover:flex group-focus:flex">
                  <RowBtn label="Rename (F2)" onClick={() => void rename(entry)}><Pencil className="size-3.5" /></RowBtn>
                  <RowBtn label="Download" onClick={() => void download(entry)}><Download className="size-3.5" /></RowBtn>
                  <RowBtn label="Delete" onClick={() => void remove(entry)}><Trash2 className="size-3.5" /></RowBtn>
                </span>
              </span>
              <span className="text-right font-mono text-[11px] text-ink/60 tabular-nums">{dir ? "—" : formatSize(entry.size)}</span>
              <span className="text-right font-mono text-[11px] text-ink/60">{formatTime(entry.mtime)}</span>
            </div>
          );
        })}
      </div>

      {editing && (
        <EditorDialog
          path={editing.path}
          initial={editing.content}
          onClose={() => setEditing(null)}
          onSave={async (content) => {
            if (!fs) return;
            await fs.write(editing.path, content);
            bumpFs();
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" title={label} aria-label={label} onClick={onClick} className="rounded-lg border-2 border-transparent p-1.5 hover:border-ink hover:bg-white">
      {children}
    </button>
  );
}

function RowBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="rounded p-1 hover:bg-white"
    >
      {children}
    </button>
  );
}

function EditorDialog({ path, initial, onSave, onClose }: { path: string; initial: string; onSave: (content: string) => Promise<void>; onClose: () => void }) {
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = value !== initial;

  async function save() {
    setSaving(true);
    try {
      await onSave(value);
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/60 p-4" role="dialog" aria-modal="true" aria-label={`Edit ${path}`}>
      <div className="flex h-[80vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border-4 border-ink bg-white shadow-brut-lg">
        <div className="flex items-center gap-3 border-b-4 border-ink px-4 py-2.5">
          <File className="size-4" />
          <span className="truncate font-mono text-sm font-bold">{path}</span>
          {dirty && <span className="chip bg-yellow text-[10px]">unsaved</span>}
          <button type="button" className="ml-auto rounded p-1 hover:bg-paper-sunk" onClick={() => (!dirty || confirm("Discard changes?")) && onClose()} aria-label="Close">
            <X className="size-5" />
          </button>
        </div>
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "s") {
              e.preventDefault();
              void save();
            }
            if (e.key === "Tab") {
              e.preventDefault();
              const t = e.currentTarget;
              const { selectionStart: s, selectionEnd: en } = t;
              setValue(value.slice(0, s) + "  " + value.slice(en));
              requestAnimationFrame(() => (t.selectionStart = t.selectionEnd = s + 2));
            }
          }}
          spellCheck={false}
          autoFocus
          className="min-h-0 flex-1 resize-none bg-ink p-4 font-mono text-[13px] leading-relaxed text-paper outline-none"
        />
        <div className="flex items-center gap-3 border-t-4 border-ink px-4 py-3">
          {error && <span className="text-sm text-coral">{error}</span>}
          <span className="font-mono text-[11px] text-ink/50">Ctrl+S to save</span>
          <button type="button" className="btn btn-secondary btn-sm ml-auto" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={saving || !dirty}>
            {saving && <Loader2 className="size-4 animate-spin" />} Save
          </button>
        </div>
      </div>
    </div>
  );
}
