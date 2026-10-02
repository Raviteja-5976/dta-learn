import "server-only";
import { createZip } from "./zip";
import {
  CompilerBusyError,
  CompilerUnavailableError,
  type CompilerProvider,
  type ProviderLanguage,
  type RunRequest,
  type RunResult,
  type Verdict,
} from "./types";

const MULTI_FILE_LANGUAGE_ID = 89;
const MAX_OUTPUT_BYTES = 64 * 1024;
const FIELDS = "token,stdout,stderr,compile_output,message,exit_code,status,time,memory";

interface Judge0Submission {
  token: string;
  stdout: string | null;
  stderr: string | null;
  compile_output: string | null;
  message: string | null;
  exit_code: number | null;
  status: { id: number; description: string };
  time: string | null;
  memory: number | null;
}

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");
const unb64 = (s: string | null) => (s ? Buffer.from(s, "base64").toString("utf8") : "");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function truncate(s: string): { text: string; truncated: boolean } {
  if (Buffer.byteLength(s, "utf8") <= MAX_OUTPUT_BYTES) return { text: s, truncated: false };
  return { text: Buffer.from(s, "utf8").subarray(0, MAX_OUTPUT_BYTES).toString("utf8") + "\n… output truncated (64 KiB limit)", truncated: true };
}

/** Judge0 status → platform verdict (design §5.3). */
export function mapStatus(id: number): Verdict {
  if (id === 3) return "accepted";
  if (id === 4) return "wrong_answer";
  if (id === 5) return "time_limit";
  if (id === 6) return "compile_error";
  if (id >= 7 && id <= 12) return "runtime_error";
  return "internal_error";
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/**
 * Judge0 behind the CompilerProvider interface. Hosted (RapidAPI) and
 * self-hosted CE differ only by base URL and auth header. Results are polled
 * (no callback_url), so Judge0 never needs a route back into the core.
 */
export class Judge0Provider implements CompilerProvider {
  private headers: Record<string, string>;

  constructor(private baseUrl: string, apiKey: string) {
    if (!baseUrl) throw new CompilerUnavailableError();
    this.headers = { "Content-Type": "application/json", Accept: "application/json" };
    if (apiKey) {
      const host = new URL(baseUrl).host;
      if (host.endsWith("rapidapi.com")) {
        this.headers["X-RapidAPI-Key"] = apiKey;
        this.headers["X-RapidAPI-Host"] = host;
      } else {
        this.headers["X-Auth-Token"] = apiKey;
      }
    }
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers: { ...this.headers, ...(init?.headers as Record<string, string>) },
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      });
    } catch (e) {
      throw new CompilerBusyError(`Could not reach the code runner (${(e as Error).message}).`);
    }
    if (res.status === 429 || res.status === 503) throw new CompilerBusyError();
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Judge0 ${res.status}: ${body.slice(0, 300)}`);
    }
    return (await res.json()) as T;
  }

  async languages(): Promise<ProviderLanguage[]> {
    return this.request<ProviderLanguage[]>("/languages");
  }

  private toSubmission(req: RunRequest): Record<string, unknown> {
    const { limits } = req;
    const cpu = clamp(limits.cpuSeconds, 0.5, 15);
    const body: Record<string, unknown> = {
      cpu_time_limit: cpu,
      cpu_extra_time: clamp(cpu * 0.25, 0.5, 5),
      wall_time_limit: clamp(limits.wallSeconds, 1, 20),
      memory_limit: clamp(Math.round(limits.memoryMiB * 1024), 32_000, 256_000), // KB, address space (server cap: 256000)
      max_processes_and_or_threads: clamp(limits.maxProcesses ?? 32, 1, 120),
      max_file_size: clamp(limits.maxOutputKiB ?? 64, 1, 4096),
      enable_network: false,
      stdin: b64(req.stdin ?? ""),
    };
    if (req.args) body.command_line_arguments = req.args.slice(0, 512);

    if (req.multiFile) {
      const files = [...req.files, { path: "run", content: `#!/bin/bash\n${req.multiFile.run}\n` }];
      if (req.multiFile.compile) files.push({ path: "compile", content: `#!/bin/bash\n${req.multiFile.compile}\n` });
      body.language_id = MULTI_FILE_LANGUAGE_ID;
      body.additional_files = Buffer.from(createZip(files)).toString("base64");
    } else {
      const main = req.files.find((f) => f.path === req.mainPath) ?? req.files[0];
      body.language_id = req.languageId;
      body.source_code = b64(main.content);
    }
    return body;
  }

  private toResult(s: Judge0Submission): RunResult {
    const stdout = truncate(unb64(s.stdout));
    const stderr = truncate(unb64(s.stderr));
    return {
      verdict: mapStatus(s.status.id),
      status: s.status,
      stdout: stdout.text,
      stderr: stderr.text,
      compileOutput: truncate(unb64(s.compile_output)).text,
      message: unb64(s.message) || undefined,
      exitCode: s.exit_code ?? undefined,
      timeMs: Math.round(Number(s.time ?? 0) * 1000),
      memoryKiB: s.memory ?? 0,
      providerRef: s.token,
      truncated: stdout.truncated || stderr.truncated,
    };
  }

  /** Poll with backoff: 300 ms growing to 1 s, bounded by the request budget. */
  private async poll<T>(fetchOnce: () => Promise<T>, pending: (v: T) => boolean, budgetMs: number): Promise<T> {
    const deadline = Date.now() + budgetMs;
    let delay = 300;
    for (;;) {
      await sleep(delay);
      const value = await fetchOnce();
      if (!pending(value)) return value;
      if (Date.now() > deadline) throw new CompilerBusyError("The code runner took too long. Please try again.");
      delay = Math.min(1000, Math.round(delay * 1.5));
    }
  }

  async run(req: RunRequest): Promise<RunResult> {
    const { token } = await this.request<{ token: string }>("/submissions?base64_encoded=true&wait=false", {
      method: "POST",
      body: JSON.stringify(this.toSubmission(req)),
    });
    const sub = await this.poll(
      () => this.request<Judge0Submission>(`/submissions/${token}?base64_encoded=true&fields=${FIELDS}`),
      (s) => s.status.id === 1 || s.status.id === 2,
      22_000,
    );
    return this.toResult(sub);
  }

  async runBatch(reqs: RunRequest[]): Promise<RunResult[]> {
    if (reqs.length === 0) return [];
    const created = await this.request<Array<{ token?: string; error?: unknown }>>("/submissions/batch?base64_encoded=true", {
      method: "POST",
      body: JSON.stringify({ submissions: reqs.map((r) => this.toSubmission(r)) }),
    });
    const tokens = created.map((c) => c.token);
    if (tokens.some((t) => !t)) throw new Error(`Judge0 rejected a submission: ${JSON.stringify(created.find((c) => !c.token))}`);
    const batch = await this.poll(
      () => this.request<{ submissions: Judge0Submission[] }>(`/submissions/batch?tokens=${tokens.join(",")}&base64_encoded=true&fields=${FIELDS}`),
      (b) => b.submissions.some((s) => s.status.id === 1 || s.status.id === 2),
      24_000,
    );
    return batch.submissions.map((s) => this.toResult(s));
  }
}
