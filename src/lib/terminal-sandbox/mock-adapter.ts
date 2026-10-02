import { OutputHub } from "./output-hub";
import { basename, dirname, normalizePath, sortEntries, validateName } from "./fs-bridge";
import { VmError, type EmulatorAdapter, type ExecResult, type StartOptions, type VmEntry, type VmFileSystem } from "./types";

/**
 * Instant fake shell for UI work and tests (`?engine=mock`). It has an
 * in-memory file system and a handful of commands. Hidden `exec` scripts are
 * not interpreted, so lab checks always report "needs the real engine".
 */

interface Node {
  type: "file" | "dir";
  content: Uint8Array;
  mtime: number;
}

const enc = new TextEncoder();
const dec = new TextDecoder();

class MemoryFileSystem implements VmFileSystem {
  nodes = new Map<string, Node>();

  constructor() {
    for (const d of ["/", "/home", "/home/user", "/tmp"]) this.nodes.set(d, { type: "dir", content: new Uint8Array(), mtime: Date.now() });
  }

  private need(path: string): Node {
    const n = this.nodes.get(normalizePath(path));
    if (!n) throw new VmError("not_found", `${path}: No such file or directory`);
    return n;
  }

  async list(dir: string): Promise<VmEntry[]> {
    const d = normalizePath(dir);
    if (this.need(d).type !== "dir") throw new VmError("invalid", `${d} is not a directory`);
    const out: VmEntry[] = [];
    for (const [p, n] of this.nodes) {
      if (p !== d && dirname(p) === d) out.push({ name: basename(p), path: p, type: n.type, size: n.content.length, mtime: n.mtime });
    }
    return sortEntries(out);
  }
  async read(path: string) {
    const n = this.need(path);
    if (n.type !== "file") throw new VmError("invalid", "Is a directory");
    return n.content;
  }
  async write(path: string, data: Uint8Array | string) {
    const p = normalizePath(path);
    this.need(dirname(p));
    this.nodes.set(p, { type: "file", content: typeof data === "string" ? enc.encode(data) : data, mtime: Date.now() });
  }
  async mkdir(path: string) {
    const p = normalizePath(path);
    let cur = "";
    for (const part of p.split("/").filter(Boolean)) {
      cur += `/${part}`;
      if (!this.nodes.has(cur)) this.nodes.set(cur, { type: "dir", content: new Uint8Array(), mtime: Date.now() });
    }
  }
  async remove(path: string) {
    const p = normalizePath(path);
    if (p === "/") throw new VmError("invalid", "Refusing to remove /");
    for (const key of [...this.nodes.keys()]) if (key === p || key.startsWith(p + "/")) this.nodes.delete(key);
  }
  async rename(from: string, to: string) {
    const a = normalizePath(from);
    const b = normalizePath(to);
    validateName(basename(b));
    if (this.nodes.has(b)) throw new VmError("exists", "An entry with that name already exists");
    if (b.startsWith(a + "/")) throw new VmError("invalid", "Cannot move a folder into itself");
    for (const [key, n] of [...this.nodes]) {
      if (key === a || key.startsWith(a + "/")) {
        this.nodes.delete(key);
        this.nodes.set(b + key.slice(a.length), n);
      }
    }
  }
  async archive(): Promise<Uint8Array> {
    throw new VmError("engine", "Archives need the real Linux engine");
  }
}

export class MockAdapter implements EmulatorAdapter {
  readonly name = "Mock engine";
  readonly fs = new MemoryFileSystem();
  private output = new OutputHub();
  private line = "";
  private cwd = "/home/user";

  async start(opts: StartOptions): Promise<void> {
    opts.onProgress?.({ phase: "engine", label: "Loading engine", percent: 5 });
    await new Promise((r) => setTimeout(r, 150));
    opts.onProgress?.({ phase: "linux", label: "Booting Linux", percent: 35 });
    await new Promise((r) => setTimeout(r, 150));
    opts.onProgress?.({ phase: "ready", label: "Ready", percent: 100 });
    this.print("\x1b[1;36mMock sandbox\x1b[0m — a fake shell for UI development. Type \x1b[1mhelp\x1b[0m.\r\n");
    this.prompt();
  }

