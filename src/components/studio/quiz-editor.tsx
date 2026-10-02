"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Loader2, Plus, Save, Trash2, X } from "lucide-react";
import { Alert, Field, Input, Textarea } from "@/components/ui";
import { useAction } from "./use-action";
import { saveQuiz, type QuizInput } from "@/app/(app)/studio/actions";
import type { QuestionType } from "@/lib/types";

export interface EditableQuestion {
  id?: string;
  type: QuestionType;
  prompt: string;
  code: string;
  code_language: string;
  options: { id: string; text: string }[];
  points: number;
  correct: string[];
  accepted: string[];
  caseSensitive: boolean;
  explanation: string;
}

export interface EditableQuiz {
  pass_score: number;
  shuffle_questions: boolean;
  max_attempts: number | null;
  show_answers: boolean;
  questions: EditableQuestion[];
}

const optionId = () => Math.random().toString(36).slice(2, 8);

function blankQuestion(type: QuestionType = "single"): EditableQuestion {
  return {
    type,
    prompt: "",
    code: "",
    code_language: "",
    options: type === "single" || type === "multiple" ? [{ id: optionId(), text: "" }, { id: optionId(), text: "" }] : [],
    points: 1,
    correct: [],
    accepted: [],
    caseSensitive: false,
    explanation: "",
  };
}

const TYPE_LABEL: Record<QuestionType, string> = {
  single: "Single choice",
  multiple: "Multiple choice",
  text: "Short answer",
  code_output: "What does this code print?",
};

