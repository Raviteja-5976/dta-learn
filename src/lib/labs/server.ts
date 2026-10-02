import "server-only";
import { randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/server";
import { HttpError } from "@/lib/http";
import { completeItem } from "@/lib/progress";
import { logEvent } from "@/lib/events";
import { generateChallenge } from "./challenges";
import {
  gradedStepIds,
  isCompileSpec,
  isTerminalSpec,
  type CompileLabSpec,
  type LabSpec,
  type TerminalCheck,
  type TerminalLabSpec,
} from "./spec";
import { buildInitActions, buildShellRc, compileTerminalCheck, describeTerminalCheck, withTimeout, type InitAction } from "./terminal-checks";
import type { CompileLanguage, Item, Lab, LabAttempt, LabVersion, SandboxImage } from "@/lib/types";

export interface LoadedLab {
  lab: Lab;
  version: LabVersion;
}

export async function loadCurrentLab(labId: string): Promise<LoadedLab | null> {
  const admin = createAdminClient();
  const { data: lab } = await admin.from("labs").select("*").eq("id", labId).maybeSingle<Lab>();
  if (!lab?.current_version_id) return null;
  const { data: version } = await admin.from("lab_versions").select("*").eq("id", lab.current_version_id).maybeSingle<LabVersion>();
  if (!version) return null;
  return { lab, version };
}

export async function loadAttempt(attemptId: string, userId: string): Promise<{ attempt: LabAttempt; version: LabVersion; lab: Lab; item: Item | null }> {
  const admin = createAdminClient();
  const { data: attempt } = await admin.from("lab_attempts").select("*").eq("id", attemptId).maybeSingle<LabAttempt>();
  if (!attempt || attempt.user_id !== userId) throw new HttpError(404, "Lab attempt not found");
  const { data: version } = await admin.from("lab_versions").select("*").eq("id", attempt.lab_version_id).single<LabVersion>();
  if (!version) throw new HttpError(404, "Lab version not found");
  const [{ data: lab }, itemRes] = await Promise.all([
    admin.from("labs").select("*").eq("id", version.lab_id).single<Lab>(),
    attempt.item_id ? admin.from("items").select("*").eq("id", attempt.item_id).maybeSingle<Item>() : Promise.resolve({ data: null }),
  ]);
  if (!lab) throw new HttpError(404, "Lab not found");
  return { attempt, version, lab, item: (itemRes.data as Item | null) ?? null };
}

/** Start or resume the learner's attempt at the item's current lab version. */
export async function startAttempt(userId: string, item: Item, version: LabVersion): Promise<LabAttempt> {
  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("lab_attempts")
    .select("*")
    .eq("user_id", userId)
    .eq("lab_version_id", version.id)
    .eq("item_id", item.id)
    .in("status", ["active", "completed"])
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle<LabAttempt>();
  if (existing) return existing;

  // Carry the learner's code forward from an attempt on an older version.
  let draft: LabAttempt["draft"] = null;
  if (version.runtime_type === "compile") {
    const { data: previous } = await admin
      .from("lab_attempts")
      .select("draft")
      .eq("user_id", userId)
      .eq("item_id", item.id)
      .not("draft", "is", null)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ draft: LabAttempt["draft"] }>();
    const spec = version.spec as CompileLabSpec;
    const paths = new Set(spec.files.filter((f) => f.editable).map((f) => f.path));
    const carried = previous?.draft?.files?.filter((f) => paths.has(f.path));
    if (carried?.length) draft = { files: carried };
  }

  const { data, error } = await admin
    .from("lab_attempts")
    .insert({
      user_id: userId,
      lab_version_id: version.id,
      item_id: item.id,
      course_id: item.course_id,
      runtime_type: version.runtime_type,
      seed: randomBytes(8).toString("hex"),
      draft,
    })
    .select("*")
    .single<LabAttempt>();
  if (error || !data) throw new Error(error?.message ?? "Could not start the lab");
  await logEvent({ actorId: userId, verb: "started", objectType: "lab", objectId: version.lab_id, context: { attemptId: data.id, version: version.version } });
  return data;
}

export function revealedHints(spec: LabSpec, attempt: LabAttempt): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const step of spec.steps) {
    const n = Math.min(attempt.hints_used?.[step.id] ?? 0, step.hints.length);
    if (n > 0) out[step.id] = step.hints.slice(0, n);
  }
  return out;
}

// ── Terminal payload (design §29: POST /labs/:id/attempts for terminal) ──────
export interface TerminalCheckPayload {
  id: string;
  type: TerminalCheck["type"];
  label: string;
  title?: string;
  fail?: string;
  /** Bash script; null for server-verified challenge checks. */
  script: string | null;
  challenge?: { prompt: string; answerHint: string };
}

export interface TerminalPayload {
  attemptId: string;
  lab: { id: string; slug: string; title: string; version: number; description?: string };
  item: { id: string; title: string; courseId: string } | null;
  image: { url: string; type: SandboxImage["image_type"]; slug: string; version: number; bootManifest: string[] | null };
  shellRc: string;
  init: InitAction[];
  cwd: string | null;
  steps: Array<{ id: string; title: string; instructions: string; cmds: string[]; hintCount: number; checks: TerminalCheckPayload[] }>;
  cheatsheet: TerminalLabSpec["ui"]["cheatsheet"] | null;
  idleTimeoutMinutes: number;
  stepsPassed: string[];
  hints: Record<string, string[]>;
  status: LabAttempt["status"];
}

