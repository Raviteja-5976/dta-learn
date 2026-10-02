"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, BookOpen, Bot, FolderTree, Keyboard, ListChecks, Loader2, Minus, Plus, Power, RotateCcw, Rocket, Square } from "lucide-react";
import {
  checkCapabilities,
  cleanupOrphans,
  destroySessionNow,
  isSmallScreen,
  makeSandboxConfig,
  prewarmEngine,
  type Capability,
} from "@/lib/terminal-sandbox";
import type { TerminalPayload } from "@/lib/labs/server";
import { cn } from "@/lib/utils";
import { BootOverlay } from "./boot-overlay";
import { CheatSheet } from "./cheat-sheet";
import { FileManager } from "./file-manager";
import { StepsPanel } from "./steps-panel";
import { TERMINAL_THEMES, TerminalPane, readTerminalTail } from "./terminal-pane";
import { TutorChat } from "@/components/ai/tutor-chat";
import { UnsupportedBrowser } from "./unsupported";
import { useSandbox, type SideTab, type TerminalTheme } from "./store";

const STATUS_PILL: Record<string, { label: string; tone: string }> = {
  idle: { label: "Idle", tone: "bg-paper-sunk" },
  booting: { label: "Booting", tone: "bg-yellow" },
  running: { label: "Running", tone: "bg-mint" },
  stopping: { label: "Stopping", tone: "bg-yellow" },
  stopped: { label: "Stopped", tone: "bg-paper-sunk" },
  error: { label: "Error", tone: "bg-coral" },
};

export interface TerminalLabAppProps {
  payload: TerminalPayload;
  engine: "cheerpx" | "mock";
  cheerpxVersion: string;
  backHref: string | null;
  nextHref: string | null;
  /** The course item, when the AI tutor is available for this lab. */
  tutorItemId: string | null;
}

