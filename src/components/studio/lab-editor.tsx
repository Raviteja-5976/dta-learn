"use client";

import Editor from "@monaco-editor/react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, History, Loader2, Rocket, Trash2, XCircle } from "lucide-react";
import { Alert, Chip } from "@/components/ui";
import { isCompileSpec, parseLabYaml, type LabSpec } from "@/lib/labs/spec";
import { useAction } from "./use-action";
import { deleteLab, saveLabVersion, setLabVersion } from "@/app/(app)/studio/actions";
import { cn, relativeTime } from "@/lib/utils";

interface VersionRow {
  id: string;
  version: number;
  created_at: string;
  spec_yaml: string;
}

const TERMINAL_CHECKS = [
  "file.exists { path }",
  "dir.exists { path }",
  "file.contains { path, pattern, fixed? }",
  "file.equals { path, content }",
  "file.mode { path, mode: '+x' | '755' }",
  "git.branch_exists { repo, branch }",
  "git.current_branch { repo, branch }",
  "git.commit_count { repo, ref?, base?, min?, max? }",
  "git.commit_message_matches { repo, ref?, pattern }",
  "git.merged { repo, branch, into? }",
  "git.no_conflict_markers { repo }",
  "git.clean_worktree { repo }",
  "git.remote_has { repo, remote?, branch }",
  "command.exit_code { run, code? }",
  "command.output_matches { run, pattern }",
  "process.running { name }",
  "sql.result_equals { db, query, expected }",
  "sql.row_count { db, table, equals?, min? }",
  "shell.ran { pattern }",
  "script.custom { script }  # print {\"passed\":bool,\"message\":str}",
  "challenge.answer { generator: failed-logins | top-ip }",
];

const COMPILE_CHECKS = [
  "program.io { compare?, prelude?, cases: [{ name, stdin, stdout, hidden? }] }",
  "sql.result_equals { compare?, prelude?, cases }  # language: sqlite",
  "compare: { trim: none|lines|all, ordered, caseSensitive, floatTolerance? }",
];

