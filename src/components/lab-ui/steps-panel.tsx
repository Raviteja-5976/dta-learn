"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, ChevronDown, Circle, Flag, Lightbulb, Loader2, Play, SkipForward, Trophy, XCircle } from "lucide-react";
import { Markdown } from "@/components/markdown";
import { api } from "@/lib/api-client";
import type { TerminalCheckPayload, TerminalPayload } from "@/lib/labs/server";
import type { ExecResult } from "@/lib/terminal-sandbox";
import { useSandbox } from "./store";
import { cn } from "@/lib/utils";

type CheckState = { passed: boolean; message?: string };
type Step = TerminalPayload["steps"][number];

interface EvaluationResponse {
  stepsPassed: string[];
  labCompleted: boolean;
  certificateCode: string | null;
}

/** script.custom may print {"passed": bool, "message": str}; others use the exit status. */
function interpret(check: TerminalCheckPayload, res: ExecResult): CheckState {
  if (check.type === "script.custom") {
    const last = res.stdout.trim().split("\n").pop() ?? "";
    try {
      const parsed = JSON.parse(last) as { passed?: unknown; message?: unknown };
      if (typeof parsed.passed === "boolean") return { passed: parsed.passed, message: typeof parsed.message === "string" ? parsed.message : undefined };
    } catch {
      /* fall through */
    }
  }
  if (res.status === 124) return { passed: false, message: "The check timed out." };
  return { passed: res.status === 0, message: res.status === 0 ? undefined : check.fail };
}

