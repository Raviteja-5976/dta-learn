"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  CheerpXAdapter,
  MockAdapter,
  bootSession,
  cleanupOrphans,
  createSession,
  destroySession,
  type BootProgress,
  type ExecResult,
  type SandboxConfig,
  type Session,
} from "@/lib/terminal-sandbox";
import { absolutePath, mkdirForFile, qpath, type InitAction } from "@/lib/labs/terminal-checks";
import { sendBeacon } from "./beacon";

/**
 * Sandbox lifecycle store (design §4.8). Contract kept from the reference:
 * launch, stop, reset, exec, typeInTerminal, setTermSize, bumpFs, focusTerminal.
 *
 *   idle ─launch─► booting ─ready─► running ─stop─► stopping ─► stopped
 *                     └──── error ◄──────┘     reset = stop("reset") then launch
 */
export type SandboxStatus = "idle" | "booting" | "running" | "stopping" | "stopped" | "error";
export type StopReason = "user" | "idle" | "reset" | "navigate" | "error";
export type TerminalTheme = "midnight" | "amber" | "paper";
export type SideTab = "steps" | "files" | "cheatsheet";

export interface LabRuntime {
  sandbox: SandboxConfig;
  engine: "cheerpx" | "mock";
  shellRc: string;
  init: InitAction[];
  attemptId: string;
  labId: string;
  imageLabel: string;
}

export interface Settings {
  theme: TerminalTheme;
  fontSize: number;
  panelWidth: number;
  showDotfiles: boolean;
  activeTab: SideTab;
}

interface SandboxState {
  runtime: LabRuntime | null;
  status: SandboxStatus;
  progress: BootProgress | null;
  error: string | null;
  session: Session | null;
  generation: number;
  fsVersion: number;
  focusToken: number;
  settleToken: number;
  termSize: { cols: number; rows: number };
  initPending: boolean;
  startedAt: number | null;
  stopReason: StopReason | null;
  settings: Settings;

  configure: (runtime: LabRuntime) => void;
  launch: (opts?: { afterBoot?: (s: Session) => Promise<void> }) => Promise<void>;
  stop: (reason?: StopReason) => Promise<void>;
  reset: (opts?: { afterBoot?: (s: Session) => Promise<void> }) => Promise<void>;
  exec: (script: string, opts?: { timeoutMs?: number }) => Promise<ExecResult>;
  typeInTerminal: (text: string, enter?: boolean) => void;
  setTermSize: (cols: number, rows: number) => void;
  bumpFs: () => void;
  settled: () => void;
  focusTerminal: () => void;
  updateSettings: (patch: Partial<Settings>) => void;
}

let stopPromise: Promise<void> | null = null;

async function runInit(session: Session, actions: InitAction[], home: string): Promise<void> {
  for (const a of actions) {
    try {
      if (a.kind === "run" && a.script) {
        await session.adapter.exec(a.script);
      } else if (a.kind === "file" && a.path) {
        await session.adapter.exec(mkdirForFile(a.path));
        await session.adapter.fs.write(absolutePath(a.path, home), a.content ?? "");
        if (a.mode) await session.adapter.exec(`chmod ${a.mode.replace(/[^0-7+x]/g, "")} -- ${qpath(a.path)}`);
      }
    } catch (e) {
      console.warn("lab init step failed", e);
    }
  }
}

