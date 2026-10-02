/**
 * Session database naming. CheerpX names IndexedDB databases
 * `cjFS_/sandbox-<uuid>/` (and `…-bridge/` for the OUTBOX), so ids are
 * matched anywhere in the name rather than by exact equality.
 */

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const SESSION_RE = new RegExp(`sandbox-(${UUID})(?:-bridge)?`, "i");

export function overlayDbName(sessionId: string): string {
  return `sandbox-${sessionId}`;
}

export function bridgeDbName(sessionId: string): string {
  return `sandbox-${sessionId}-bridge`;
}

export function lockName(sessionId: string): string {
  return `sandbox-session-${sessionId}`;
}

/** The session id a database belongs to, or null if it is not a session database. */
export function sessionIdFromDbName(name: string | undefined | null): string | null {
  if (!name) return null;
  const m = SESSION_RE.exec(name);
  return m ? m[1].toLowerCase() : null;
}

export function isSessionDbName(name: string | undefined | null): boolean {
  return sessionIdFromDbName(name) !== null;
}