export async function resolveImage(ref: string): Promise<SandboxImage> {
  const [slug, versionStr] = ref.split(":");
  let query = createAdminClient().from("sandbox_images").select("*").eq("slug", slug).eq("status", "active");
  query = versionStr ? query.eq("version", Number(versionStr)) : query.order("version", { ascending: false });
  const { data } = await query.limit(1).maybeSingle<SandboxImage>();
  if (!data) throw new HttpError(500, `Sandbox image "${ref}" is not registered. Add it in Studio → Settings.`);
  return data;
}

export async function buildTerminalPayload(attempt: LabAttempt, version: LabVersion, lab: Lab, item: Item | null): Promise<TerminalPayload> {
  const spec = version.spec;
  if (!isTerminalSpec(spec)) throw new HttpError(400, "Not a terminal lab");
  const image = await resolveImage(spec.runtime.image);

  // Seeded challenges: generate the learner's personal dataset from the attempt seed.
  const challengeFiles: { path: string; content: string }[] = [];
  const steps = spec.steps.map((step) => ({
    id: step.id,
    title: step.title,
    instructions: step.instructions,
    cmds: step.cmds,
    hintCount: step.hints.length,
    checks: step.checks.map((raw): TerminalCheckPayload => {
      const check = raw as TerminalCheck;
      if (check.type === "challenge.answer") {
        const instance = generateChallenge(check.generator, attempt.seed ?? attempt.id);
        if (instance) challengeFiles.push(...instance.files);
        return {
          id: check.id,
          type: check.type,
          label: describeTerminalCheck(check),
          title: check.title,
          fail: check.fail,
          script: null,
          challenge: instance ? { prompt: instance.prompt, answerHint: instance.answerHint } : { prompt: `Unknown challenge "${check.generator}"`, answerHint: "" },
        };
      }
      const script = compileTerminalCheck(check);
      return { id: check.id, type: check.type, label: describeTerminalCheck(check), title: check.title, fail: check.fail, script: script ? withTimeout(script) : null };
    }),
  }));

  return {
    attemptId: attempt.id,
    lab: { id: lab.id, slug: lab.slug, title: spec.metadata.title, version: version.version, description: spec.metadata.description },
    item: item ? { id: item.id, title: item.title, courseId: item.course_id } : null,
    image: { url: image.url, type: image.image_type, slug: image.slug, version: image.version, bootManifest: image.boot_manifest },
    shellRc: buildShellRc(spec),
    init: buildInitActions(spec, challengeFiles),
    cwd: spec.ui.cwd ?? null,
    steps,
    cheatsheet: spec.ui.cheatsheet ?? null,
    idleTimeoutMinutes: spec.runtime.limits.idleTimeoutMinutes ?? 30,
    stepsPassed: attempt.steps_passed ?? [],
    hints: revealedHints(spec, attempt),
    status: attempt.status,
  };
}

// ── Compile payload ─────────────────────────────────────────────────────────
export interface CompilePayload {
  attemptId: string;
  lab: { id: string; slug: string; title: string; version: number; description?: string };
  language: { slug: string; label: string; monaco: string };
  files: Array<{ path: string; content: string; editable: boolean; main: boolean }>;
  steps: Array<{
    id: string;
    title: string;
    instructions: string;
    hintCount: number;
    publicCases: Array<{ name: string; stdin: string; stdout: string }>;
    hiddenCount: number;
  }>;
  limits: { cpuSeconds: number; wallSeconds: number; memoryMiB: number };
  stepsPassed: string[];
  hints: Record<string, string[]>;
  status: LabAttempt["status"];
}

export async function loadLanguage(slug: string): Promise<CompileLanguage> {
  const { data } = await createAdminClient().from("compile_languages").select("*").eq("slug", slug).maybeSingle<CompileLanguage>();
  if (!data) throw new HttpError(500, `Language "${slug}" is not configured.`);
  if (!data.enabled) throw new HttpError(503, `${data.label} is temporarily disabled.`);
  return data;
}

export function effectiveLimits(spec: CompileLabSpec, language: CompileLanguage) {
  return {
    cpuSeconds: spec.runtime.limits.cpuSeconds ?? language.default_limits.cpuSeconds ?? 2,
    wallSeconds: spec.runtime.limits.wallSeconds ?? language.default_limits.wallSeconds ?? 5,
    memoryMiB: spec.runtime.limits.memoryMiB ?? language.default_limits.memoryMiB ?? 256,
    maxProcesses: spec.runtime.limits.maxProcesses,
    maxOutputKiB: spec.runtime.limits.maxOutputKiB,
  };
}

