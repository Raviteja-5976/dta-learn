"use client";

import Editor, { type BeforeMount, type OnMount } from "@monaco-editor/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  EyeOff,
  FileCode2,
  FlaskConical,
  Lightbulb,
  Loader2,
  Lock,
  Play,
  RotateCcw,
  XCircle,
} from "lucide-react";
import { Markdown } from "@/components/markdown";
import { TutorChat, type TutorContext } from "@/components/ai/tutor-chat";
import { Alert, Chip } from "@/components/ui";
import { api, ApiError } from "@/lib/api-client";
import type { CompilePayload } from "@/lib/labs/server";
import type { CheckResponse, RunResponse, CaseResult } from "@/lib/compile/service";
import { cn } from "@/lib/utils";

type LabFile = CompilePayload["files"][number];
type OutputTab = "stdout" | "stderr" | "compile" | "tests";

const VERDICT_LABEL: Record<string, string> = {
  accepted: "Accepted",
  wrong_answer: "Wrong answer",
  time_limit: "Time limit exceeded",
  compile_error: "Compilation error",
  runtime_error: "Runtime error",
  internal_error: "Platform error",
};

const draftKey = (attemptId: string) => `lab-draft:${attemptId}`;

function readLocalDraft(attemptId: string): { files: { path: string; content: string }[]; synced: boolean } | null {
  try {
    const raw = localStorage.getItem(draftKey(attemptId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeLocalDraft(attemptId: string, files: LabFile[], synced: boolean) {
  try {
    localStorage.setItem(draftKey(attemptId), JSON.stringify({ files: files.filter((f) => f.editable).map(({ path, content }) => ({ path, content })), synced }));
  } catch {
    /* storage full or blocked: the server autosave still runs */
  }
}

const defineTheme: BeforeMount = (monaco) => {
  monaco.editor.defineTheme("dta-ink", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "comment", foreground: "8F96C8", fontStyle: "italic" },
      { token: "keyword", foreground: "FF5C7A" },
      { token: "string", foreground: "6EE7B7" },
      { token: "number", foreground: "FFC93C" },
      { token: "type", foreground: "FFB38F" },
      { token: "function", foreground: "4EA8FF" },
    ],
    colors: {
      "editor.background": "#1B1F3B",
      "editor.lineHighlightBackground": "#24294A",
      "editorLineNumber.foreground": "#6B7099",
      "editorLineNumber.activeForeground": "#FFF8F0",
      "editorCursor.foreground": "#4EA8FF",
      "editor.selectionBackground": "#4EA8FF55",
      "editorIndentGuide.background1": "#2E3460",
    },
  });
};

/** Plain-text summary of a Check for the tutor. Hidden cases are named only. */
function summarizeCheck(res: CheckResponse): string {
  if (res.platformError) return "Platform error while grading (not the learner's fault).";
  const lines = [`${res.cases.filter((c) => c.passed).length}/${res.cases.length} tests passed.`];
  for (const c of res.cases.filter((x) => !x.passed).slice(0, 4)) {
    if (c.hidden) lines.push(`Hidden test "${c.name}" failed: ${VERDICT_LABEL[c.verdict] ?? c.verdict}.`);
    else {
      lines.push(
        [
          `Test "${c.name}" failed: ${VERDICT_LABEL[c.verdict] ?? c.verdict}.`,
          `stdin:\n${c.stdin ?? ""}`,
          `expected:\n${c.expected ?? ""}`,
          `got:\n${c.actual ?? ""}`,
          c.stderr ? `stderr:\n${c.stderr}` : "",
          c.compileOutput ? `compiler:\n${c.compileOutput}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      );
    }
  }
  return lines.join("\n");
}

export function CompileLab({ payload, nextHref, tutorItemId }: { payload: CompilePayload; nextHref: string | null; tutorItemId?: string | null }) {
  const router = useRouter();
  const [files, setFiles] = useState<LabFile[]>(payload.files);
  const [activePath, setActivePath] = useState(() => (payload.files.find((f) => f.main) ?? payload.files[0]).path);
  const [stdin, setStdin] = useState(payload.steps[0]?.publicCases[0]?.stdin ?? "");
  const [run, setRun] = useState<RunResponse | null>(null);
  const [tab, setTab] = useState<OutputTab>("stdout");
  const [busy, setBusy] = useState<"run" | "check" | "reset" | null>(null);
  const [stepIdx, setStepIdx] = useState(() => {
    const i = payload.steps.findIndex((s) => !payload.stepsPassed.includes(s.id));
    return i < 0 ? 0 : i;
  });
  const [stepsPassed, setStepsPassed] = useState<string[]>(payload.stepsPassed);
  const [checks, setChecks] = useState<Record<string, CheckResponse>>({});
  const [hints, setHints] = useState<Record<string, string[]>>(payload.hints);
  const [notice, setNotice] = useState<{ tone: "danger" | "warning" | "success"; text: string } | null>(null);
  const [labDone, setLabDone] = useState(payload.status === "completed");
  const [fontFamily, setFontFamily] = useState("ui-monospace, monospace");
  const [tutorOpen, setTutorOpen] = useState(false);

  const dirtyRef = useRef(false);
  const filesRef = useRef(files);
  filesRef.current = files;

  const step = payload.steps[stepIdx];
  const activeFile = files.find((f) => f.path === activePath) ?? files[0];

  // Restore unsynced local edits (a refresh never loses work).
  useEffect(() => {
    const local = readLocalDraft(payload.attemptId);
    if (local && !local.synced) {
      const byPath = new Map(local.files.map((f) => [f.path, f.content]));
      setFiles((cur) => cur.map((f) => (f.editable && byPath.has(f.path) ? { ...f, content: byPath.get(f.path) as string } : f)));
      dirtyRef.current = true;
    }
    const family = getComputedStyle(document.documentElement).getPropertyValue("--font-jetbrains-mono").trim();
    if (family) setFontFamily(`${family}, ui-monospace, monospace`);
  }, [payload.attemptId]);

  // Server autosave every 5 s while dirty.
  useEffect(() => {
    const timer = setInterval(async () => {
      if (!dirtyRef.current) return;
      dirtyRef.current = false;
      try {
        await api(`/api/labs/attempts/${payload.attemptId}/draft`, {
          method: "PUT",
          body: { files: filesRef.current.filter((f) => f.editable).map(({ path, content }) => ({ path, content })) },
        });
        writeLocalDraft(payload.attemptId, filesRef.current, true);
      } catch {
        dirtyRef.current = true;
      }
    }, 5000);
    return () => clearInterval(timer);
  }, [payload.attemptId]);

  const onChange = (value: string | undefined) => {
    if (!activeFile?.editable) return;
    setFiles((cur) => {
      const next = cur.map((f) => (f.path === activeFile.path ? { ...f, content: value ?? "" } : f));
      writeLocalDraft(payload.attemptId, next, false);
      return next;
    });
    dirtyRef.current = true;
  };

  const submittedFiles = () => filesRef.current.map(({ path, content }) => ({ path, content }));

  const handleError = (e: unknown) => {
    if (e instanceof ApiError && e.status === 429) setNotice({ tone: "warning", text: e.message });
    else setNotice({ tone: "danger", text: (e as Error).message });
  };

  const doRun = useCallback(async () => {
    if (busy) return;
    setBusy("run");
    setNotice(null);
    try {
      const res = await api<RunResponse>(`/api/labs/attempts/${payload.attemptId}/run`, { body: { files: submittedFiles(), stdin } });
      setRun(res);
      setTab(res.verdict === "compile_error" ? "compile" : res.stderr && !res.stdout ? "stderr" : "stdout");
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, stdin, payload.attemptId]);

  const doCheck = useCallback(async () => {
    if (busy || !step) return;
    setBusy("check");
    setNotice(null);
    try {
      const res = await api<CheckResponse>(`/api/labs/attempts/${payload.attemptId}/check`, { body: { stepId: step.id, files: submittedFiles() } });
      setChecks((c) => ({ ...c, [step.id]: res }));
      setTab("tests");
      writeLocalDraft(payload.attemptId, filesRef.current, true);
      if (res.platformError) {
        setNotice({ tone: "warning", text: "Platform error while grading — this attempt was not counted. Please try again." });
        return;
      }
      setStepsPassed(res.stepsPassed);
      if (res.labCompleted) {
        setLabDone(true);
        setNotice({ tone: "success", text: "Lab complete! Every step passed on the server." });
        if (res.certificateCode) router.push(`/verify/${res.certificateCode}?new=1`);
        router.refresh();
      } else if (res.passed && stepIdx < payload.steps.length - 1) {
        setNotice({ tone: "success", text: "Step passed. On to the next one." });
        setStepIdx((i) => i + 1);
      }
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, step, stepIdx, payload.attemptId]);

  // Ctrl/Cmd+Enter runs, Ctrl/Cmd+Shift+Enter checks (design §5.7).
  const runRef = useRef(doRun);
  const checkRef = useRef(doCheck);
  runRef.current = doRun;
  checkRef.current = doCheck;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        if (e.shiftKey) void checkRef.current();
        else void runRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const onMount: OnMount = (editor, monaco) => {
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => void runRef.current());
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Enter, () => void checkRef.current());
  };

  async function revealHint() {
    if (!step) return;
    try {
      const res = await api<{ hints: string[] }>(`/api/labs/attempts/${payload.attemptId}/hint`, { body: { stepId: step.id } });
      setHints((h) => ({ ...h, [step.id]: res.hints }));
    } catch (e) {
      handleError(e);
    }
  }

  async function resetFiles() {
    if (!confirm("Reset all files to the starter code? Your changes will be lost.")) return;
    setBusy("reset");
    try {
      const res = await api<{ files: LabFile[] }>(`/api/labs/attempts/${payload.attemptId}/reset`, { body: {} });
      setFiles(res.files);
      writeLocalDraft(payload.attemptId, res.files, true);
      dirtyRef.current = false;
      setRun(null);
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(null);
    }
  }

  const stepCheck = step ? checks[step.id] : undefined;

  // What Glitch sees when the learner asks: this step, their files, the last Run and Check.
  const tutorContext = (): TutorContext => ({
    stepId: step?.id,
    files: filesRef.current.filter((f) => f.editable).map(({ path, content }) => ({ path, content })),
    run: run ? { verdict: run.verdict, stdout: run.stdout, stderr: run.stderr, compileOutput: run.compileOutput } : undefined,
    check: stepCheck ? summarizeCheck(stepCheck) : undefined,
  });
  const hintsShown = step ? hints[step.id] ?? [] : [];
  const gradedCount = payload.steps.length;

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:h-[calc(100dvh-72px)] lg:flex-none">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 border-b-4 border-ink bg-white px-4 py-3">
        <FlaskConical className="size-5" />
        <h1 className="font-display text-lg font-bold">{payload.lab.title}</h1>
        <Chip tone="yellow">{payload.language.label}</Chip>
        <Chip tone={labDone ? "mint" : "default"}>
          {stepsPassed.length}/{gradedCount} steps
        </Chip>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {tutorItemId && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setTutorOpen((o) => !o)} aria-pressed={tutorOpen} title="Ask Glitch, the AI tutor">
              <Bot className="size-4" /> Ask Glitch
            </button>
          )}
          <button type="button" className="btn btn-ghost btn-sm" onClick={resetFiles} disabled={!!busy} title="Reset files to the starter code">
            <RotateCcw className="size-4" /> Reset
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={doRun} disabled={!!busy} title="Run (Ctrl/Cmd+Enter)">
            {busy === "run" ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />} Run
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={doCheck} disabled={!!busy} title="Check (Ctrl/Cmd+Shift+Enter)">
            {busy === "check" ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />} Check
          </button>
          {labDone && nextHref && (
            <button type="button" className="btn btn-dark btn-sm" onClick={() => router.push(nextHref)}>
              Next <ArrowRight className="size-4" />
            </button>
          )}
        </div>
      </div>

      {notice && (
        <div className="border-b-4 border-ink">
          <Alert tone={notice.tone} className="!rounded-none !border-0">{notice.text}</Alert>
        </div>
      )}

      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(320px,38%)_1fr] lg:grid-rows-1 lg:overflow-hidden">
        {/* Instructions */}
        <section className="min-h-0 overflow-y-auto border-b-4 border-ink bg-paper lg:border-b-0 lg:border-r-4">
          <div className="flex items-center gap-1 overflow-x-auto border-b-4 border-ink bg-paper-sunk px-3 py-2">
            {payload.steps.map((s, i) => {
              const ok = stepsPassed.includes(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setStepIdx(i)}
                  className={cn("flex items-center gap-1.5 whitespace-nowrap rounded-lg border-[3px] px-2.5 py-1 text-xs font-bold", i === stepIdx ? "border-ink bg-white shadow-brut-xs" : "border-transparent hover:bg-white/60")}
                >
                  {ok ? <CheckCircle2 className="size-3.5" /> : <Circle className="size-3.5 text-ink/40" />} Step {i + 1}
                </button>
              );
            })}
          </div>
          {step && (
            <div className="space-y-6 p-5">
              <div className="space-y-2">
                <p className="eyebrow">Step {stepIdx + 1} of {payload.steps.length}</p>
                <h2 className="font-display text-2xl font-bold">{step.title}</h2>
              </div>
              <Markdown compact>{step.instructions}</Markdown>

              {step.publicCases.length > 0 && (
                <div className="space-y-3">
                  <p className="eyebrow">Examples</p>
                  {step.publicCases.map((c) => (
                    <div key={c.name} className="overflow-hidden rounded-2xl border-[3px] border-ink bg-white">
                      <div className="flex items-center justify-between border-b-[3px] border-ink bg-paper-sunk px-3 py-1.5">
                        <span className="font-mono text-xs font-bold">{c.name}</span>
                        <button type="button" className="font-mono text-[11px] font-bold uppercase underline" onClick={() => setStdin(c.stdin)}>
                          Use as stdin
                        </button>
                      </div>
                      <div className="grid grid-cols-2 divide-x-[3px] divide-ink">
                        <IoBlock label="Input" text={c.stdin} />
                        <IoBlock label="Expected output" text={c.stdout} />
                      </div>
                    </div>
                  ))}
                  {step.hiddenCount > 0 && (
                    <p className="flex items-center gap-1.5 text-xs text-ink/60">
                      <EyeOff className="size-3.5" /> Plus {step.hiddenCount} hidden test{step.hiddenCount === 1 ? "" : "s"} run on Check.
                    </p>
                  )}
                </div>
              )}

              {step.hintCount > 0 && (
                <div className="space-y-3">
                  {hintsShown.map((h, i) => (
                    <div key={i} className="rounded-2xl border-[3px] border-ink bg-yellow/40 p-3">
                      <p className="eyebrow mb-1">Hint {i + 1}</p>
                      <Markdown compact>{h}</Markdown>
                    </div>
                  ))}
                  {hintsShown.length < step.hintCount && (
                    <button type="button" className="btn btn-secondary btn-sm" onClick={revealHint}>
                      <Lightbulb className="size-4" /> {hintsShown.length ? "Another hint" : "Show a hint"} ({hintsShown.length}/{step.hintCount})
                    </button>
                  )}
                </div>
              )}

              <div className="flex justify-between">
                <button type="button" className="btn btn-ghost btn-sm" disabled={stepIdx === 0} onClick={() => setStepIdx((i) => i - 1)}>
                  <ChevronLeft className="size-4" /> Previous
                </button>
                <button type="button" className="btn btn-ghost btn-sm" disabled={stepIdx >= payload.steps.length - 1} onClick={() => setStepIdx((i) => i + 1)}>
                  Next step <ChevronRight className="size-4" />
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Editor + output */}
        <section className="flex min-h-0 flex-col">
          <div className="flex items-center gap-1 overflow-x-auto border-b-4 border-ink bg-ink px-2 pt-2">
            {files.map((f) => (
              <button
                key={f.path}
                type="button"
                onClick={() => setActivePath(f.path)}
                className={cn(
                  "flex items-center gap-1.5 rounded-t-lg border-[3px] border-b-0 px-3 py-1.5 font-mono text-xs font-bold",
                  f.path === activePath ? "border-paper bg-[#24294A] text-paper" : "border-transparent text-paper/60 hover:text-paper",
                )}
              >
                {f.editable ? <FileCode2 className="size-3.5" /> : <Lock className="size-3.5" />} {f.path}
              </button>
            ))}
          </div>
          <div className="h-[50vh] min-h-0 flex-1 bg-ink lg:h-auto">
            {activeFile && (
              <Editor
                key={activeFile.path}
                path={activeFile.path}
                language={payload.language.monaco}
                value={activeFile.content}
                theme="dta-ink"
                beforeMount={defineTheme}
                onMount={onMount}
                onChange={onChange}
                loading={<div className="grid h-full place-items-center text-paper/60"><Loader2 className="size-6 animate-spin" /></div>}
                options={{
                  readOnly: !activeFile.editable,
                  fontFamily,
                  fontSize: 14,
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                  tabSize: 4,
                  padding: { top: 12 },
                  renderLineHighlight: "line",
                }}
              />
            )}
          </div>

          {/* Output panel */}
          <div className="flex h-[300px] shrink-0 flex-col border-t-4 border-ink bg-white">
            <div className="flex items-center gap-1 border-b-[3px] border-ink bg-paper-sunk px-2 py-1.5">
              {(["stdout", "stderr", "compile", "tests"] as OutputTab[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={cn("rounded-lg border-[3px] px-2.5 py-0.5 font-mono text-[11px] font-bold uppercase", tab === t ? "border-ink bg-white" : "border-transparent hover:bg-white/60")}
                >
                  {t === "compile" ? "compiler" : t}
                  {t === "stderr" && run?.stderr ? " •" : ""}
                  {t === "tests" && stepCheck ? (stepCheck.passed ? " ✓" : " ✗") : ""}
                </button>
              ))}
              {run && tab !== "tests" && (
                <span className="ml-auto truncate font-mono text-[11px] text-ink/60">
                  {VERDICT_LABEL[run.verdict]} · exit {run.exitCode ?? "—"} · {run.timeMs} ms · {Math.round(run.memoryKiB / 1024)} MiB{run.cached ? " · cached" : ""}
                </span>
              )}
            </div>
            <div className="grid min-h-0 flex-1 md:grid-cols-[1fr_240px]">
              <div className="min-h-0 overflow-auto p-3">
                {tab === "tests" ? (
                  <TestResults result={stepCheck} />
                ) : (
                  <pre className={cn("whitespace-pre-wrap break-words font-mono text-[13px]", tab === "stderr" && "text-[#C2183A]")}>
                    {run ? (tab === "stdout" ? run.stdout : tab === "stderr" ? run.stderr : run.compileOutput) || <span className="text-ink/40">(empty)</span> : <span className="text-ink/40">Press Run (Ctrl/Cmd+Enter) to execute your code with the stdin on the right.</span>}
                  </pre>
                )}
              </div>
              <div className="flex min-h-0 flex-col border-t-[3px] border-ink md:border-l-[3px] md:border-t-0">
                <label htmlFor="stdin" className="border-b-[3px] border-ink bg-paper-sunk px-3 py-1 font-mono text-[11px] font-bold uppercase">stdin</label>
                <textarea
                  id="stdin"
                  value={stdin}
                  onChange={(e) => setStdin(e.target.value)}
                  spellCheck={false}
                  className="min-h-0 flex-1 resize-none bg-paper-sunk/40 p-3 font-mono text-[13px] outline-none focus:bg-white"
                  placeholder="Input passed to your program"
                />
              </div>
            </div>
          </div>
        </section>
      </div>
      {tutorItemId && <TutorChat itemId={tutorItemId} kind="lab" trigger="none" open={tutorOpen} onOpenChange={setTutorOpen} getContext={tutorContext} />}
    </div>
  );
}

function IoBlock({ label, text }: { label: string; text: string }) {
  return (
    <div className="min-w-0">
      <p className="px-3 pt-2 font-mono text-[10px] font-bold uppercase tracking-wider text-ink/50">{label}</p>
      <pre className="overflow-x-auto px-3 pb-2 font-mono text-xs">{text || " "}</pre>
    </div>
  );
}

function TestResults({ result }: { result?: CheckResponse }) {
  if (!result) return <p className="text-sm text-ink/50">Press Check (Ctrl/Cmd+Shift+Enter) to run the tests for this step.</p>;
  if (result.platformError) return <p className="text-sm">Platform error — not counted. Try again.</p>;
  const firstFailPublic = result.cases.find((c) => !c.passed && !c.hidden);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {result.cases.map((c) => (
          <span key={c.name} className={cn("chip", c.passed ? "bg-mint" : "bg-coral !text-white")} title={VERDICT_LABEL[c.verdict]}>
            {c.passed ? <CheckCircle2 className="size-3" /> : <XCircle className="size-3" />}
            {c.name}
            {c.hidden && <EyeOff className="size-3" />}
          </span>
        ))}
      </div>
      <p className="text-sm font-semibold">
        {result.cases.filter((c) => c.passed).length}/{result.cases.length} tests passed
        {result.cases.some((c) => !c.passed) && ` — first failure: ${VERDICT_LABEL[result.cases.find((c) => !c.passed)!.verdict]}`}
      </p>
      {firstFailPublic && <CaseDiff c={firstFailPublic} />}
    </div>
  );
}

function CaseDiff({ c }: { c: CaseResult }) {
  if (c.verdict === "compile_error") {
    return <pre className="whitespace-pre-wrap rounded-xl border-[3px] border-ink bg-paper-sunk p-3 font-mono text-xs">{c.compileOutput}</pre>;
  }
  const expectedLines = (c.expected ?? "").split("\n");
  const actualLines = (c.actual ?? "").split("\n");
  const diffLine = (c.firstDiffLine ?? 0) - 1;
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <IoPanel label={`Input · ${c.name}`} lines={(c.stdin ?? "").split("\n")} />
      <IoPanel label="Expected" lines={expectedLines} mark={diffLine} />
      <IoPanel label="Your output" lines={actualLines} mark={diffLine} bad />
      {c.stderr && (
        <pre className="whitespace-pre-wrap rounded-xl border-[3px] border-ink bg-coral/15 p-3 font-mono text-xs md:col-span-3">{c.stderr}</pre>
      )}
    </div>
  );
}

function IoPanel({ label, lines, mark, bad }: { label: string; lines: string[]; mark?: number; bad?: boolean }) {
  return (
    <div className="overflow-hidden rounded-xl border-[3px] border-ink">
      <p className="border-b-[3px] border-ink bg-paper-sunk px-2 py-1 font-mono text-[10px] font-bold uppercase">{label}</p>
      <pre className="max-h-40 overflow-auto p-2 font-mono text-xs">
        {lines.map((l, i) => (
          <div key={i} className={cn(i === mark && (bad ? "bg-coral/30" : "bg-mint/40"))}>
            {l || " "}
          </div>
        ))}
      </pre>
    </div>
  );
}
