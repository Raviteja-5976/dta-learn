import { loadCheerpX, type CheerpXModule } from "./cheerpx-loader";
import { bridgeDbName, overlayDbName } from "./db-names";
import { ShellFileSystem } from "./fs-bridge";
import { OutputHub } from "./output-hub";
import type { SandboxConfig } from "./config";
import {
  VmError,
  type BootProgress,
  type CommandRunner,
  type EmulatorAdapter,
  type ExecResult,
  type StartOptions,
  type VmFileSystem,
} from "./types";

type Linux = InstanceType<CheerpXModule["Linux"]>;
type Device = InstanceType<CheerpXModule["Device"]>;
type IDBDevice = InstanceType<CheerpXModule["IDBDevice"]>;
type DataDevice = InstanceType<CheerpXModule["DataDevice"]>;
type LinuxCreateOptions = NonNullable<Parameters<CheerpXModule["Linux"]["create"]>[0]>;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function randomHex(bytes: number): string {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}

function lastIndexOfBytes(haystack: Uint8Array, needle: Uint8Array): number {
  outer: for (let i = haystack.length - needle.length; i >= 0; i--) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}

/**
 * CheerpX engine adapter (design §4.4–4.6). Runs 32-bit x86 Debian as
 * WebAssembly in the learner's tab:
 *
 *   /           ext2 overlay: read-only base image + per-session IndexedDB layer
 *   /.sbx-in    DataDevice   JS → VM (rc file, uploads), in memory
 *   /.sbx-out   IDBDevice    VM → JS (hidden command output)
 */
export class CheerpXAdapter implements EmulatorAdapter, CommandRunner {
  readonly name: string;
  readonly fs: VmFileSystem;

  private cx: Linux | null = null;
  private devices: Device[] = [];
  private overlayIdb: IDBDevice | null = null;
  private outbox: IDBDevice | null = null;
  private inbox: DataDevice | null = null;
  private sendKey: ((keyCode: number) => void) | null = null;
  private output = new OutputHub();
  private destroyed = false;
  private queue: Promise<unknown> = Promise.resolve();
  private vmReady: Promise<void>;
  private resolveVmReady!: () => void;
  private rejectVmReady!: (e: Error) => void;
  private cols = 80;
  private rows = 24;

  constructor(private sessionId: string, private config: SandboxConfig) {
    this.name = `CheerpX ${config.cheerpxVersion}`;
    this.fs = new ShellFileSystem(this);
    this.vmReady = new Promise((resolve, reject) => {
      this.resolveVmReady = resolve;
      this.rejectVmReady = reject;
    });
    this.vmReady.catch(() => {});
  }

  storageNames(): string[] {
    return [overlayDbName(this.sessionId), bridgeDbName(this.sessionId)];
  }