export function QuizEditor({ itemId, initial }: { itemId: string; initial: EditableQuiz }) {
  const { run, pending, error } = useAction();
  const [quiz, setQuiz] = useState<EditableQuiz>(initial);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);

  const patchQuiz = (p: Partial<EditableQuiz>) => {
    setQuiz((q) => ({ ...q, ...p }));
    setDirty(true);
    setSaved(false);
  };
  const patchQ = (i: number, p: Partial<EditableQuestion>) =>
    patchQuiz({ questions: quiz.questions.map((q, j) => (j === i ? { ...q, ...p } : q)) });
  const moveQ = (i: number, d: -1 | 1) => {
    const qs = [...quiz.questions];
    const j = i + d;
    if (j < 0 || j >= qs.length) return;
    [qs[i], qs[j]] = [qs[j], qs[i]];
    patchQuiz({ questions: qs });
  };

  const save = () => {
    const payload: QuizInput = {
      pass_score: quiz.pass_score,
      shuffle_questions: quiz.shuffle_questions,
      max_attempts: quiz.max_attempts,
      show_answers: quiz.show_answers,
      questions: quiz.questions.map((q) => ({
        id: q.id,
        type: q.type,
        prompt: q.prompt,
        code: q.code || null,
        code_language: q.code_language || null,
        options: q.options,
        points: q.points,
        correct: q.correct,
        accepted: q.accepted,
        caseSensitive: q.caseSensitive,
        explanation: q.explanation || null,
      })),
    };
    run(() => saveQuiz(itemId, payload), {
      onSuccess: () => {
        setDirty(false);
        setSaved(true);
      },
    });
  };

  return (
    <div className="space-y-5">
      <div className="sticky top-[72px] z-20 flex flex-wrap items-center gap-3 rounded-2xl border-4 border-ink bg-white px-4 py-2.5 shadow-brut-sm">
        <span className="font-display font-bold">Quiz · {quiz.questions.length} questions</span>
        {dirty && <span className="chip bg-yellow text-[10px]">unsaved</span>}
        {saved && <span className="text-sm font-semibold">Saved ✓</span>}
        <button type="button" className="btn btn-primary btn-sm ml-auto" onClick={save} disabled={pending || !dirty}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Save quiz
        </button>
      </div>
      {error && <Alert tone="danger">{error}</Alert>}

      <div className="card-brut grid gap-4 p-5 md:grid-cols-4">
        <Field label="Pass score %" htmlFor="pass">
          <Input id="pass" type="number" min={0} max={100} value={quiz.pass_score} onChange={(e) => patchQuiz({ pass_score: Number(e.target.value) })} />
        </Field>
        <Field label="Max attempts" htmlFor="attempts" hint="Empty = unlimited">
          <Input id="attempts" type="number" min={1} value={quiz.max_attempts ?? ""} onChange={(e) => patchQuiz({ max_attempts: e.target.value ? Number(e.target.value) : null })} />
        </Field>
        <label className="flex items-center gap-2 self-center text-sm font-semibold">
          <input type="checkbox" checked={quiz.shuffle_questions} onChange={(e) => patchQuiz({ shuffle_questions: e.target.checked })} className="size-4 accent-[#1B1F3B]" /> Shuffle questions
        </label>
        <label className="flex items-center gap-2 self-center text-sm font-semibold">
          <input type="checkbox" checked={quiz.show_answers} onChange={(e) => patchQuiz({ show_answers: e.target.checked })} className="size-4 accent-[#1B1F3B]" /> Show answers after submit
        </label>
      </div>

      {quiz.questions.map((q, i) => (
        <div key={q.id ?? `new-${i}`} className="card-brut overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b-[3px] border-ink bg-paper-sunk px-4 py-2">
            <span className="grid size-7 place-items-center rounded-md border-[3px] border-ink bg-yellow font-mono text-xs font-bold">{i + 1}</span>
            <select
              value={q.type}
              onChange={(e) => {
                const type = e.target.value as QuestionType;
                const choice = type === "single" || type === "multiple";
                patchQ(i, {
                  type,
                  options: choice ? (q.options.length ? q.options : blankQuestion(type).options) : [],
                  correct: type === "single" ? q.correct.slice(0, 1) : q.correct,
                });
              }}
              className="rounded-lg border-2 border-ink bg-white px-2 py-1 text-sm font-semibold"
              aria-label="Question type"
            >
              {(Object.keys(TYPE_LABEL) as QuestionType[]).map((t) => (
                <option key={t} value={t}>{TYPE_LABEL[t]}</option>
              ))}
            </select>
            <label className="flex items-center gap-1.5 text-xs font-semibold">
              Points
              <input type="number" min={1} max={100} value={q.points} onChange={(e) => patchQ(i, { points: Math.max(1, Number(e.target.value)) })} className="w-14 rounded-md border-2 border-ink px-1.5 py-0.5" />
            </label>
            <div className="ml-auto flex">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => moveQ(i, -1)} disabled={i === 0} aria-label="Move up"><ArrowUp className="size-4" /></button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => moveQ(i, 1)} disabled={i === quiz.questions.length - 1} aria-label="Move down"><ArrowDown className="size-4" /></button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => patchQuiz({ questions: quiz.questions.filter((_, j) => j !== i) })} aria-label="Delete question"><Trash2 className="size-4" /></button>
            </div>
          </div>
          <div className="space-y-4 p-4">
            <Field label="Prompt (Markdown)" htmlFor={`q${i}-prompt`}>
              <Textarea id={`q${i}-prompt`} rows={3} value={q.prompt} onChange={(e) => patchQ(i, { prompt: e.target.value })} />
            </Field>
            {(q.type === "code_output" || q.code) && (
              <div className="grid gap-3 md:grid-cols-[160px_1fr]">
                <Field label="Code language" htmlFor={`q${i}-lang`}>
                  <Input id={`q${i}-lang`} value={q.code_language} onChange={(e) => patchQ(i, { code_language: e.target.value })} placeholder="python" className="font-mono" />
                </Field>
                <Field label="Code snippet" htmlFor={`q${i}-code`}>
                  <Textarea id={`q${i}-code`} rows={4} value={q.code} onChange={(e) => patchQ(i, { code: e.target.value })} className="font-mono text-[13px]" spellCheck={false} />
                </Field>
              </div>
            )}

            {(q.type === "single" || q.type === "multiple") && (
              <div className="space-y-2">
                <span className="label-brut">Options — mark the correct {q.type === "single" ? "one" : "ones"}</span>
                {q.options.map((o, oi) => (
                  <div key={o.id} className="flex items-center gap-2">
                    <input
                      type={q.type === "single" ? "radio" : "checkbox"}
                      name={`correct-${i}`}
                      checked={q.correct.includes(o.id)}
                      onChange={(e) =>
                        patchQ(i, {
                          correct: q.type === "single" ? [o.id] : e.target.checked ? [...q.correct, o.id] : q.correct.filter((c) => c !== o.id),
                        })
                      }
                      className="size-4 accent-[#1B1F3B]"
                      aria-label={`Option ${oi + 1} is correct`}
                    />
                    <Input
                      value={o.text}
                      onChange={(e) => patchQ(i, { options: q.options.map((x) => (x.id === o.id ? { ...x, text: e.target.value } : x)) })}
                      placeholder={`Option ${oi + 1}`}
                      className="input-sm"
                    />
                    <button
                      type="button"
                      className="rounded p-1 hover:bg-paper-sunk disabled:opacity-30"
                      disabled={q.options.length <= 2}
                      onClick={() => patchQ(i, { options: q.options.filter((x) => x.id !== o.id), correct: q.correct.filter((c) => c !== o.id) })}
                      aria-label="Remove option"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                ))}
                {q.options.length < 10 && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => patchQ(i, { options: [...q.options, { id: optionId(), text: "" }] })}>
                    <Plus className="size-4" /> Add option
                  </button>
                )}
                {!q.code && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => patchQ(i, { code: "\n" })}>
                    <Plus className="size-4" /> Add code snippet
                  </button>
                )}
              </div>
            )}

            {(q.type === "text" || q.type === "code_output") && (
              <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                <Field label="Accepted answers" htmlFor={`q${i}-acc`} hint="One per line. Spacing is normalised.">
                  <Textarea id={`q${i}-acc`} rows={3} value={q.accepted.join("\n")} onChange={(e) => patchQ(i, { accepted: e.target.value.split("\n") })} className="font-mono text-[13px]" />
                </Field>
                <label className="flex items-center gap-2 self-center text-sm font-semibold">
                  <input type="checkbox" checked={q.caseSensitive} onChange={(e) => patchQ(i, { caseSensitive: e.target.checked })} className="size-4 accent-[#1B1F3B]" /> Case sensitive
                </label>
              </div>
            )}

            <Field label="Explanation (shown after submitting)" htmlFor={`q${i}-exp`}>
              <Textarea id={`q${i}-exp`} rows={2} value={q.explanation} onChange={(e) => patchQ(i, { explanation: e.target.value })} />
            </Field>
          </div>
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-2 rounded-3xl border-4 border-dashed border-ink/40 p-4">
        <span className="eyebrow mr-2">Add question</span>
        {(Object.keys(TYPE_LABEL) as QuestionType[]).map((t) => (
          <button key={t} type="button" className="btn btn-secondary btn-sm" onClick={() => patchQuiz({ questions: [...quiz.questions, blankQuestion(t)] })}>
            <Plus className="size-4" /> {TYPE_LABEL[t]}
          </button>
        ))}
      </div>
    </div>
  );
}