export function TerminalLabApp({ payload, engine, cheerpxVersion, backHref, nextHref, tutorItemId }: TerminalLabAppProps) {
  const status = useSandbox((s) => s.status);
  const error = useSandbox((s) => s.error);
  const session = useSandbox((s) => s.session);
  const stopReason = useSandbox((s) => s.stopReason);
  const settings = useSandbox((s) => s.settings);
  const { configure, launch, stop, reset, focusTerminal, updateSettings } = useSandbox.getState();

  const [caps, setCaps] = useState<Capability[] | null>(null);
  const [smallScreen, setSmallScreen] = useState(false);
  const [dismissedSmall, setDismissedSmall] = useState(false);
  const [idleLeft, setIdleLeft] = useState<number | null>(null);
  const [tutorOpen, setTutorOpen] = useState(false);

  const sandbox = useMemo(
    () =>
      makeSandboxConfig({
        cheerpxVersion,
        imageUrl: payload.image.url,
        imageType: payload.image.type,
        idleTimeoutMinutes: payload.idleTimeoutMinutes,
        bootManifest: payload.image.bootManifest,
      }),
    [cheerpxVersion, payload.image, payload.idleTimeoutMinutes],
  );

  // Configure, check capabilities, sweep orphans, auto-launch.
  useEffect(() => {
    configure({
      sandbox,
      engine,
      shellRc: payload.shellRc,
      init: payload.init,
      attemptId: payload.attemptId,
      labId: payload.lab.id,
      imageLabel: `${payload.image.slug}:${payload.image.version}`,
    });
    const c = checkCapabilities();
    // The mock engine needs none of the browser features.
    const effective = engine === "mock" ? c.map((x) => ({ ...x, ok: true })) : c;
    setCaps(effective);
    setSmallScreen(isSmallScreen());
    void cleanupOrphans();
    if (effective.every((x) => x.ok)) void launch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tab closed or navigated away: destroy now; the next load sweeps leftovers.
  useEffect(() => {
    const onHide = (e: PageTransitionEvent) => {
      if (e.persisted) return;
      const s = useSandbox.getState().session;
      if (s) destroySessionNow(s);
    };
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      void useSandbox.getState().stop("navigate");
    };
  }, []);

  // Ctrl+` focuses the terminal from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && (e.key === "`" || e.code === "Backquote")) {
        e.preventDefault();
        focusTerminal();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusTerminal]);

  // Idle timeout with a 60 s warning (design §4.8). 0 disables.
  const lastInput = useRef(Date.now());
  useEffect(() => {
    const timeoutMs = sandbox.idleTimeoutMinutes * 60_000;
    if (!timeoutMs) return;
    const mark = () => {
      lastInput.current = Date.now();
    };
    const events = ["keydown", "pointerdown", "wheel"] as const;
    events.forEach((ev) => window.addEventListener(ev, mark, { passive: true }));
    const timer = setInterval(() => {
      if (useSandbox.getState().status !== "running") {
        setIdleLeft(null);
        return;
      }
      const left = timeoutMs - (Date.now() - lastInput.current);
      if (left <= 0) {
        setIdleLeft(null);
        void useSandbox.getState().stop("idle");
      } else setIdleLeft(left <= 60_000 ? Math.ceil(left / 1000) : null);
    }, 1000);
    return () => {
      events.forEach((ev) => window.removeEventListener(ev, mark));
      clearInterval(timer);
    };
  }, [sandbox.idleTimeoutMinutes]);

  useEffect(() => {
    if (status === "running") lastInput.current = Date.now();
  }, [status]);

  // Resizable side panel (240–640 px).
  const dragging = useRef(false);
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!dragging.current) return;
      updateSettings({ panelWidth: Math.min(640, Math.max(240, e.clientX)) });
    };
    const onUp = () => {
      dragging.current = false;
      document.body.style.cursor = "";
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [updateSettings]);

  if (caps && !caps.every((c) => c.ok)) return <UnsupportedBrowser capabilities={caps} backHref={backHref} />;

  const pill = STATUS_PILL[status];
  const warm = () => prewarmEngine(cheerpxVersion, payload.image.bootManifest);
  const tabs: { id: SideTab; label: string; icon: typeof ListChecks }[] = [
    { id: "steps", label: "Steps", icon: ListChecks },
    { id: "files", label: "Files", icon: FolderTree },
    { id: "cheatsheet", label: "Cheat sheet", icon: BookOpen },
  ];

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-paper">
      {/* Status bar */}
      <header className="flex flex-wrap items-center gap-3 border-b-4 border-ink bg-white px-3 py-2">
        {backHref && (
          <a href={backHref} className="btn btn-ghost btn-sm" title="Back to the course (stops the sandbox)">
            <ArrowLeft className="size-4" />
          </a>
        )}
        <span className={cn("chip", pill.tone)}>
          {status === "booting" || status === "stopping" ? <Loader2 className="size-3 animate-spin" /> : <span className="size-2 rounded-full bg-ink" />}
          {pill.label}
        </span>
        <h1 className="truncate font-display text-base font-bold">{payload.lab.title}</h1>
        {session && <span className="hidden font-mono text-[11px] text-ink/50 md:inline">session {session.id.slice(0, 8)}</span>}
        {engine === "mock" && <span className="chip bg-yellow">mock engine</span>}
        <div className="ml-auto flex items-center gap-2">
          {tutorItemId && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setTutorOpen((o) => !o)} aria-pressed={tutorOpen} title="Ask Glitch, the AI tutor">
              <Bot className="size-4" /> <span className="hidden sm:inline">Ask Glitch</span>
            </button>
          )}
          {status === "running" || status === "booting" ? (
            <>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => void reset()} disabled={status !== "running"} title="Stop and relaunch from the pristine image">
                <RotateCcw className="size-4" /> Reset
              </button>
              <button type="button" className="btn btn-danger btn-sm" onClick={() => void stop("user")}>
                <Square className="size-4" /> Stop
              </button>
            </>
          ) : (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => void launch()} onMouseEnter={warm} onFocus={warm} disabled={status === "stopping"}>
              <Rocket className="size-4" /> Launch
            </button>
          )}
        </div>
      </header>

      {smallScreen && !dismissedSmall && (
        <div className="flex items-center gap-3 border-b-4 border-ink bg-yellow px-3 py-2 text-sm">
          <AlertTriangle className="size-4 shrink-0" />
          <span className="flex-1">This lab is built for a desktop browser with a keyboard.</span>
          <button type="button" className="font-bold underline" onClick={() => setDismissedSmall(true)}>Dismiss</button>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* Side panel */}
        <aside className="flex min-h-0 shrink-0 flex-col border-r-4 border-ink bg-paper" style={{ width: settings.panelWidth }}>
          <div className="flex border-b-4 border-ink bg-white" role="tablist">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={settings.activeTab === t.id}
                onClick={() => updateSettings({ activeTab: t.id })}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 border-r-[3px] border-ink px-2 py-2 font-mono text-[11px] font-bold uppercase last:border-r-0",
                  settings.activeTab === t.id ? "bg-brand text-on-brand" : "hover:bg-paper-sunk",
                )}
              >
                <t.icon className="size-3.5" /> {t.label}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className={cn(settings.activeTab !== "steps" && "hidden")}>
              <StepsPanel payload={payload} backHref={backHref} nextHref={nextHref} />
            </div>
            {settings.activeTab === "files" && <FileManager />}
            {settings.activeTab === "cheatsheet" && <CheatSheet groups={payload.cheatsheet} />}
          </div>
        </aside>
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize side panel"
          tabIndex={0}
          onPointerDown={() => {
            dragging.current = true;
            document.body.style.cursor = "col-resize";
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") updateSettings({ panelWidth: Math.max(240, settings.panelWidth - 20) });
            if (e.key === "ArrowRight") updateSettings({ panelWidth: Math.min(640, settings.panelWidth + 20) });
          }}
          className="w-1.5 shrink-0 cursor-col-resize bg-ink/10 hover:bg-sky focus:bg-sky"
        />

        {/* Terminal */}
        <main className="relative min-w-0 flex-1">
          <TerminalPane />
          {status === "booting" && <BootOverlay />}
          {(status === "idle" || status === "stopped" || status === "error") && (
            <div className="absolute inset-0 z-10 grid place-items-center bg-ink/80 p-6">
              <div className="max-w-md rounded-3xl border-4 border-paper bg-ink p-7 text-center text-paper shadow-[6px_6px_0_#FFF8F0]">
                {status === "error" ? (
                  <>
                    <AlertTriangle className="mx-auto size-10 text-coral" />
                    <p className="mt-3 font-display text-xl font-bold">The sandbox could not start</p>
                    <p className="mt-2 break-words text-sm text-paper/70">{error}</p>
                  </>
                ) : status === "stopped" ? (
                  <>
                    <Power className="mx-auto size-10" />
                    <p className="mt-3 font-display text-xl font-bold">
                      {stopReason === "idle" ? `Stopped after ${sandbox.idleTimeoutMinutes} idle minutes` : "Sandbox stopped"}
                    </p>
                    <p className="mt-2 text-sm text-paper/70">Every change was wiped. Launch again for a fresh machine — your passed steps are saved.</p>
                  </>
                ) : (
                  <>
                    <Rocket className="mx-auto size-10" />
                    <p className="mt-3 font-display text-xl font-bold">Ready when you are</p>
                  </>
                )}
                <button type="button" className="btn btn-primary mt-5 !border-paper" onClick={() => void launch()} onMouseEnter={warm} onFocus={warm}>
                  <Rocket className="size-4" /> {status === "idle" ? "Launch" : "Launch again"}
                </button>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Footer */}
      <footer className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t-4 border-ink bg-white px-3 py-1.5 font-mono text-[11px] text-ink/70">
        <span className="flex items-center gap-1.5"><Keyboard className="size-3.5" /> Ctrl+Shift+C / V copy · paste</span>
        <span>Ctrl+` focus terminal</span>
        <span className="hidden lg:inline">Ctrl+C interrupts a command</span>
        {idleLeft !== null && (
          <span className="rounded-md border-2 border-ink bg-yellow px-2 font-bold text-ink">
            Idle — stopping in {idleLeft}s. Press any key to stay.
          </span>
        )}
        <span className="ml-auto flex items-center gap-2">
          <select
            aria-label="Terminal theme"
            value={settings.theme}
            onChange={(e) => updateSettings({ theme: e.target.value as TerminalTheme })}
            className="rounded-md border-2 border-ink bg-white px-1 py-0.5"
          >
            {(Object.keys(TERMINAL_THEMES) as TerminalTheme[]).map((t) => (
              <option key={t} value={t}>{TERMINAL_THEMES[t].label}</option>
            ))}
          </select>
          <button type="button" aria-label="Smaller font" className="rounded border-2 border-ink p-0.5" onClick={() => updateSettings({ fontSize: Math.max(10, settings.fontSize - 1) })}>
            <Minus className="size-3" />
          </button>
          <span className="tabular-nums">{settings.fontSize}px</span>
          <button type="button" aria-label="Larger font" className="rounded border-2 border-ink p-0.5" onClick={() => updateSettings({ fontSize: Math.min(24, settings.fontSize + 1) })}>
            <Plus className="size-3" />
          </button>
          {engine === "mock" ? (
            <span className="hidden md:inline">· Mock engine</span>
          ) : (
            // Attribution required by the CheerpX Community licence (cheerpx.io/licensing).
            <span>
              · Powered by{" "}
              <a href="https://cheerpx.io" target="_blank" rel="noopener noreferrer" className="font-bold underline">
                CheerpX
              </a>{" "}
              <span className="hidden md:inline">{cheerpxVersion} </span>from{" "}
              <a href="https://leaningtech.com" target="_blank" rel="noopener noreferrer" className="underline">
                Leaning Technologies
              </a>
            </span>
          )}
        </span>
      </footer>
      {tutorItemId && (
        <TutorChat
          itemId={tutorItemId}
          kind="lab"
          trigger="none"
          open={tutorOpen}
          onOpenChange={setTutorOpen}
          getContext={() => ({ terminal: readTerminalTail(80) || undefined })}
        />
      )}
    </div>
  );
}
