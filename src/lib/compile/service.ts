import "server-only";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/server";
import { serverEnv } from "@/lib/env";
import { HttpError } from "@/lib/http";
import { logEvent } from "@/lib/events";
import { compareOutput } from "./compare";
import { getCompiler } from "./provider";
import { CompilerBusyError, CompilerUnavailableError, type RunRequest, type RunResult, type Verdict } from "./types";
import { effectiveLimits, evaluateAttempt, loadLanguage, recordValidation, type StepEvaluation } from "@/lib/labs/server";
import type { CompileCheck, CompileLabSpec } from "@/lib/labs/spec";
import type { LabAttempt, LabVersion } from "@/lib/types";

const MAX_SOURCE_BYTES = 64 * 1024;
const MAX_STDIN_BYTES = 64 * 1024;
const CACHE_TTL_MS = 10 * 60 * 1000;

export interface SubmittedFile {
  path: string;
  content: string;
}

/** Only the spec's files are accepted; read-only files always come from the spec. */
export function sanitizeFiles(spec: CompileLabSpec, submitted: SubmittedFile[]): SubmittedFile[] {
  const byPath = new Map(submitted.map((f) => [f.path, f.content]));
  return spec.files.map((f) => {
    const content = f.editable && byPath.has(f.path) ? (byPath.get(f.path) as string) : f.content;
    if (Buffer.byteLength(content, "utf8") > MAX_SOURCE_BYTES) throw new HttpError(413, `${f.path} is larger than 64 KiB`);
    return { path: f.path, content };
  });
}

function mainPath(spec: CompileLabSpec): string {
  return (spec.files.find((f) => f.main) ?? spec.files[0]).path;
}

function withPrelude(files: SubmittedFile[], main: string, prelude: string | undefined): SubmittedFile[] {
  if (!prelude) return files;
  return files.map((f) => (f.path === main ? { ...f, content: `${prelude}\n${f.content}` } : f));
}

