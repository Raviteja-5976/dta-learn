import { installIdbReleaseHook } from "./idb-release";
import { cheerpxModuleUrl } from "./config";

export type CheerpXModule = typeof import("@leaningtech/cheerpx");

const cache = new Map<string, Promise<CheerpXModule>>();

/**
 * Memoised dynamic import of the pinned CheerpX build. The IndexedDB release
 * hook is installed first, before CheerpX opens any database (design §4.4).
 * Hovering "Launch" calls this to pre-warm the engine.
 */
export function loadCheerpX(version: string): Promise<CheerpXModule> {
  const url = cheerpxModuleUrl(version);
  let p = cache.get(url);
  if (!p) {
    installIdbReleaseHook();
    p = import(/* webpackIgnore: true */ /* turbopackIgnore: true */ url) as Promise<CheerpXModule>;
    p.catch(() => cache.delete(url));
    cache.set(url, p);
  }
  return p;
}
