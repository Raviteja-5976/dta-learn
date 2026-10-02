import { cheerpxModuleUrl, type ImageType } from "./config";
import { loadCheerpX } from "./cheerpx-loader";

/**
 * Making launch feel instant (design §4.9). A cold boot needs ~130 disk
 * chunks that CheerpX fetches one at a time; fetching them in parallel first
 * lets CheerpX hit the HTTP cache instead.
 */

const done = new Set<string>();

export function preloadModule(version: string): void {
  if (typeof document === "undefined") return;
  const href = cheerpxModuleUrl(version);
  if (done.has(href)) return;
  done.add(href);
  const link = document.createElement("link");
  link.rel = "modulepreload";
  link.href = href;
  link.crossOrigin = "anonymous";
  document.head.appendChild(link);
}

export function httpImageUrl(url: string): string {
  return url.replace(/^wss:/, "https:");
}

/** Fetch the first 128 KiB of the image (superblock and early metadata). */
export function prefetchImageHead(url: string, type: ImageType): void {
  const key = `head:${url}`;
  if (done.has(key) || typeof fetch === "undefined") return;
  done.add(key);
  const init: RequestInit & { priority?: string } = { mode: "cors", credentials: "omit", priority: "low" };
  if (type === "cloud") {
    void fetch(`${httpImageUrl(url)}?s=0&e=131071`, init).catch(() => {});
  } else if (type === "bytes") {
    void fetch(url, { ...init, headers: { Range: "bytes=0-131071" } }).catch(() => {});
  }
}

/** Prefetch recorded boot chunks, 16 at a time, at low priority. */
export async function prefetchBootBlocks(manifest: string[] | null | undefined, concurrency = 16): Promise<void> {
  if (!manifest?.length || typeof fetch === "undefined") return;
  const queue = manifest.filter((u) => !done.has(u));
  queue.forEach((u) => done.add(u));
  const worker = async () => {
    for (let u = queue.shift(); u; u = queue.shift()) {
      try {
        await fetch(u, { mode: "cors", credentials: "omit", priority: "low" } as RequestInit);
      } catch {
        /* best effort */
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));
}

/** On hover/focus of Launch: load the engine and start the boot prefetch. */
export function prewarmEngine(version: string, manifest?: string[] | null): void {
  void loadCheerpX(version).catch(() => {});
  void prefetchBootBlocks(manifest);
}

export function noPrefetchRequested(): boolean {
  return typeof location !== "undefined" && new URLSearchParams(location.search).has("noprefetch");
}
