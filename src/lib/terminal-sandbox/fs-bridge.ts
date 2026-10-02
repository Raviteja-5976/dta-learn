import { VmError, type CommandRunner, type VmEntry, type VmEntryType, type VmFileSystem } from "./types";

/**
 * File manager bridge (design §4.7). VmFileSystem built purely on hidden shell
 * commands, so it works with any engine that can run bash.
 */

export const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;
export const MAX_EDITOR_BYTES = 1024 * 1024;

const BARE_WORD = /^[A-Za-z0-9_/.,:@%+=-]+$/;

/** Quote a string for bash. NUL is rejected; safe bare words pass through. */
export function shellQuote(value: string): string {
  if (value.includes("\0")) throw new VmError("invalid", "NUL byte in shell argument");
  if (value.length > 0 && BARE_WORD.test(value) && !value.startsWith("-")) return value;
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** Resolve "." and ".." in an absolute path. Relative paths are rejected. */
export function normalizePath(path: string): string {
  if (!path.startsWith("/")) throw new VmError("invalid", `Path must be absolute: ${path}`);
  if (path.includes("\0")) throw new VmError("invalid", "NUL byte in path");
  const out: string[] = [];
  for (const part of path.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return "/" + out.join("/");
}

export function joinPath(dir: string, name: string): string {
  return normalizePath(`${dir}/${name}`);
}

export function dirname(path: string): string {
  const p = normalizePath(path);
  const i = p.lastIndexOf("/");
  return i <= 0 ? "/" : p.slice(0, i);
}

export function basename(path: string): string {
  const p = normalizePath(path);
  return p.slice(p.lastIndexOf("/") + 1);
}

/** Reject names that cannot be a single path component. */
export function validateName(name: string): void {
  if (!name) throw new VmError("invalid", "Name cannot be empty");
  if (name === "." || name === "..") throw new VmError("invalid", "Name cannot be . or ..");
  if (name.includes("/")) throw new VmError("invalid", "Name cannot contain /");
  if (name.includes("\0")) throw new VmError("invalid", "Name cannot contain NUL");
  if (new TextEncoder().encode(name).length > 255) throw new VmError("invalid", "Name is longer than 255 bytes");
}

const TYPE_MAP: Record<string, VmEntryType> = { f: "file", d: "dir", l: "symlink" };

/**
 * Parse `find -printf '%y\t%Y\t%s\t%T@\t%f\0'` output. Records are NUL-terminated
 * with the name last, so tabs and newlines in names are harmless.
 */
export function parseFindOutput(output: string, dir: string): VmEntry[] {
  const entries: VmEntry[] = [];
  for (const record of output.split("\0")) {
    if (!record) continue;
    const parts = record.split("\t");
    if (parts.length < 5) continue;
    const [y, Y, size, mtime] = parts;
    const name = parts.slice(4).join("\t");
    const type = TYPE_MAP[y] ?? "other";
    entries.push({
      name,
      path: joinPath(dir, name),
      type,
      linkToDir: type === "symlink" ? Y === "d" : undefined,
      size: Number(size) || 0,
      mtime: Math.round(Number(mtime) * 1000) || 0,
    });
  }
  return sortEntries(entries);
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

/** Directories first, then case-insensitive natural order. */
export function sortEntries(entries: VmEntry[]): VmEntry[] {
  const isDir = (e: VmEntry) => e.type === "dir" || (e.type === "symlink" && e.linkToDir);
  return [...entries].sort((a, b) => {
    const d = Number(isDir(b)) - Number(isDir(a));
    return d !== 0 ? d : collator.compare(a.name, b.name);
  });
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** VmFileSystem on top of any CommandRunner. */
export class ShellFileSystem implements VmFileSystem {
  constructor(private runner: CommandRunner) {}

  private async run(script: string, what: string): Promise<{ stdout: string; stdoutBytes: Uint8Array }> {
    const res = await this.runner.exec(script);
    if (res.status !== 0) {
      const msg = res.stderr.trim() || `${what} failed (exit ${res.status})`;
      if (/No such file or directory/i.test(msg)) throw new VmError("not_found", msg);
      if (res.status === 17) throw new VmError("exists", "An entry with that name already exists");
      throw new VmError("engine", msg);
    }
    return res;
  }

  async list(dir: string): Promise<VmEntry[]> {
    const d = normalizePath(dir);
    const res = await this.run(`find ${shellQuote(d)} -mindepth 1 -maxdepth 1 -printf '%y\\t%Y\\t%s\\t%T@\\t%f\\0'`, "list");
    return parseFindOutput(res.stdout, d);
  }

  async read(path: string): Promise<Uint8Array> {
    const res = await this.run(`cat -- ${shellQuote(normalizePath(path))}`, "read");
    return res.stdoutBytes;
  }

  async write(path: string, data: Uint8Array | string): Promise<void> {
    const p = normalizePath(path);
    const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
    if (bytes.length > MAX_UPLOAD_BYTES) throw new VmError("too_large", "Files are limited to 200 MB");

    if (this.runner.stage) {
      const name = `upload-${Math.random().toString(36).slice(2)}`;
      let staged: string | null = null;
      try {
        staged = await this.runner.stage(name, bytes);
      } catch (e) {
        if (e instanceof VmError && e.code === "destroyed") throw e;
        staged = null; // engine refused raw bytes: use the base64 path below
      }
      if (staged) {
        try {
          // Verify the staged size before copying (exit 99 → fall back to base64).
          const res = await this.runner.exec(
            `[ "$(wc -c < ${shellQuote(staged)})" -eq ${bytes.length} ] || exit 99\ncat -- ${shellQuote(staged)} > ${shellQuote(p)}`,
          );
          if (res.status === 0) return;
          if (res.status !== 99) throw new VmError("engine", res.stderr.trim() || `write failed (exit ${res.status})`);
        } finally {
          // A DataDevice has no unlink: overwrite the staged copy with nothing.
          await this.runner.stage(name, new Uint8Array()).catch(() => {});
        }
      }
    }

    // Fallback: append 64 KiB base64 chunks.
    const chunk = 64 * 1024;
    await this.run(`: > ${shellQuote(p)}`, "write");
    for (let i = 0; i < bytes.length; i += chunk) {
      const b64 = bytesToBase64(bytes.subarray(i, i + chunk));
      await this.run(`printf '%s' '${b64}' | base64 -d >> ${shellQuote(p)}`, "write");
    }
  }

  async mkdir(path: string): Promise<void> {
    await this.run(`mkdir -p -- ${shellQuote(normalizePath(path))}`, "mkdir");
  }

  async remove(path: string, opts?: { recursive?: boolean }): Promise<void> {
    const p = normalizePath(path);
    if (p === "/") throw new VmError("invalid", "Refusing to remove /");
    await this.run(`rm ${opts?.recursive ? "-rf" : "-f"} -- ${shellQuote(p)}`, "remove");
  }

  async rename(from: string, to: string): Promise<void> {
    const a = normalizePath(from);
    const b = normalizePath(to);
    if (a === "/" || b === "/") throw new VmError("invalid", "Cannot move /");
    if (b === a || b.startsWith(a + "/")) throw new VmError("invalid", "Cannot move a folder into itself");
    await this.run(`if [ -e ${shellQuote(b)} ] || [ -L ${shellQuote(b)} ]; then exit 17; fi; mv -T -- ${shellQuote(a)} ${shellQuote(b)}`, "rename");
  }

  async archive(dir: string): Promise<Uint8Array> {
    const d = normalizePath(dir);
    if (d === "/") throw new VmError("invalid", "Cannot archive /");
    const res = await this.run(`tar -czf - -C ${shellQuote(dirname(d))} -- ${shellQuote(basename(d))}`, "archive");
    return res.stdoutBytes;
  }
}