  async start(opts: StartOptions): Promise<void> {
    const report = (p: BootProgress) => opts.onProgress?.(p);
    this.cols = opts.cols;
    this.rows = opts.rows;

    // Count image-block requests so the boot overlay can show "N disk blocks".
    let blocks = 0;
    let currentPhase: BootProgress = { phase: "engine", label: "Loading engine", percent: 5 };
    const imageHost = (() => {
      try {
        return new URL(this.config.imageUrl.replace(/^wss:/, "https:")).host;
      } catch {
        return "";
      }
    })();
    let observer: PerformanceObserver | null = null;
    if (typeof PerformanceObserver !== "undefined" && imageHost) {
      observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.name.includes(imageHost)) blocks++;
        }
        report({ ...currentPhase, detail: `${blocks} disk blocks` });
      });
      try {
        observer.observe({ type: "resource", buffered: false });
      } catch {
        observer = null;
      }
    }
    const phase = (p: BootProgress) => {
      currentPhase = p;
      report({ ...p, detail: blocks ? `${blocks} disk blocks` : p.detail });
    };

    try {
      phase({ phase: "engine", label: "Loading engine", percent: 5 });
      const CX = await loadCheerpX(this.config.cheerpxVersion);
      this.assertAlive();

      phase({ phase: "disk", label: "Connecting to disk image", percent: 15 });
      const base = await this.createBaseDevice(CX);
      this.devices.push(base);
      this.overlayIdb = await CX.IDBDevice.create(overlayDbName(this.sessionId));
      this.devices.push(this.overlayIdb);
      const overlay = await CX.OverlayDevice.create(base, this.overlayIdb);
      this.devices.push(overlay);
      this.inbox = await CX.DataDevice.create();
      this.devices.push(this.inbox);
      this.outbox = await CX.IDBDevice.create(bridgeDbName(this.sessionId));
      this.devices.push(this.outbox);
      this.assertAlive();

      phase({ phase: "linux", label: "Booting Linux", percent: 35 });
      // The typings list fewer mount types than the engine supports; cast here.
      const mounts = [
        { type: "ext2", path: "/", dev: overlay },
        { type: "dir", path: "/.sbx-in", dev: this.inbox },
        { type: "dir", path: "/.sbx-out", dev: this.outbox },
        { type: "devs", path: "/dev" },
        { type: "devpts", path: "/dev/pts" },
        { type: "proc", path: "/proc" },
        { type: "sys", path: "/sys" },
      ] as unknown as LinuxCreateOptions["mounts"];
      this.cx = await CX.Linux.create({ mounts });
      this.assertAlive();
      this.resolveVmReady();

      phase({ phase: "shell", label: "Starting shell", percent: 60 });
      this.attachConsole(this.cols, this.rows);
      await this.inbox.writeFile("/sandboxrc", opts.shellRc ?? "unset PROMPT_COMMAND\n");
      void this.shellLoop();
      await this.output.waitForFirst(90_000);

      phase({ phase: "ready", label: "Ready", percent: 100 });
    } catch (e) {
      this.rejectVmReady(e instanceof Error ? e : new Error(String(e)));
      throw e;
    } finally {
      observer?.disconnect();
    }
  }

  private async createBaseDevice(CX: CheerpXModule): Promise<Device> {
    const { imageUrl, imageType } = this.config;
    if (imageType === "bytes") return CX.HttpBytesDevice.create(imageUrl);
    if (imageType === "github") return CX.GitHubDevice.create(imageUrl);
    try {
      return await CX.CloudDevice.create(imageUrl);
    } catch (e) {
      // Retry over https: if the wss: transport fails (design §4.4).
      if (imageUrl.startsWith("wss:")) return CX.CloudDevice.create(imageUrl.replace(/^wss:/, "https:"));
      throw e;
    }
  }

  private attachConsole(cols: number, rows: number): void {
    if (!this.cx) return;
    // setCustomConsole returns (keyCode) => void. The callback also carries a
    // virtual-terminal id; only vt 1 is the console. Copy: the engine reuses its buffer.
    this.sendKey = this.cx.setCustomConsole(
      (buf: Uint8Array, vt: number) => {
        if (vt === 1) this.output.emit(new Uint8Array(buf));
      },
      cols,
      rows,
    );
  }

  private async shellLoop(): Promise<void> {
    const { user } = this.config;
    const env = [...this.config.env, "PROMPT_COMMAND=. /.sbx-in/sandboxrc"];
    while (!this.destroyed && this.cx) {
      try {
        await this.cx.run("/bin/bash", ["--login"], { env, cwd: user.home, uid: user.uid, gid: user.gid });
      } catch {
        if (this.destroyed) return;
        await sleep(500);
      }
      if (this.destroyed) return;
      this.output.emit(encoder.encode("\r\n\x1b[33m[shell exited — starting a new one]\x1b[0m\r\n"));
    }
  }

  write(data: string): void {
    if (!this.sendKey || this.destroyed) return;
    // The console takes one key code at a time: send UTF-8 bytes individually.
    for (const byte of encoder.encode(data)) this.sendKey(byte);
  }

  onOutput(cb: (data: string | Uint8Array) => void): () => void {
    return this.output.subscribe(cb);
  }

  resize(cols: number, rows: number): void {
    this.cols = cols;
    this.rows = rows;
    // There is no resize API: re-register the console with the new size.
    if (this.cx && !this.destroyed) this.attachConsole(cols, rows);
  }

  /** Stage bytes in the INBOX and return the in-VM path. */
  async stage(name: string, data: Uint8Array): Promise<string> {
    await this.vmReady;
    if (!this.inbox || this.destroyed) throw new VmError("destroyed", "The sandbox has stopped");
    await (this.inbox.writeFile as unknown as (p: string, d: Uint8Array | string) => Promise<void>)(`/${name}`, data);
    return `/.sbx-in/${name}`;
  }

  /**
   * Run a bash script in a hidden process next to the interactive shell
   * (design §4.6). Calls are serialised, so the fixed OUTBOX file names are
   * safe. Output is read binary-safe from the IndexedDB-backed OUTBOX.
   */
  exec(script: string, opts?: { timeoutMs?: number }): Promise<ExecResult> {
    const run = () => this.execNow(script, opts?.timeoutMs ?? 60_000);
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => {});
    return p;
  }

  private async execNow(script: string, timeoutMs: number): Promise<ExecResult> {
    await this.vmReady;
    if (this.destroyed || !this.cx || !this.outbox) throw new VmError("destroyed", "The sandbox has stopped");
    const id = randomHex(12);
    const wrapped =
      `( ${script}\n) </dev/null >/.sbx-out/out 2>/.sbx-out/err\n` +
      `printf '\\n__END_${id}__:%d\\n' $? >>/.sbx-out/out\n`;
    const { user } = this.config;

    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        this.cx.run("/bin/bash", ["-c", wrapped], { env: this.config.env, cwd: user.home, uid: user.uid, gid: user.gid }),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new VmError("timeout", "Command timed out")), timeoutMs);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
    if (this.destroyed) throw new VmError("destroyed", "The sandbox has stopped");

    const marker = encoder.encode(`\n__END_${id}__:`);
    let bytes = new Uint8Array();
    let at = -1;
    // The file may not be visible yet: retry up to five times, 40 ms apart.
    for (let attempt = 0; attempt < 5; attempt++) {
      bytes = new Uint8Array(await (await this.outbox.readFileAsBlob("/out")).arrayBuffer());
      at = lastIndexOfBytes(bytes, marker);
      if (at >= 0) break;
      await sleep(40);
    }
    if (at < 0) throw new VmError("engine", "Lost the output of a hidden command");

    const tail = decoder.decode(bytes.subarray(at + marker.length));
    const status = parseInt(tail, 10);
    const stdoutBytes = bytes.slice(0, at);
    let stderr = "";
    if (status !== 0) {
      try {
        stderr = decoder.decode(new Uint8Array(await (await this.outbox.readFileAsBlob("/err")).arrayBuffer()));
      } catch {
        stderr = "";
      }
    }
    return { status: Number.isNaN(status) ? 1 : status, stdout: decoder.decode(stdoutBytes), stderr, stdoutBytes };
  }

  private assertAlive(): void {
    if (this.destroyed) throw new VmError("destroyed", "Launch was cancelled");
  }

  /**
   * Teardown order matters (design §4.8): mark destroyed, reset the IndexedDB
   * devices (raced against 3 s), delete Linux, delete devices in reverse
   * order, clear output, then give the engine 300 ms to settle. The session
   * layer deletes the databases afterwards.
   */
  async destroy(): Promise<void> {
    if (this.destroyed) return;
    this.destroyed = true;
    this.rejectVmReady(new VmError("destroyed", "The sandbox has stopped"));

    const resets: Promise<void>[] = [];
    if (this.overlayIdb) resets.push(this.overlayIdb.reset().catch(() => {}));
    if (this.outbox) resets.push(this.outbox.reset().catch(() => {}));
    await Promise.race([Promise.all(resets), sleep(3000)]);

    try {
      this.cx?.delete();
    } catch {
      /* already gone */
    }
    for (const dev of [...this.devices].reverse()) {
      try {
        dev.delete();
      } catch {
        /* already gone */
      }
    }
    this.cx = null;
    this.devices = [];
    this.sendKey = null;
    this.output.clear();
    await sleep(300);
  }
}
