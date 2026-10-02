"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, Loader2, RotateCcw, XCircle } from "lucide-react";
import { Markdown } from "@/components/markdown";
import { Alert, Chip } from "@/components/ui";
import { api } from "@/lib/api-client";
import type { Question } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface QuizResultEntry {
  correct: boolean;
  correctOptionIds?: string[];
  accepted?: string[];
  explanation?: string | null;
}

export interface QuizSubmitResponse {
  score: number;
  passed: boolean;
  passScore: number;
  results: Record<string, QuizResultEntry>;
  answers: Record<string, string[]>;
  attemptsLeft: number | null;
  courseCompleted: boolean;
  certificateCode: string | null;
}

export function QuizPlayer({
  itemId,
  questions,
  passScore,
  attemptsLeft: initialAttemptsLeft,
  bestScore,
  previous,
  nextHref,
}: {
  itemId: string;
  questions: Question[];
  passScore: number;
  attemptsLeft: number | null;
  bestScore: number | null;
  previous: QuizSubmitResponse | null;
  nextHref: string | null;
}) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, string[]>>(previous?.answers ?? {});
  const [result, setResult] = useState<QuizSubmitResponse | null>(previous);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attemptsLeft, setAttemptsLeft] = useState(initialAttemptsLeft);

  const answeredCount = useMemo(() => questions.filter((q) => (answers[q.id] ?? []).some((a) => a.trim() !== "")).length, [answers, questions]);
  const locked = Boolean(result);

  function setSingle(qid: string, value: string) {
    setAnswers((a) => ({ ...a, [qid]: [value] }));
  }
  function toggleMulti(qid: string, value: string) {
    setAnswers((a) => {
      const cur = new Set(a[qid] ?? []);
      if (cur.has(value)) cur.delete(value);
      else cur.add(value);
      return { ...a, [qid]: [...cur] };
    });
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await api<QuizSubmitResponse>(`/api/quizzes/${itemId}/submit`, { body: { answers } });
      setResult(res);
      setAttemptsLeft(res.attemptsLeft);
      window.scrollTo({ top: 0, behavior: "smooth" });
      if (res.certificateCode) router.push(`/verify/${res.certificateCode}?new=1`);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function retake() {
    setResult(null);
    setAnswers({});
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="space-y-8">
      {result ? (
        <div className={cn("flex flex-col gap-4 rounded-3xl border-4 border-ink p-6 shadow-brut-sm sm:flex-row sm:items-center", result.passed ? "bg-mint/50" : "bg-coral/25")}>
          <div className="flex-1">
            <p className="eyebrow">{result.passed ? "Passed" : "Not quite"}</p>
            <p className="font-display text-4xl font-extrabold tabular-nums">{Math.round(result.score)}%</p>
            <p className="text-sm text-ink/75">You need {result.passScore}% to pass.{attemptsLeft !== null ? ` ${attemptsLeft} attempt${attemptsLeft === 1 ? "" : "s"} left.` : ""}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            {(attemptsLeft === null || attemptsLeft > 0) && (
              <button type="button" className="btn btn-secondary" onClick={retake}>
                <RotateCcw className="size-4" /> Retake
              </button>
            )}
            {result.passed && nextHref && (
              <button type="button" className="btn btn-primary" onClick={() => router.push(nextHref)}>
                Next <ArrowRight className="size-4" />
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Chip tone="yellow">Pass: {passScore}%</Chip>
          <Chip>{questions.length} questions</Chip>
          {bestScore !== null && <Chip tone="mint">Best: {Math.round(bestScore)}%</Chip>}
          {attemptsLeft !== null && <Chip tone={attemptsLeft > 0 ? "default" : "coral"}>{attemptsLeft} attempts left</Chip>}
        </div>
      )}

      <ol className="space-y-6">
        {questions.map((q, qi) => {
          const r = result?.results[q.id];
          const chosen = answers[q.id] ?? [];
          return (
            <li key={q.id} className={cn("card-brut space-y-4 p-6", r && (r.correct ? "!bg-mint/20" : "!bg-coral/10"))}>
              <div className="flex items-start gap-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg border-[3px] border-ink bg-yellow font-mono text-sm font-bold">{qi + 1}</span>
                <div className="min-w-0 flex-1 space-y-3">
                  <Markdown compact>{q.prompt}</Markdown>
                  {q.code && <Markdown compact>{"```" + (q.code_language ?? "") + "\n" + q.code + "\n```"}</Markdown>}
                  {q.type === "multiple" && !locked && <p className="eyebrow">Select all that apply</p>}
                </div>
                {r && (r.correct ? <CheckCircle2 className="size-6 shrink-0" aria-label="Correct" /> : <XCircle className="size-6 shrink-0 text-coral" aria-label="Incorrect" />)}
              </div>

              {(q.type === "single" || q.type === "multiple") && (
                <div className="grid gap-2.5">
                  {q.options.map((o) => {
                    const selected = chosen.includes(o.id);
                    const isCorrect = r?.correctOptionIds?.includes(o.id);
                    return (
                      <label
                        key={o.id}
                        className={cn(
                          "flex cursor-pointer items-start gap-3 rounded-2xl border-[3px] border-ink bg-white px-4 py-3 transition-transform",
                          !locked && "hover:-translate-y-0.5",
                          selected && !r && "bg-brand/30 shadow-brut-xs",
                          r && isCorrect && "bg-mint/60",
                          r && selected && !isCorrect && "bg-coral/30",
                          locked && "cursor-default",
                        )}
                      >
                        <input
                          type={q.type === "single" ? "radio" : "checkbox"}
                          name={q.id}
                          className="mt-1 size-4 accent-[#1B1F3B]"
                          checked={selected}
                          disabled={locked}
                          onChange={() => (q.type === "single" ? setSingle(q.id, o.id) : toggleMulti(q.id, o.id))}
                        />
                        <span className="min-w-0 flex-1 text-sm">
                          <Markdown compact className="[&_p]:m-0">{o.text}</Markdown>
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}

              {(q.type === "text" || q.type === "code_output") && (
                <div className="space-y-2">
                  <input
                    className={cn("input-brut", q.type === "code_output" && "font-mono")}
                    placeholder={q.type === "code_output" ? "What does this print?" : "Your answer"}
                    value={chosen[0] ?? ""}
                    disabled={locked}
                    onChange={(e) => setSingle(q.id, e.target.value)}
                    aria-label={`Answer for question ${qi + 1}`}
                  />
                  {r && !r.correct && r.accepted && (
                    <p className="text-sm">
                      Accepted answer: <code className="rounded border-2 border-ink bg-paper-sunk px-1.5 font-mono">{r.accepted[0]}</code>
                    </p>
                  )}
                </div>
              )}

              {r?.explanation && (
                <div className="rounded-2xl border-[3px] border-ink bg-paper-sunk p-4">
                  <p className="eyebrow mb-1">Why</p>
                  <Markdown compact>{r.explanation}</Markdown>
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {!result && (
        <div className="flex flex-col items-end gap-3">
          {error && <Alert tone="danger">{error}</Alert>}
          <button type="button" className="btn btn-primary btn-lg" onClick={submit} disabled={busy || answeredCount === 0 || attemptsLeft === 0}>
            {busy && <Loader2 className="size-5 animate-spin" />} Submit answers ({answeredCount}/{questions.length})
          </button>
        </div>
      )}
    </div>
  );
}
