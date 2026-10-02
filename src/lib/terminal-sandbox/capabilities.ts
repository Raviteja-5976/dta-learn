export interface Capability {
  id: "wasm" | "isolation" | "sab" | "idb";
  label: string;
  ok: boolean;
  help: string;
}

/** Browser checks run before launch (design §4.11). */
export function checkCapabilities(): Capability[] {
  const w = typeof window !== "undefined" ? window : undefined;
  return [
    {
      id: "wasm",
      label: "WebAssembly",
      ok: typeof WebAssembly === "object",
      help: "Your browser does not support WebAssembly. Use a current Chrome, Edge or Firefox.",
    },
    {
      id: "isolation",
      label: "Cross-origin isolation",
      ok: Boolean(w?.crossOriginIsolated),
      help: "This page was not served with COOP/COEP headers. Reload the page directly (not inside a frame); if it persists, the host is missing the headers.",
    },
    {
      id: "sab",
      label: "SharedArrayBuffer",
      ok: typeof SharedArrayBuffer !== "undefined",
      help: "SharedArrayBuffer is unavailable. It needs a cross-origin isolated page in a desktop browser.",
    },
    {
      id: "idb",
      label: "IndexedDB",
      ok: typeof indexedDB !== "undefined",
      help: "IndexedDB is blocked. Private windows or strict privacy settings can disable it.",
    },
  ];
}

export function isSmallScreen(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(pointer: coarse)").matches && window.innerWidth < 900;
}