async function countRecent(userId: string, kind: "run" | "check", sinceMs: number, attemptId?: string): Promise<number> {
  let q = createAdminClient()
    .from("code_runs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("kind", kind)
    .eq("cached", false)
    .gte("created_at", new Date(Date.now() - sinceMs).toISOString());
  if (attemptId) q = q.eq("attempt_id", attemptId);
  const { count } = await q;
  return count ?? 0;
}

/** Per-user rate limits (design §5.5), counted from code_runs. */
async function enforceRunLimits(userId: string): Promise<void> {
  const limits = serverEnv.limits();
  const [minute, day] = await Promise.all([countRecent(userId, "run", 60_000), countRecent(userId, "run", 86_400_000)]);
  if (minute >= limits.runsPerMinute) throw new HttpError(429, "You're running code very fast. Wait a few seconds and try again.", { retryAfter: 10 });
  if (day >= limits.runsPerDay) throw new HttpError(429, `You've used today's ${limits.runsPerDay} runs. Use Check to grade, or come back tomorrow.`, { retryAfter: 3600 });
}

async function enforceCheckLimits(userId: string, attemptId: string): Promise<void> {
  // A Check writes one code_runs row per test case, so count distinct checks by grouping on time.
  const { data } = await createAdminClient()
    .from("code_runs")
    .select("created_at")
    .eq("user_id", userId)
    .eq("attempt_id", attemptId)
    .eq("kind", "check")
    .gte("created_at", new Date(Date.now() - 60_000).toISOString());
  const batches = new Set((data ?? []).map((r: { created_at: string }) => r.created_at.slice(0, 19)));
  if (batches.size >= serverEnv.limits().checksPerMinute) throw new HttpError(429, "Too many checks this minute. Take a breath and try again shortly.", { retryAfter: 15 });
}

function translateProviderError(e: unknown): never {
  if (e instanceof HttpError) throw e;
  if (e instanceof CompilerUnavailableError) throw new HttpError(503, e.message);
  if (e instanceof CompilerBusyError) throw new HttpError(429, e.message, { retryAfter: 5, busy: true });
  console.error("compile provider error", e);
  throw new HttpError(502, "Platform error while running your code. Please try again.");
}

/** Run once; internal errors (Judge0 13/14) are retried once and never counted against the learner. */
async function runWithRetry(req: RunRequest): Promise<RunResult> {
  const compiler = getCompiler();
  let result = await compiler.run(req);
  if (result.verdict === "internal_error") result = await compiler.run(req);
  return result;
}

export interface RunResponse {
  verdict: Verdict;
  statusText: string;
  stdout: string;
  stderr: string;
  compileOutput: string;
  exitCode?: number;
  timeMs: number;
  memoryKiB: number;
  cached: boolean;
  truncated?: boolean;
}

/** Run (practice): one submission with the learner's own stdin. */
export async function runCode(attempt: LabAttempt, version: LabVersion, files: SubmittedFile[], stdin: string): Promise<RunResponse> {
  const spec = version.spec as CompileLabSpec;
  if (Buffer.byteLength(stdin, "utf8") > MAX_STDIN_BYTES) throw new HttpError(413, "stdin is larger than 64 KiB");
  const language = await loadLanguage(spec.runtime.language);
  const limits = effectiveLimits(spec, language);
  const clean = sanitizeFiles(spec, files);
  const main = mainPath(spec);
  const req: RunRequest = {
    languageId: language.provider_language_id,
    files: withPrelude(clean, main, spec.runtime.prelude),
    mainPath: main,
    multiFile: spec.runtime.multiFile,
    stdin,
    limits,
  };

  const admin = createAdminClient();
  const key = createHash("sha256").update(JSON.stringify({ l: req.languageId, f: req.files, s: stdin, m: req.multiFile ?? null, lim: limits })).digest("hex");

  const { data: cached } = await admin.from("compile_cache").select("result, created_at").eq("key", key).maybeSingle<{ result: RunResponse; created_at: string }>();
  if (cached && Date.now() - new Date(cached.created_at).getTime() < CACHE_TTL_MS) {
    await admin.from("code_runs").insert({ attempt_id: attempt.id, user_id: attempt.user_id, language: language.slug, kind: "run", verdict: cached.result.verdict, time_ms: cached.result.timeMs, memory_kib: cached.result.memoryKiB, cached: true });
    return { ...cached.result, cached: true };
  }

  await enforceRunLimits(attempt.user_id);
  let result: RunResult;
  try {
    result = await runWithRetry(req);
  } catch (e) {
    translateProviderError(e);
  }

  const response: RunResponse = {
    verdict: result.verdict,
    statusText: result.status.description,
    stdout: result.stdout,
    stderr: result.stderr,
    compileOutput: result.compileOutput,
    exitCode: result.exitCode,
    timeMs: result.timeMs,
    memoryKiB: result.memoryKiB,
    cached: false,
    truncated: result.truncated,
  };

  await admin.from("code_runs").insert({
    attempt_id: attempt.id,
    user_id: attempt.user_id,
    language: language.slug,
    kind: "run",
    verdict: result.verdict,
    time_ms: result.timeMs,
    memory_kib: result.memoryKiB,
    provider_ref: result.providerRef,
  });
  if (result.verdict !== "internal_error") {
    await admin.from("compile_cache").upsert({ key, result: response, created_at: new Date().toISOString() });
  }
  // Opportunistic purge of stale cache rows.
  if (Math.random() < 0.05) {
    await admin.from("compile_cache").delete().lt("created_at", new Date(Date.now() - 3_600_000).toISOString());
  }
  return response;
}

export interface CaseResult {
  name: string;
  hidden: boolean;
  passed: boolean;
  verdict: Verdict;
  timeMs: number;
  memoryKiB: number;
  // Public cases only:
  stdin?: string;
  expected?: string;
  actual?: string;
  stderr?: string;
  compileOutput?: string;
  firstDiffLine?: number;
}

export interface CheckResponse extends StepEvaluation {
  stepId: string;
  passed: boolean;
  cases: CaseResult[];
  platformError?: boolean;
}

/** Check (graded): hidden cases run as one batch and are compared server-side. */
export async function checkStep(attempt: LabAttempt, version: LabVersion, stepId: string, files: SubmittedFile[]): Promise<CheckResponse> {
  const spec = version.spec as CompileLabSpec;
  const step = spec.steps.find((s) => s.id === stepId);
  if (!step) throw new HttpError(400, "Unknown step");
  if (!step.checks.length) throw new HttpError(400, "This step has no checks");

  await enforceCheckLimits(attempt.user_id, attempt.id);
  const language = await loadLanguage(spec.runtime.language);
  const limits = effectiveLimits(spec, language);
  const clean = sanitizeFiles(spec, files);
  const main = mainPath(spec);
  const admin = createAdminClient();

  // Autosave on Check (design §7).
  await admin.from("lab_attempts").update({ draft: { files: clean } }).eq("id", attempt.id);

  type Job = { check: CompileCheck; caseIndex: number; req: RunRequest };
  const jobs: Job[] = [];
  for (const raw of step.checks) {
    const check = raw as CompileCheck;
    check.cases.forEach((c, caseIndex) => {
      jobs.push({
        check,
        caseIndex,
        req: {
          languageId: language.provider_language_id,
          files: withPrelude(clean, main, check.prelude ?? spec.runtime.prelude),
          mainPath: main,
          multiFile: spec.runtime.multiFile,
          stdin: c.stdin,
          args: c.args,
          limits,
        },
      });
    });
  }

  let results: RunResult[];
  try {
    results = await getCompiler().runBatch(jobs.map((j) => j.req));
    // Retry internal errors once (design §5.3); they never count against the learner.
    const retryIdx = results.map((r, i) => (r.verdict === "internal_error" ? i : -1)).filter((i) => i >= 0);
    if (retryIdx.length) {
      const retried = await getCompiler().runBatch(retryIdx.map((i) => jobs[i].req));
      retryIdx.forEach((idx, k) => (results[idx] = retried[k]));
    }
  } catch (e) {
    translateProviderError(e);
  }

  if (results.some((r) => r.verdict === "internal_error")) {
    return {
      stepId,
      passed: false,
      cases: [],
      platformError: true,
      stepsPassed: attempt.steps_passed,
      labCompleted: attempt.status === "completed",
      newlyCompleted: false,
      courseCompleted: false,
      certificateCode: null,
    };
  }

  const cases: CaseResult[] = [];
  const perCheck = new Map<string, boolean>();
  jobs.forEach((job, i) => {
    const r = results[i];
    const c = job.check.cases[job.caseIndex];
    const cmp = r.verdict === "accepted" ? compareOutput(c.stdout, r.stdout, job.check.compare) : { passed: false as const, firstDiffLine: undefined };
    const passed = cmp.passed;
    perCheck.set(job.check.id, (perCheck.get(job.check.id) ?? true) && passed);
    const verdict: Verdict = r.verdict === "accepted" && !passed ? "wrong_answer" : r.verdict;
    cases.push(
      c.hidden
        ? { name: c.name, hidden: true, passed, verdict, timeMs: r.timeMs, memoryKiB: r.memoryKiB }
        : {
            name: c.name,
            hidden: false,
            passed,
            verdict,
            timeMs: r.timeMs,
            memoryKiB: r.memoryKiB,
            stdin: c.stdin,
            expected: c.stdout,
            actual: r.stdout,
            stderr: r.stderr,
            compileOutput: r.compileOutput,
            firstDiffLine: cmp.firstDiffLine,
          },
    );
  });

  const now = new Date().toISOString();
  await admin.from("code_runs").insert(
    jobs.map((job, i) => ({
      attempt_id: attempt.id,
      user_id: attempt.user_id,
      language: language.slug,
      kind: "check",
      verdict: cases[i].verdict,
      time_ms: results[i].timeMs,
      memory_kib: results[i].memoryKiB,
      provider_ref: results[i].providerRef,
      created_at: now,
    })),
  );

  // Recorded with source = server before it is returned (design §29).
  await recordValidation(
    attempt,
    [...perCheck.entries()].map(([checkId, passed]) => ({
      stepId,
      checkId,
      passed,
      source: "server" as const,
      details: { cases: cases.map((c) => ({ name: c.name, passed: c.passed, verdict: c.verdict })) },
    })),
  );
  const stepPassed = [...perCheck.values()].every(Boolean);
  await logEvent({ actorId: attempt.user_id, verb: "checked", objectType: "lab_step", objectId: `${version.lab_id}:${stepId}`, result: { passed: stepPassed }, context: { attemptId: attempt.id } });

  const evaluation = await evaluateAttempt(attempt, version);
  return { stepId, passed: stepPassed, cases, ...evaluation };
}