export function LabEditor({
  labId,
  runtime,
  currentVersionId,
  versions,
  isAdmin,
  usedBy,
}: {
  labId: string;
  runtime: "terminal" | "compile";
  currentVersionId: string | null;
  versions: VersionRow[];
  isAdmin: boolean;
  usedBy: { itemId: string; title: string; courseSlug: string }[];
}) {
  const router = useRouter();
  const current = versions.find((v) => v.id === currentVersionId) ?? versions[0];
  const [yaml, setYaml] = useState(current?.spec_yaml ?? "");
  const [debounced, setDebounced] = useState(yaml);
  const [fontFamily, setFontFamily] = useState("ui-monospace, monospace");
  const { run, pending, error, errors } = useAction();
  const [savedVersion, setSavedVersion] = useState<number | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(yaml), 300);
    return () => clearTimeout(t);
  }, [yaml]);

  useEffect(() => {
    const family = getComputedStyle(document.documentElement).getPropertyValue("--font-jetbrains-mono").trim();
    if (family) setFontFamily(`${family}, ui-monospace, monospace`);
  }, []);

  const result = useMemo(() => parseLabYaml(debounced), [debounced]);
  const dirty = yaml !== (current?.spec_yaml ?? "");

  const save = () =>
    run(() => saveLabVersion(labId, yaml), {
      onSuccess: (d) => setSavedVersion(d?.version ?? null),
    });

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border-4 border-ink bg-white px-4 py-2.5 shadow-brut-sm">
          {result.ok ? (
            <Chip tone="mint"><CheckCircle2 className="size-3.5" /> Valid spec</Chip>
          ) : (
            <Chip tone="coral"><XCircle className="size-3.5" /> {result.errors.length} error{result.errors.length === 1 ? "" : "s"}</Chip>
          )}
          {dirty && <span className="chip bg-yellow text-[10px]">unsaved</span>}
          {savedVersion && !dirty && <span className="text-sm font-semibold">Published v{savedVersion} ✓</span>}
          <button type="button" className="btn btn-primary btn-sm ml-auto" onClick={save} disabled={pending || !dirty || !result.ok}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Rocket className="size-4" />} Publish new version
          </button>
        </div>
        {error && (
          <Alert tone="danger" title={error}>
            {errors.length > 0 && (
              <ul className="list-disc pl-5">
                {errors.map((e) => (
                  <li key={e} className="font-mono text-xs">{e}</li>
                ))}
              </ul>
            )}
          </Alert>
        )}
        <div className="h-[70vh] overflow-hidden rounded-3xl border-4 border-ink shadow-brut-sm">
          <Editor
            language="yaml"
            value={yaml}
            onChange={(v) => setYaml(v ?? "")}
            theme="vs-dark"
            options={{ fontFamily, fontSize: 13, minimap: { enabled: false }, tabSize: 2, scrollBeyondLastLine: false, automaticLayout: true, wordWrap: "on" }}
          />
        </div>
        {!result.ok && (
          <div className="card-brut space-y-2 p-4">
            <p className="eyebrow">Validation</p>
            <ul className="space-y-1">
              {result.errors.map((e) => (
                <li key={e} className="font-mono text-xs text-[#C2183A]">{e}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <aside className="space-y-5">
        {result.ok && <SpecPreview spec={result.spec} />}

        <div className="card-brut space-y-3 p-5">
          <p className="eyebrow flex items-center gap-1.5"><History className="size-3.5" /> Versions</p>
          <p className="text-xs text-ink/60">Published versions are immutable. Attempts keep the version they started on.</p>
          <ul className="max-h-64 space-y-1.5 overflow-y-auto">
            {versions.map((v) => (
              <li key={v.id} className={cn("flex items-center gap-2 rounded-xl border-[3px] px-2.5 py-1.5 text-sm", v.id === currentVersionId ? "border-ink bg-mint/40" : "border-transparent")}>
                <span className="font-mono font-bold">v{v.version}</span>
                <span className="text-xs text-ink/60">{relativeTime(v.created_at)}</span>
                <span className="ml-auto flex gap-1">
                  <button type="button" className="text-xs font-semibold underline" onClick={() => setYaml(v.spec_yaml)}>Load</button>
                  {v.id !== currentVersionId && (
                    <button type="button" className="text-xs font-semibold underline" onClick={() => run(() => setLabVersion(labId, v.id))}>Make current</button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {usedBy.length > 0 && (
          <div className="card-brut space-y-2 p-5">
            <p className="eyebrow">Used in</p>
            {usedBy.map((u) => (
              <a key={u.itemId} href={`/learn/${u.courseSlug}/${u.itemId}`} target="_blank" rel="noreferrer" className="block text-sm font-semibold underline">
                {u.title}
              </a>
            ))}
            <p className="text-xs text-ink/60">Open as a learner to test the latest version end to end.</p>
          </div>
        )}

        <details className="card-brut p-5" open>
          <summary className="eyebrow cursor-pointer">{runtime === "terminal" ? "Terminal" : "Compile"} check types</summary>
          <ul className="mt-3 space-y-1">
            {(runtime === "terminal" ? TERMINAL_CHECKS : COMPILE_CHECKS).map((c) => (
              <li key={c} className="font-mono text-[11px] leading-snug">{c}</li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-ink/60">Every check accepts optional <code>id</code>, <code>title</code> and <code>fail</code> (message on failure). Paths may start with <code>~/</code>.</p>
        </details>

        {isAdmin && (
          <button
            type="button"
            className="btn btn-danger btn-sm w-full"
            onClick={() => {
              if (confirm("Delete this lab, all its versions and every learner attempt on it? Items using it will be detached.")) {
                run(() => deleteLab(labId), { onSuccess: () => router.push("/studio/labs"), refresh: false });
              }
            }}
          >
            <Trash2 className="size-4" /> Delete lab
          </button>
        )}
      </aside>
    </div>
  );
}

function SpecPreview({ spec }: { spec: LabSpec }) {
  return (
    <div className="card-brut space-y-3 p-5">
      <p className="eyebrow">Preview</p>
      <p className="font-display text-lg font-bold">{spec.metadata.title}</p>
      <div className="flex flex-wrap gap-1.5">
        <Chip tone="sky">{spec.runtime.type}</Chip>
        <Chip>{spec.runtime.type === "terminal" ? spec.runtime.image : spec.runtime.language}</Chip>
        <Chip tone="sunk">{spec.metadata.difficulty}</Chip>
      </div>
      <ol className="space-y-1.5 text-sm">
        {spec.steps.map((s, i) => (
          <li key={s.id} className="flex gap-2">
            <span className="font-mono text-xs font-bold text-ink/50">{i + 1}.</span>
            <span className="min-w-0 flex-1">{s.title}</span>
            <span className="font-mono text-[11px] text-ink/60">{s.checks.length} chk · {s.hints.length} hint</span>
          </li>
        ))}
      </ol>
      {isCompileSpec(spec) && (
        <p className="font-mono text-[11px] text-ink/60">
          files: {spec.files.map((f) => `${f.path}${f.editable ? "" : " (ro)"}`).join(", ")}
        </p>
      )}
    </div>
  );
}