export const useSandbox = create<SandboxState>()(
  persist(
    (set, get) => ({
      runtime: null,
      status: "idle",
      progress: null,
      error: null,
      session: null,
      generation: 0,
      fsVersion: 0,
      focusToken: 0,
      settleToken: 0,
      termSize: { cols: 80, rows: 24 },
      initPending: false,
      startedAt: null,
      stopReason: null,
      settings: { theme: "midnight", fontSize: 14, panelWidth: 340, showDotfiles: false, activeTab: "steps" },

      configure: (runtime) => set({ runtime }),

      launch: async (opts) => {
        const { status, runtime } = get();
        if (!runtime) return;
        if (status === "booting" || status === "running") return; // one session per tab
        if (stopPromise) await stopPromise;

        const gen = get().generation + 1;
        set({ generation: gen, status: "booting", error: null, stopReason: null, progress: { phase: "engine", label: "Loading engine", percent: 2 } });
        sendBeacon({ event: "sandbox_launch", attemptId: runtime.attemptId, labId: runtime.labId, image: runtime.imageLabel, engine: runtime.engine });
        const t0 = performance.now();
        let session: Session | null = null;

        try {
          session = await createSession((id) => (runtime.engine === "mock" ? new MockAdapter() : new CheerpXAdapter(id, runtime.sandbox)));
          if (get().generation !== gen) {
            await destroySession(session);
            return;
          }
          set({ session });

          // Starter files stream in alongside the shell boot (design §4.9 step 5).
          set({ initPending: runtime.init.length > 0 });
          const current = session;
          const initDone = runInit(current, runtime.init, runtime.sandbox.user.home).finally(() => {
            if (get().session === current) set((s) => ({ initPending: false, fsVersion: s.fsVersion + 1 }));
          });

          const { cols, rows } = get().termSize;
          await bootSession(session, {
            cols,
            rows,
            shellRc: runtime.shellRc,
            onProgress: (p) => {
              if (get().generation === gen) set({ progress: p });
            },
          });
          if (get().generation !== gen) {
            await destroySession(session);
            return;
          }
          set((s) => ({ status: "running", startedAt: Date.now(), fsVersion: s.fsVersion + 1, focusToken: s.focusToken + 1 }));
          sendBeacon({ event: "sandbox_ready", attemptId: runtime.attemptId, labId: runtime.labId, image: runtime.imageLabel, engine: runtime.engine, bootMs: Math.round(performance.now() - t0) });

          if (opts?.afterBoot) {
            await initDone;
            await opts.afterBoot(session);
            set((s) => ({ fsVersion: s.fsVersion + 1 }));
          }
        } catch (e) {
          if (get().generation !== gen) return;
          const message = e instanceof Error ? e.message : String(e);
          set({ status: "error", error: message, progress: null });
          sendBeacon({ event: "sandbox_error", attemptId: runtime.attemptId, labId: runtime.labId, image: runtime.imageLabel, engine: runtime.engine, error: message.slice(0, 400) });
          if (session) {
            const s = session;
            set({ session: null });
            await destroySession(s).catch(() => {});
          }
        }
      },

      stop: async (reason = "user") => {
        const { session, status, runtime, startedAt } = get();
        set((s) => ({ generation: s.generation + 1 }));
        if (!session) {
          if (status === "booting" || status === "error") set({ status: "stopped", progress: null });
          return;
        }
        set({ status: "stopping", stopReason: reason });
        if (runtime) {
          sendBeacon({ event: "sandbox_stop", attemptId: runtime.attemptId, labId: runtime.labId, engine: runtime.engine, reason, uptimeMs: startedAt ? Date.now() - startedAt : 0 });
        }
        stopPromise = destroySession(session).finally(() => {
          stopPromise = null;
        });
        await stopPromise;
        set({ status: "stopped", session: null, progress: null, initPending: false, startedAt: null });
        setTimeout(() => void cleanupOrphans(), 2000);
      },

      reset: async (opts) => {
        await get().stop("reset");
        await get().launch(opts);
      },

      exec: async (script, opts) => {
        const session = get().session;
        if (!session) throw new Error("The sandbox is not running");
        return session.adapter.exec(script, opts);
      },

      typeInTerminal: (text, enter = false) => {
        const session = get().session;
        if (!session) return;
        session.adapter.write(text + (enter ? "\r" : ""));
        set((s) => ({ focusToken: s.focusToken + 1 }));
      },

      setTermSize: (cols, rows) => {
        const { termSize, session } = get();
        if (termSize.cols === cols && termSize.rows === rows) return;
        set({ termSize: { cols, rows } });
        session?.adapter.resize(cols, rows);
      },

      bumpFs: () => set((s) => ({ fsVersion: s.fsVersion + 1 })),
      settled: () => set((s) => ({ fsVersion: s.fsVersion + 1, settleToken: s.settleToken + 1 })),
      focusTerminal: () => set((s) => ({ focusToken: s.focusToken + 1 })),
      updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
    }),
    {
      // View settings only — never required for correctness (design §4.12).
      name: "dta-sandbox-settings",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ settings: s.settings }),
    },
  ),
);
