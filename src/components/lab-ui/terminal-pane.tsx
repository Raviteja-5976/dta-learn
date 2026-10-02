"use client";

import { useEffect, useRef } from "react";
import { Terminal, type ITheme } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";
import { useSandbox, type TerminalTheme } from "./store";

export const TERMINAL_THEMES: Record<TerminalTheme, ITheme & { label: string }> = {
  midnight: {
    label: "Midnight",
    background: "#1B1F3B",
    foreground: "#FFF8F0",
    cursor: "#4EA8FF",
    cursorAccent: "#1B1F3B",
    selectionBackground: "#4EA8FF66",
    black: "#1B1F3B",
    red: "#FF5C7A",
    green: "#6EE7B7",
    yellow: "#FFC93C",
    blue: "#4EA8FF",
    magenta: "#D49BFF",
    cyan: "#7FDBFF",
    white: "#FFF8F0",
    brightBlack: "#6B7099",
    brightRed: "#FF8DA1",
    brightGreen: "#9BF2CF",
    brightYellow: "#FFDB7A",
    brightBlue: "#86C3FF",
    brightMagenta: "#E4C2FF",
    brightCyan: "#A9E8FF",
    brightWhite: "#FFFFFF",
  },
  amber: {
    label: "Amber",
    background: "#17110A",
    foreground: "#FFC93C",
    cursor: "#FFC93C",
    cursorAccent: "#17110A",
    selectionBackground: "#FFC93C55",
    black: "#17110A",
    red: "#FF7A45",
    green: "#E8C55A",
    yellow: "#FFC93C",
    blue: "#F0A848",
    magenta: "#FFB38F",
    cyan: "#FFD98A",
    white: "#FFE7B0",
    brightBlack: "#7A6440",
    brightWhite: "#FFF3D6",
  },
  paper: {
    label: "Paper",
    background: "#FFF8F0",
    foreground: "#1B1F3B",
    cursor: "#1B1F3B",
    cursorAccent: "#FFF8F0",
    selectionBackground: "#4EA8FF55",
    black: "#1B1F3B",
    red: "#C2183A",
    green: "#0F7B53",
    yellow: "#9A6A00",
    blue: "#1F6FC4",
    magenta: "#8A3FB8",
    cyan: "#0E7F8C",
    white: "#6B7099",
    brightBlack: "#6B7099",
    brightWhite: "#1B1F3B",
  },
};

const SETTLE_MS = 700;

// The mounted terminal, so the AI tutor can read what the learner sees.
let activeTerminal: Terminal | null = null;

/** Last `maxLines` lines of the visible terminal buffer (plain text, trailing blanks dropped). */
export function readTerminalTail(maxLines = 80): string {
  const term = activeTerminal;
  if (!term) return "";
  const buf = term.buffer.active;
  const end = buf.baseY + buf.cursorY + 1;
  const lines: string[] = [];
  for (let i = Math.max(0, end - maxLines); i < end; i++) {
    lines.push(buf.getLine(i)?.translateToString(true) ?? "");
  }
  return lines.join("\n").replace(/\s+$/, "");
}

/**
 * xterm.js terminal fed directly by the in-browser adapter — no WebSocket.
 * Behaviour from design §4.12: block cursor, lineHeight 1.2, 5,000 lines of
 * scrollback, convertEol, FitAddon on ResizeObserver + rAF, refit after web
 * fonts load, Ctrl+Shift+C/V copy & paste (Ctrl+C stays SIGINT).
 */
export function TerminalPane() {
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const session = useSandbox((s) => s.session);
  const focusToken = useSandbox((s) => s.focusToken);
  const theme = useSandbox((s) => s.settings.theme);
  const fontSize = useSandbox((s) => s.settings.fontSize);

  const awaitingSettle = useRef(false);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const armSettle = () => {
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => {
      awaitingSettle.current = false;
      useSandbox.getState().settled();
    }, SETTLE_MS);
  };

  // Create the terminal once.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const family = getComputedStyle(document.documentElement).getPropertyValue("--font-jetbrains-mono").trim();
    const { settings } = useSandbox.getState();
    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: "block",
      lineHeight: 1.2,
      scrollback: 5000,
      convertEol: true, // the console emits bare \n
      fontFamily: `${family ? family + ", " : ""}ui-monospace, Menlo, Consolas, monospace`,
      fontSize: settings.fontSize,
      theme: TERMINAL_THEMES[settings.theme],
      allowProposedApi: false,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon((_e, uri) => window.open(uri, "_blank", "noopener,noreferrer")));
    term.open(host);
    termRef.current = term;
    fitRef.current = fit;
    activeTerminal = term;

    const doFit = () => {
      try {
        fit.fit();
        useSandbox.getState().setTermSize(term.cols, term.rows);
      } catch {
        /* host not visible */
      }
    };
    doFit();
    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(doFit);
    });
    ro.observe(host);
    void document.fonts?.ready.then(doFit);

    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== "keydown") return true;
      if (e.ctrlKey && e.shiftKey && (e.key === "C" || e.key === "c")) {
        const sel = term.getSelection();
        if (sel) void navigator.clipboard?.writeText(sel).catch(() => {});
        return false;
      }
      if (e.ctrlKey && e.shiftKey && (e.key === "V" || e.key === "v")) {
        void navigator.clipboard
          ?.readText()
          .then((text) => useSandbox.getState().session?.adapter.write(text))
          .catch(() => {});
        return false;
      }
      return true;
    });

    const dataSub = term.onData((data) => {
      const s = useSandbox.getState().session;
      if (!s) return;
      s.adapter.write(data);
      if (data.includes("\r")) {
        // Refresh files/checks once output has been quiet for 700 ms after Enter.
        awaitingSettle.current = true;
        armSettle();
      }
    });

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      dataSub.dispose();
      if (settleTimer.current) clearTimeout(settleTimer.current);
      if (activeTerminal === term) activeTerminal = null;
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, []);

  // Pipe the session's console into the terminal.
  useEffect(() => {
    const term = termRef.current;
    if (!term || !session) return;
    term.reset();
    const unsubscribe = session.adapter.onOutput((chunk) => {
      term.write(chunk);
      if (awaitingSettle.current) armSettle();
    });
    session.adapter.resize(term.cols, term.rows);
    return unsubscribe;
  }, [session]);

  useEffect(() => {
    if (focusToken > 0) termRef.current?.focus();
  }, [focusToken]);

  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    term.options.theme = TERMINAL_THEMES[theme];
    term.options.fontSize = fontSize;
    try {
      fitRef.current?.fit();
      useSandbox.getState().setTermSize(term.cols, term.rows);
    } catch {
      /* ignore */
    }
  }, [theme, fontSize]);

  return (
    <div className="h-full w-full p-2" style={{ background: TERMINAL_THEMES[theme].background }}>
      <div ref={hostRef} className="h-full w-full" aria-label="Terminal" />
    </div>
  );
}
