/** Compile runtime contract (design §5.3). Runs on the server only. */

export type Verdict = "accepted" | "wrong_answer" | "time_limit" | "compile_error" | "runtime_error" | "internal_error";

export interface RunLimits {
  cpuSeconds: number;
  wallSeconds: number;
  memoryMiB: number;
  maxProcesses?: number;
  maxOutputKiB?: number;
}

export interface RunFile {
  path: string;
  content: string;
}

export interface RunRequest {
  /** Provider language id (resolved from the platform slug by the caller). */
  languageId: number;
  files: RunFile[];
  /** Path of the entry file when files has more than one element. */
  mainPath?: string;
  /** Multi-file program scripts (design §5.3): provided by the lab. */
  multiFile?: { compile?: string; run: string };
  stdin?: string;
  args?: string;
  limits: RunLimits;
}

export interface RunResult {
  verdict: Verdict;
  status: { id: number; description: string };
  stdout: string;
  stderr: string;
  compileOutput: string;
  message?: string;
  exitCode?: number;
  timeMs: number;
  memoryKiB: number;
  providerRef: string;
  truncated?: boolean;
}

export interface ProviderLanguage {
  id: number;
  name: string;
}

export interface CompilerProvider {
  languages(): Promise<ProviderLanguage[]>;
  run(req: RunRequest): Promise<RunResult>;
  runBatch(reqs: RunRequest[]): Promise<RunResult[]>;
}

export class CompilerUnavailableError extends Error {
  constructor(message = "The code runner is not configured yet.") {
    super(message);
  }
}

export class CompilerBusyError extends Error {
  constructor(message = "The code runner is busy. Retrying shortly usually works.") {
    super(message);
  }
}