/** Starter files merged with the learner's saved draft (read-only files always come from the spec). */
export function mergeDraft(spec: CompileLabSpec, draft: LabAttempt["draft"]) {
  const saved = new Map((draft?.files ?? []).map((f) => [f.path, f.content]));
  return spec.files.map((f) => ({
    path: f.path,
    content: f.editable && saved.has(f.path) ? (saved.get(f.path) as string) : f.content,
    editable: f.editable,
    main: f.main,
  }));
}

export async function buildCompilePayload(attempt: LabAttempt, version: LabVersion, lab: Lab): Promise<CompilePayload> {
  const spec = version.spec;
  if (!isCompileSpec(spec)) throw new HttpError(400, "Not a compile lab");
  const language = await loadLanguage(spec.runtime.language);
  const limits = effectiveLimits(spec, language);
  return {
    attemptId: attempt.id,
    lab: { id: lab.id, slug: lab.slug, title: spec.metadata.title, version: version.version, description: spec.metadata.description },
    language: { slug: language.slug, label: language.label, monaco: language.monaco_language },
    files: mergeDraft(spec, attempt.draft),
    steps: spec.steps.map((step) => {
      const cases = step.checks.flatMap((c) => c.cases);
      return {
        id: step.id,
        title: step.title,
        instructions: step.instructions,
        hintCount: step.hints.length,
        // Hidden cases never leave the server (design §5.4).
        publicCases: cases.filter((c) => !c.hidden).map((c) => ({ name: c.name, stdin: c.stdin, stdout: c.stdout })),
        hiddenCount: cases.filter((c) => c.hidden).length,
      };
    }),
    limits: { cpuSeconds: limits.cpuSeconds, wallSeconds: limits.wallSeconds, memoryMiB: limits.memoryMiB },
    stepsPassed: attempt.steps_passed ?? [],
    hints: revealedHints(spec, attempt),
    status: attempt.status,
  };
}

// ── Step evaluation shared by both runtimes ─────────────────────────────────
export async function recordValidation(
  attempt: LabAttempt,
  rows: Array<{ stepId: string; checkId: string; passed: boolean; source: "server" | "client"; details?: unknown }>,
): Promise<void> {
  if (!rows.length) return;
  const { error } = await createAdminClient()
    .from("validation_results")
    .insert(
      rows.map((r) => ({
        attempt_id: attempt.id,
        user_id: attempt.user_id,
        step_id: r.stepId,
        check_id: r.checkId,
        passed: r.passed,
        source: r.source,
        details: r.details ?? null,
      })),
    );
  if (error) throw new Error(error.message);
}

export interface StepEvaluation {
  stepsPassed: string[];
  labCompleted: boolean;
  newlyCompleted: boolean;
  courseCompleted: boolean;
  certificateCode: string | null;
}

/**
 * A step passes when the latest result of every one of its checks passed.
 * The lab completes when every graded step passes. Evidence is "server"
 * only if every check that counted was server-verified.
 */
export async function evaluateAttempt(attempt: LabAttempt, version: LabVersion): Promise<StepEvaluation> {
  const admin = createAdminClient();
  const spec = version.spec;
  const { data: results } = await admin
    .from("validation_results")
    .select("step_id, check_id, passed, source, created_at")
    .eq("attempt_id", attempt.id)
    .order("created_at", { ascending: false })
    .limit(2000);

  const latest = new Map<string, { passed: boolean; source: string }>();
  for (const r of (results ?? []) as { step_id: string; check_id: string; passed: boolean; source: string }[]) {
    const key = `${r.step_id}\u0000${r.check_id}`;
    if (!latest.has(key)) latest.set(key, { passed: r.passed, source: r.source });
  }

  const stepsPassed: string[] = [];
  let allServer = true;
  for (const step of spec.steps) {
    if (!step.checks.length) continue;
    const ok = step.checks.every((c) => latest.get(`${step.id}\u0000${(c as { id: string }).id}`)?.passed);
    if (ok) {
      stepsPassed.push(step.id);
      for (const c of step.checks) {
        if (latest.get(`${step.id}\u0000${(c as { id: string }).id}`)?.source !== "server") allServer = false;
      }
    }
  }

  const graded = gradedStepIds(spec);
  const labCompleted = graded.length > 0 && graded.every((id) => stepsPassed.includes(id));
  const becameComplete = labCompleted && attempt.status !== "completed";

  await admin
    .from("lab_attempts")
    .update({
      steps_passed: stepsPassed,
      ...(becameComplete ? { status: "completed", completed_at: new Date().toISOString() } : {}),
    })
    .eq("id", attempt.id);

  let outcome = { newlyCompleted: false, courseCompleted: false, certificateCode: null as string | null };
  if (labCompleted && attempt.item_id) {
    const { data: item } = await admin.from("items").select("id, course_id, kind").eq("id", attempt.item_id).maybeSingle<Pick<Item, "id" | "course_id" | "kind">>();
    if (item) outcome = await completeItem(attempt.user_id, item, { evidence: allServer ? "server" : "client" });
  }
  if (becameComplete) {
    await logEvent({ actorId: attempt.user_id, verb: "passed", objectType: "lab", objectId: version.lab_id, context: { attemptId: attempt.id } });
  }
  return { stepsPassed, labCompleted, ...outcome };
}
