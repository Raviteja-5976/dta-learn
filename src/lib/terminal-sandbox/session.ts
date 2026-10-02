import { lockName, sessionIdFromDbName } from "./db-names";
import { deleteDatabase } from "./idb-release";
import type { EmulatorAdapter, StartOptions } from "./types";

/**
 * Session lifecycle (design §4.8). A session is one VM in one tab, identified
 * by a random uuid and guarded by a Web Lock held for its whole life, so
 * other tabs never delete a live session's databases.
 */
export interface Session {
  id: string;
  adapter: EmulatorAdapter;
  createdAt: number;
  releaseLock: () => void;
}

const liveIds = new Set<string>();

function acquireLock(name: string): Promise<() => void> {
  if (typeof navigator === "undefined" || !navigator.locks) return Promise.resolve(() => {});
  return new Promise((acquired) => {
    void navigator.locks.request(name, { mode: "exclusive" }, () => new Promise<void>((release) => acquired(release)));
  });
}

export async function createSession(factory: (sessionId: string) => EmulatorAdapter): Promise<Session> {
  const id = crypto.randomUUID();
  const releaseLock = await acquireLock(lockName(id));
  liveIds.add(id);
  return { id, adapter: factory(id), createdAt: Date.now(), releaseLock };
}

export async function bootSession(session: Session, opts: StartOptions): Promise<void> {
  await session.adapter.start(opts);
}

async function listDatabases(): Promise<string[]> {
  if (typeof indexedDB === "undefined" || typeof indexedDB.databases !== "function") return [];
  try {
    return (await indexedDB.databases()).map((d) => d.name ?? "").filter(Boolean);
  } catch {
    return [];
  }
}

/** Delete every database that belongs to a session, retrying once if blocked. */
async function deleteSessionDatabases(sessionId: string, knownNames: string[]): Promise<void> {
  const all = await listDatabases();
  const names = new Set<string>(all.filter((n) => sessionIdFromDbName(n) === sessionId));
  if (all.length === 0) {
    // Browsers without indexedDB.databases(): try the names we know of.
    for (const n of knownNames) {
      names.add(n);
      names.add(`cjFS_/${n}/`);
    }
  }
  for (const name of names) {
    const ok = await deleteDatabase(name);
    if (!ok) {
      await new Promise((r) => setTimeout(r, 1000));
      await deleteDatabase(name);
    }
  }
}

export async function destroySession(session: Session): Promise<void> {
  try {
    await session.adapter.destroy();
  } catch {
    /* keep going: the databases still need deleting */
  }
  try {
    await deleteSessionDatabases(session.id, session.adapter.storageNames?.() ?? []);
  } finally {
    liveIds.delete(session.id);
    session.releaseLock();
  }
}

/** Fire-and-forget teardown for pagehide; the next load sweeps leftovers. */
export function destroySessionNow(session: Session): void {
  void destroySession(session);
}

/**
 * Delete session databases left behind by closed tabs. A database is an
 * orphan when its id is not live in this tab and no tab holds (or waits for)
 * its Web Lock. This sweep is the real cleanup guarantee.
 */
export async function cleanupOrphans(): Promise<number> {
  const names = await listDatabases();
  if (!names.length) return 0;

  const locked = new Set<string>();
  if (typeof navigator !== "undefined" && navigator.locks?.query) {
    try {
      const snapshot = await navigator.locks.query();
      for (const l of [...(snapshot.held ?? []), ...(snapshot.pending ?? [])]) {
        if (l.name?.startsWith("sandbox-session-")) locked.add(l.name.slice("sandbox-session-".length));
      }
    } catch {
      return 0; // cannot tell which sessions are live: delete nothing
    }
  }

  let deleted = 0;
  for (const name of names) {
    const id = sessionIdFromDbName(name);
    if (!id || liveIds.has(id) || locked.has(id)) continue;
    if (await deleteDatabase(name)) deleted++;
  }
  return deleted;
}
