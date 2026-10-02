"use client";

/** First-party analytics beacon (no third-party scripts on the isolated route). */
export function sendBeacon(payload: Record<string, unknown>): void {
  try {
    const body = JSON.stringify(payload);
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      navigator.sendBeacon("/api/beacons", new Blob([body], { type: "text/plain" }));
    } else {
      void fetch("/api/beacons", { method: "POST", body, keepalive: true, credentials: "same-origin" });
    }
  } catch {
    /* analytics must never break the lab */
  }
}
