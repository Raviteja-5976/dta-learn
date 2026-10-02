/**
 * Terminal runtime contract (design §3, §4.3). Framework-free TypeScript:
 * the UI, the lab shell and the rest of the platform only ever see these
 * interfaces, so CheerpX can be swapped for another engine (v86, mock).
 */

export type BootPhase = "engine" | "disk" | "linux" | "shell" | "ready";

export interface BootProgress {
  phase: BootPhase;
  label: string;
  percent: number;
  detail?: string;
}

export interface StartOptions {
  cols: number;
  rows: number;
  /** Bash rc sourced once before the first prompt (bash builtins only). */
  shellRc?: string;
  onProgress?: (p: BootProgress) => void;
}

export interface ExecResult {
  status: number;
  stdout: string;
  stderr: string;
  stdoutBytes: Uint8Array;
}

export type VmEntryType = "file" | "dir" | "symlink" | "other";

export interface VmEntry {
  name: string;
  path: string;
  type: VmEntryType;
  /** For symlinks: true when the link points at a directory. */
  linkToDir?: boolean;
  size: number;
  /** Modification time in ms since epoch. */
  mtime: number;
}

export interface VmFileSystem {
  list(dir: string): Promise<VmEntry[]>;
  read(path: string): Promise<Uint8Array>;
  write(path: string, data: Uint8Array | string): Promise<void>;
  mkdir(path: string): Promise<void>;
  remove(path: string, opts?: { recursive?: boolean }): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  archive(dir: string): Promise<Uint8Array>;
}

export interface EmulatorAdapter {
  readonly name: string;
  start(opts: StartOptions): Promise<void>;
  write(data: string): void;
  onOutput(cb: (data: string | Uint8Array) => void): () => void;
  resize(cols: number, rows: number): void;
  readonly fs: VmFileSystem;
  exec(script: string, opts?: { timeoutMs?: number }): Promise<ExecResult>;
  destroy(): Promise<void>;
  storageNames?(): string[];
}

export type VmErrorCode = "not_found" | "exists" | "invalid" | "too_large" | "destroyed" | "timeout" | "engine";

export class VmError extends Error {
  constructor(public code: VmErrorCode, message: string) {
    super(message);
    this.name = "VmError";
  }
}

/** Anything that can run a hidden bash script. */
export interface CommandRunner {
  exec(script: string, opts?: { timeoutMs?: number }): Promise<ExecResult>;
  /** Optional fast path for writing bytes into the VM (INBOX staging). */
  stage?(name: string, data: Uint8Array): Promise<string>;
}