  private print(s: string) {
    this.output.emit(enc.encode(s));
  }

  private prompt() {
    const shown = this.cwd.startsWith("/home/user") ? "~" + this.cwd.slice("/home/user".length) : this.cwd;
    this.print(`\x1b[1;36muser@mock\x1b[0m:\x1b[1;34m${shown}\x1b[0m$ `);
  }

  private resolve(p: string): string {
    if (!p || p === "~") return "/home/user";
    if (p.startsWith("~/")) return normalizePath("/home/user/" + p.slice(2));
    return normalizePath(p.startsWith("/") ? p : `${this.cwd}/${p}`);
  }

  private async run(cmdline: string) {
    const [cmd, ...args] = cmdline.trim().split(/\s+/);
    try {
      switch (cmd) {
        case "":
          break;
        case "help":
          this.print("Commands: ls, cd, pwd, cat, echo, mkdir, touch, rm, clear, whoami\r\n");
          break;
        case "pwd":
          this.print(this.cwd + "\r\n");
          break;
        case "whoami":
          this.print("user\r\n");
          break;
        case "clear":
          this.print("\x1b[2J\x1b[H");
          break;
        case "echo": {
          const gt = args.indexOf(">");
          if (gt >= 0) await this.fs.write(this.resolve(args[gt + 1]), args.slice(0, gt).join(" ") + "\n");
          else this.print(args.join(" ") + "\r\n");
          break;
        }
        case "ls": {
          const entries = await this.fs.list(this.resolve(args[0] ?? "."));
          this.print(entries.map((e) => (e.type === "dir" ? `\x1b[1;34m${e.name}\x1b[0m` : e.name)).join("  ") + (entries.length ? "\r\n" : ""));
          break;
        }
        case "cd": {
          const target = this.resolve(args[0] ?? "~");
          const entries = await this.fs.list(target);
          void entries;
          this.cwd = target;
          break;
        }
        case "cat":
          for (const a of args) this.print(dec.decode(await this.fs.read(this.resolve(a))).replace(/\n/g, "\r\n"));
          break;
        case "mkdir":
          for (const a of args.filter((x) => !x.startsWith("-"))) await this.fs.mkdir(this.resolve(a));
          break;
        case "touch":
          for (const a of args) if (!this.fs.nodes.has(this.resolve(a))) await this.fs.write(this.resolve(a), "");
          break;
        case "rm":
          for (const a of args.filter((x) => !x.startsWith("-"))) await this.fs.remove(this.resolve(a));
          break;
        default:
          this.print(`${cmd}: command not found (mock engine)\r\n`);
      }
    } catch (e) {
      this.print(`${cmd}: ${(e as Error).message}\r\n`);
    }
  }

  write(data: string): void {
    for (const ch of data) {
      if (ch === "\r" || ch === "\n") {
        this.print("\r\n");
        const line = this.line;
        this.line = "";
        void this.run(line).then(() => this.prompt());
      } else if (ch === "\x7f" || ch === "\b") {
        if (this.line.length) {
          this.line = this.line.slice(0, -1);
          this.print("\b \b");
        }
      } else if (ch === "\x03") {
        this.line = "";
        this.print("^C\r\n");
        this.prompt();
      } else if (ch >= " ") {
        this.line += ch;
        this.print(ch);
      }
    }
  }

  onOutput(cb: (data: string | Uint8Array) => void): () => void {
    return this.output.subscribe(cb);
  }

  resize(): void {}

  async exec(): Promise<ExecResult> {
    const msg = "Checks need the real Linux engine (mock engine is active).";
    return { status: 1, stdout: "", stderr: msg, stdoutBytes: new Uint8Array() };
  }

  async destroy(): Promise<void> {
    this.output.clear();
  }
}