export function StepsPanel({
  payload,
  backHref,
  nextHref,
  onCompleted,
}: {
  payload: TerminalPayload;
  backHref: string | null;
  nextHref: string | null;
  onCompleted?: () => void;
}) {
  const status = useSandbox((s) => s.status);
  const exec = useSandbox((s) => s.exec);
  const type = useSandbox((s) => s.typeInTerminal);
  const reset = useSandbox((s) => s.reset);
  const settleToken = useSandbox((s) => s.settleToken);
  const initPending = useSandbox((s) => s.initPending);
  const running = status === "running";

  const [stepsPassed, setStepsPassed] = useState<string[]>(payload.stepsPassed);
  const [results, setResults] = useState<Record<string, Record<string, CheckState>>>({});
  const [checking, setChecking] = useState<string | null>(null);
  const [hints, setHints] = useState<Record<string, string[]>>(payload.hints);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [labDone, setLabDone] = useState(payload.status === "completed");
  const [error, setError] = useState<string | null>(null);
  const graded = useMemo(() => payload.steps.filter((s) => s.checks.length > 0), [payload.steps]);
  const activeStep = payload.steps.find((s) => s.checks.length > 0 && !stepsPassed.includes(s.id)) ?? null;
  const [open, setOpen] = useState<string | null>(activeStep?.id ?? payload.steps[0]?.id ?? null);
  const checkingRef = useRef(false);

  async function report(step: Step, states: Record<string, CheckState>, silent: boolean) {
    const list = step.checks
      .filter((c) => c.script)
      .map((c) => ({ stepId: step.id, checkId: c.id, passed: states[c.id]?.passed ?? false, details: states[c.id]?.message ? { message: states[c.id]?.message } : undefined }));
    if (!list.length) return;
    try {
      const res = await api<EvaluationResponse>(`/api/labs/attempts/${payload.attemptId}/results`, { body: { results: list } });
      setStepsPassed(res.stepsPassed);
      if (res.labCompleted && !labDone) {
        setLabDone(true);
        onCompleted?.();
      }
      if (res.stepsPassed.includes(step.id)) {
        const next = payload.steps.find((s) => s.checks.length > 0 && !res.stepsPassed.includes(s.id));
        if (next) setOpen(next.id);
      }
    } catch (e) {
      if (!silent) setError((e as Error).message);
    }
  }

  async function runChecks(step: Step, silent = false) {
    if (!running || checkingRef.current) return;
    const scripted = step.checks.filter((c) => c.script);
    if (!scripted.length) return;
    checkingRef.current = true;
    if (!silent) setChecking(step.id);
    setError(null);
    try {
      const states: Record<string, CheckState> = {};
      for (const c of scripted) {
        try {
          states[c.id] = interpret(c, await exec(c.script as string, { timeoutMs: 15_000 }));
        } catch (e) {
          states[c.id] = { passed: false, message: (e as Error).message };
        }
      }
      const prev = results[step.id] ?? {};
      setResults((r) => ({ ...r, [step.id]: { ...r[step.id], ...states } }));
      const allPass = scripted.every((c) => states[c.id].passed);
      const changed = scripted.some((c) => prev[c.id]?.passed !== states[c.id].passed);
      // Explicit checks always report; watch checks report only when something newly passes.
      if (!silent || (changed && allPass)) await report(step, states, silent);
    } finally {
      checkingRef.current = false;
      setChecking(null);
    }
  }

  // Live "watch" checks: after the terminal settles, re-check the active step quietly.
  useEffect(() => {
    if (settleToken > 0 && activeStep && running) void runChecks(activeStep, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settleToken]);

  async function submitAnswer(step: Step, check: TerminalCheckPayload) {
    const answer = answers[`${step.id}:${check.id}`]?.trim();
    if (!answer) return;
    setChecking(step.id);
    setError(null);
    try {
      const res = await api<EvaluationResponse & { passed: boolean; message: string }>(`/api/labs/attempts/${payload.attemptId}/answer`, {
        body: { stepId: step.id, checkId: check.id, answer },
      });
      setResults((r) => ({ ...r, [step.id]: { ...r[step.id], [check.id]: { passed: res.passed, message: res.message } } }));
      setStepsPassed(res.stepsPassed);
      if (res.labCompleted && !labDone) {
        setLabDone(true);
        onCompleted?.();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setChecking(null);
    }
  }

  async function revealHint(step: Step) {
    try {
      const res = await api<{ hints: string[] }>(`/api/labs/attempts/${payload.attemptId}/hint`, { body: { stepId: step.id } });
      setHints((h) => ({ ...h, [step.id]: res.hints }));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function skipTo(step: Step) {
    if (!confirm(`Restart the sandbox and fast-forward to “${step.title}”? Your current files will be lost.`)) return;
    try {
      const { scripts } = await api<{ scripts: { stepId: string; script: string }[] }>(`/api/labs/attempts/${payload.attemptId}/reset`, { body: { toStep: step.id } });
      setOpen(step.id);
      await reset({
        afterBoot: async (session) => {
          for (const s of scripts) await session.adapter.exec(s.script).catch(() => undefined);
        },
      });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="space-y-3 p-3">
      <div className="flex items-center justify-between px-1">
        <p className="eyebrow">
          {stepsPassed.filter((id) => graded.some((g) => g.id === id)).length}/{graded.length} steps passed
        </p>
        {initPending && (
          <span className="flex items-center gap-1 font-mono text-[10px] font-bold uppercase text-ink/60">
            <Loader2 className="size-3 animate-spin" /> Adding files…
          </span>
        )}
      </div>

      {labDone && (
        <div className="space-y-3 rounded-2xl border-[3px] border-ink bg-mint/50 p-4">
          <p className="flex items-center gap-2 font-display text-lg font-bold">
            <Trophy className="size-5" /> Lab complete!
          </p>
          <p className="text-sm text-ink/75">Every step passed. Your progress is saved.</p>
          <div className="flex flex-wrap gap-2">
            {nextHref && <a href={nextHref} className="btn btn-primary btn-sm">Next lesson</a>}
            {backHref && <a href={backHref} className="btn btn-secondary btn-sm">Back to course</a>}
          </div>
        </div>
      )}

      {error && <p className="rounded-xl border-[3px] border-ink bg-coral/20 px-3 py-2 text-xs">{error}</p>}

      {payload.steps.map((step, i) => {
        const passed = stepsPassed.includes(step.id);
        const expanded = open === step.id;
        const stepResults = results[step.id] ?? {};
        const shownHints = hints[step.id] ?? [];
        return (
          <section key={step.id} className={cn("overflow-hidden rounded-2xl border-[3px] border-ink bg-white", step.id === activeStep?.id && "shadow-brut-xs")}>
            <button type="button" onClick={() => setOpen(expanded ? null : step.id)} className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left hover:bg-paper-sunk/60" aria-expanded={expanded}>
              {passed ? <CheckCircle2 className="size-5 shrink-0" aria-label="Passed" /> : step.checks.length ? <Circle className="size-5 shrink-0 text-ink/30" /> : <Flag className="size-5 shrink-0 text-ink/40" />}
              <span className="font-mono text-[11px] font-bold text-ink/50">{String(i + 1).padStart(2, "0")}</span>
              <span className="min-w-0 flex-1 text-sm font-bold">{step.title}</span>
              <ChevronDown className={cn("size-4 shrink-0 transition-transform", expanded && "rotate-180")} />
            </button>

            {expanded && (
              <div className="space-y-4 border-t-[3px] border-ink px-3 py-3">
                {step.instructions && <Markdown compact>{step.instructions}</Markdown>}

                {step.cmds.length > 0 && (
                  <div className="space-y-1.5">
                    {step.cmds.map((cmd) => (
                      <div key={cmd} className="flex items-center gap-2 rounded-xl border-[3px] border-ink bg-ink px-2 py-1.5">
                        <code className="min-w-0 flex-1 truncate font-mono text-xs text-paper">{cmd}</code>
                        <button type="button" disabled={!running} onClick={() => type(cmd, true)} className="flex items-center gap-1 rounded-lg border-2 border-paper bg-sky px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-ink disabled:opacity-40" title="Type this command and press Enter">
                          <Play className="size-3" /> Run
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {step.checks.length > 0 && (
                  <div className="space-y-2">
                    <p className="eyebrow">Checks</p>
                    <ul className="space-y-1.5">
                      {step.checks.map((c) => {
                        const r = stepResults[c.id];
                        if (c.challenge) {
                          const key = `${step.id}:${c.id}`;
                          return (
                            <li key={c.id} className="space-y-2 rounded-xl border-[3px] border-ink bg-yellow/30 p-3">
                              <Markdown compact>{c.challenge.prompt}</Markdown>
                              <form
                                className="flex gap-2"
                                onSubmit={(e) => {
                                  e.preventDefault();
                                  void submitAnswer(step, c);
                                }}
                              >
                                <input
                                  className="input-brut input-sm font-mono"
                                  placeholder={c.challenge.answerHint || "Your answer"}
                                  value={answers[key] ?? ""}
                                  onChange={(e) => setAnswers((a) => ({ ...a, [key]: e.target.value }))}
                                  aria-label="Challenge answer"
                                />
                                <button type="submit" className="btn btn-primary btn-sm" disabled={checking === step.id || passed}>
                                  Submit
                                </button>
                              </form>
                              {r && <p className={cn("text-xs font-semibold", r.passed ? "text-ink" : "text-[#C2183A]")}>{r.message}</p>}
                              {passed && !r && <p className="text-xs font-semibold">Answered correctly.</p>}
                              <p className="font-mono text-[10px] uppercase tracking-wider text-ink/50">Verified on the server</p>
                            </li>
                          );
                        }
                        const ok = r?.passed ?? (passed ? true : undefined);
                        return (
                          <li key={c.id} className="flex items-start gap-2 text-sm">
                            {ok === true ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> : ok === false ? <XCircle className="mt-0.5 size-4 shrink-0 text-[#C2183A]" /> : <Circle className="mt-0.5 size-4 shrink-0 text-ink/30" />}
                            <span className="min-w-0">
                              <span>{c.label}</span>
                              {r && !r.passed && r.message && <span className="block text-xs text-ink/70">{r.message}</span>}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                    {step.checks.some((c) => c.script) && (
                      <button type="button" className="btn btn-primary btn-sm" onClick={() => void runChecks(step)} disabled={!running || checking !== null}>
                        {checking === step.id ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />} Check my work
                      </button>
                    )}
                  </div>
                )}

                {(step.hintCount > 0 || i > 0) && (
                  <div className="space-y-2">
                    {shownHints.map((h, hi) => (
                      <div key={hi} className="rounded-xl border-[3px] border-ink bg-yellow/40 p-2.5">
                        <p className="eyebrow mb-1">Hint {hi + 1}</p>
                        <Markdown compact>{h}</Markdown>
                      </div>
                    ))}
                    <div className="flex flex-wrap gap-2">
                      {shownHints.length < step.hintCount && (
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => void revealHint(step)}>
                          <Lightbulb className="size-4" /> Hint ({shownHints.length}/{step.hintCount})
                        </button>
                      )}
                      {i > 0 && !passed && (
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => void skipTo(step)} disabled={status === "booting"} title="Relaunch and replay earlier steps automatically">
                          <SkipForward className="size-4" /> Reset to this step
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        );
      })}
      <p className="px-1 text-[11px] text-ink/50">Checks run inside your browser, so terminal steps count as self-verified progress.</p>
    </div>
  );
}
