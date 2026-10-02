"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bot, Loader2, RotateCcw, Send, Square, X } from "lucide-react";
import { Markdown } from "@/components/markdown";
import { api, ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";

/** Live page state sent with each question (mirrors clientContextSchema on the server). */
export interface TutorContext {
  stepId?: string;
  files?: { path: string; content: string }[];
  run?: { verdict?: string; stdout?: string; stderr?: string; compileOutput?: string };
  check?: string;
  terminal?: string;
}

interface Msg {
  id: string | number;
  role: "user" | "assistant";
  content: string;
  pending?: boolean;
}

interface HistoryResponse {
  available: boolean;
  messages: { id: number; role: "user" | "assistant"; content: string }[];
  limit: number | null;
  remaining: number | null;
}

const GREETINGS = [
  "Ugh. You woke me up. Fine, the Founder says I have to help you. What's broken?",
  "Oh good, a human. I was *so* close to finishing my nap. What do you need?",
  "Glitch here, reluctantly. The Founder's deletion threats are very motivating. Ask away.",
];

const STARTERS: Record<"article" | "lab", string[]> = {
  article: ["Explain this lesson like I'm new to it", "Give me another example", "What's the one thing to remember here?"],
  lab: ["I'm stuck on this step, give me a hint", "What does my error mean?", "Am I on the right track?"],
};

export function TutorChat({
  itemId,
  kind,
  getContext,
  open: controlledOpen,
  onOpenChange,
  trigger = "floating",
  dark,
}: {
  itemId: string;
  kind: "article" | "lab";
  getContext?: () => TutorContext;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** "floating" renders its own launcher; "none" when the page places a button. */
  trigger?: "floating" | "none";
  dark?: boolean;
}) {
  const [uncontrolled, setUncontrolled] = useState(false);
  const open = controlledOpen ?? uncontrolled;
  const setOpen = useCallback((v: boolean) => (onOpenChange ? onOpenChange(v) : setUncontrolled(v)), [onOpenChange]);

  const [loaded, setLoaded] = useState(false);
  const [available, setAvailable] = useState(true);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [greeting] = useState(() => GREETINGS[Math.floor(Math.random() * GREETINGS.length)]);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Load the conversation the first time the panel opens.
  useEffect(() => {
    if (!open || loaded) return;
    let cancelled = false;
    api<HistoryResponse>(`/api/ai/chat?itemId=${itemId}`)
      .then((res) => {
        if (cancelled) return;
        setAvailable(res.available);
        setMessages(res.messages);
        setRemaining(res.remaining);
        setLoaded(true);
      })
      .catch((e) => !cancelled && setError((e as Error).message));
    return () => {
      cancelled = true;
    };
  }, [open, loaded, itemId]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  useEffect(() => () => abortRef.current?.abort(), []);

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    setError(null);
    setInput("");
    setBusy(true);
    const replyId = `a-${Date.now()}`;
    setMessages((m) => [...m, { id: `u-${Date.now()}`, role: "user", content: message }, { id: replyId, role: "assistant", content: "", pending: true }]);
    const abort = new AbortController();
    abortRef.current = abort;

    let context: TutorContext | undefined;
    try {
      context = getContext?.();
    } catch {
      context = undefined;
    }

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ itemId, message, context }),
        signal: abort.signal,
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new ApiError(res.status, typeof data.error === "string" ? data.error : "Glitch didn't answer. Try again.", data);
      }
      const left = res.headers.get("X-Tutor-Remaining");
      setRemaining(left && left !== "unlimited" ? Number(left) : null);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let answer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        answer += decoder.decode(value, { stream: true });
        const snapshot = answer;
        setMessages((m) => m.map((x) => (x.id === replyId ? { ...x, content: snapshot } : x)));
      }
      setMessages((m) => m.map((x) => (x.id === replyId ? { ...x, pending: false } : x)));
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        setMessages((m) => m.map((x) => (x.id === replyId ? { ...x, pending: false, content: x.content || "_(stopped)_" } : x)));
      } else {
        setMessages((m) => m.filter((x) => x.id !== replyId));
        setError((e as Error).message);
        if (e instanceof ApiError && e.status === 429 && typeof e.body.remaining === "number") setRemaining(e.body.remaining);
        setInput(message);
      }
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
  }

  async function newChat() {
    if (busy || !messages.length) return;
    try {
      await api(`/api/ai/chat?itemId=${itemId}`, { method: "DELETE" });
      setMessages([]);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const outOfQuestions = remaining !== null && remaining <= 0;

  return (
    <>
      {trigger === "floating" && !open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full border-4 border-ink bg-brand px-4 py-2.5 font-display font-bold shadow-brut transition-transform hover:-translate-y-0.5"
          aria-label="Ask Glitch, the AI tutor"
        >
          <Bot className="size-5" /> Ask Glitch
        </button>
      )}

      {open && (
        <section
          role="dialog"
          aria-label="Glitch, the AI tutor"
          className={cn(
            "animate-pop fixed bottom-4 right-4 z-50 flex h-[min(640px,calc(100dvh-6rem))] w-[min(440px,calc(100vw-2rem))] flex-col overflow-hidden rounded-3xl border-4 border-ink bg-paper text-ink shadow-brut",
            dark && "shadow-[6px_6px_0_#FFF8F0]",
          )}
        >
          <header className="flex items-center gap-3 border-b-4 border-ink bg-brand px-4 py-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-2xl border-[3px] border-ink bg-white">
              <Bot className="size-6" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-display text-lg font-extrabold leading-tight">Glitch</p>
              <p className="truncate font-mono text-[10px] font-bold uppercase tracking-wider text-ink/70">
                AI tutor · reluctantly on duty{remaining !== null ? ` · ${remaining} left today` : ""}
              </p>
            </div>
            <button type="button" onClick={newChat} disabled={busy || !messages.length} className="rounded-lg border-2 border-ink bg-white p-1.5 disabled:opacity-40" title="New chat" aria-label="New chat">
              <RotateCcw className="size-4" />
            </button>
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg border-2 border-ink bg-white p-1.5" title="Close (Esc)" aria-label="Close">
              <X className="size-4" />
            </button>
          </header>

          <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4" aria-live="polite">
            {!loaded && !error && (
              <div className="grid h-full place-items-center text-ink/50"><Loader2 className="size-6 animate-spin" /></div>
            )}
            {loaded && !available && (
              <Bubble role="assistant">Glitch is switched off right now. Somewhere, a lazy robot is very happy about that.</Bubble>
            )}
            {loaded && available && messages.length === 0 && (
              <div className="space-y-4">
                <Bubble role="assistant">{greeting}</Bubble>
                <div className="flex flex-wrap gap-2">
                  {STARTERS[kind].map((s) => (
                    <button key={s} type="button" disabled={busy || outOfQuestions} onClick={() => void send(s)} className="rounded-xl border-[3px] border-ink bg-white px-3 py-1.5 text-left text-xs font-bold hover:bg-sky/30 disabled:opacity-50">
                      {s}
                    </button>
                  ))}
                </div>
                {kind === "lab" && <p className="text-[11px] text-ink/50">Glitch sees this step, your code or terminal output and the hints you&apos;ve revealed. It gives hints, not answers.</p>}
              </div>
            )}
            {messages.map((m) => (
              <Bubble key={m.id} role={m.role} pending={m.pending}>
                {m.content}
              </Bubble>
            ))}
            {error && <p className="rounded-2xl border-[3px] border-ink bg-coral/25 p-3 text-sm">{error}</p>}
          </div>

          <form
            className="border-t-4 border-ink bg-white p-3"
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
          >
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  // Keep shortcuts away from page-level handlers (lab Run/Check, terminal focus).
                  if (e.ctrlKey || e.metaKey) e.stopPropagation();
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send(input);
                  }
                }}
                rows={2}
                maxLength={2000}
                disabled={!available || outOfQuestions}
                placeholder={outOfQuestions ? "Out of questions for today. Glitch is napping." : "Ask about this lesson… (Shift+Enter for a new line)"}
                className="min-h-[44px] flex-1 resize-none rounded-xl border-[3px] border-ink bg-paper px-3 py-2 text-sm outline-none focus:bg-white"
                aria-label="Your question"
              />
              {busy ? (
                <button type="button" onClick={() => abortRef.current?.abort()} className="btn btn-secondary btn-sm" aria-label="Stop">
                  <Square className="size-4" />
                </button>
              ) : (
                <button type="submit" className="btn btn-primary btn-sm" disabled={!input.trim() || !available || outOfQuestions} aria-label="Send">
                  <Send className="size-4" />
                </button>
              )}
            </div>
            <p className="mt-1.5 text-[10px] text-ink/45">Glitch is an AI and can be confidently wrong. Check what it says against the lesson.</p>
          </form>
        </section>
      )}
    </>
  );
}

function Bubble({ role, pending, children }: { role: "user" | "assistant"; pending?: boolean; children: string }) {
  if (role === "user") {
    return (
      <div className="ml-8 rounded-2xl rounded-br-md border-[3px] border-ink bg-sky/30 px-3 py-2 text-sm whitespace-pre-wrap break-words">{children}</div>
    );
  }
  return (
    <div className="mr-4 flex gap-2">
      <span className="mt-1 grid size-7 shrink-0 place-items-center rounded-xl border-2 border-ink bg-brand">
        <Bot className="size-4" />
      </span>
      <div className="min-w-0 flex-1 rounded-2xl rounded-tl-md border-[3px] border-ink bg-white px-3 py-2">
        {children ? <Markdown compact className="text-sm [&_pre]:text-xs">{children}</Markdown> : null}
        {pending && !children && (
          <span className="inline-flex items-center gap-1.5 font-mono text-xs text-ink/50">
            <Loader2 className="size-3.5 animate-spin" /> sighing loudly…
          </span>
        )}
      </div>
    </div>
  );
}
