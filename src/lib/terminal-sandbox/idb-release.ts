import { isSessionDbName } from "./db-names";

/**
 * CheerpX keeps IndexedDB connections open after a device is deleted, so a
 * later deleteDatabase() blocks forever (design §4.5). This hook patches
 * IDBFactory.open: for session databases it closes the connection as soon as
 * another context asks for a version change (i.e. a delete). Databases with
 * other names are untouched.
 */
let installed = false;

export function installIdbReleaseHook(): void {
  if (installed || typeof IDBFactory === "undefined") return;
  installed = true;

  const proto = IDBFactory.prototype;
  const originalOpen = proto.open;

  proto.open = function patchedOpen(this: IDBFactory, name: string, version?: number): IDBOpenDBRequest {
    const request = version === undefined ? originalOpen.call(this, name) : originalOpen.call(this, name, version);
    if (isSessionDbName(name)) {
      request.addEventListener("success", () => {
        const db = request.result;
        db.addEventListener("versionchange", () => db.close());
      });
    }
    return request;
  };
}

/** Delete one database; resolves false if it stayed blocked past the timeout. */
export function deleteDatabase(name: string, timeoutMs = 2500): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (ok: boolean) => {
      if (!settled) {
        settled = true;
        resolve(ok);
      }
    };
    try {
      const req = indexedDB.deleteDatabase(name);
      req.onsuccess = () => done(true);
      req.onerror = () => done(false);
      req.onblocked = () => {
        // Wait: the release hook closes connections on versionchange.
      };
    } catch {
      done(false);
    }
    setTimeout(() => done(false), timeoutMs);
  });
}
