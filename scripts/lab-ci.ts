/**
 * Lab CI (design §6, "Authoring without backend changes").
 *
 *   npm run labs:ci            # validate every labs/<slug>/lab.yaml
 *
 * Terminal labs: in a throw-away $HOME, run the init scripts with real bash,
 * then for each step assert its checks FAIL before the reference solution and
 * PASS after it. (The real sandbox is Debian; this runs on the host's bash,
 * so prefer Linux CI. Windows/macOS differences are reported as warnings.)
 *
 * Compile labs: if JUDGE0_URL is set, assert the starter code fails at least
 * one case and the reference solution passes every case.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { isCompileSpec, isTerminalSpec, parseLabYaml, type CompileCheck, type CompileLabSpec, type TerminalCheck, type TerminalLabSpec } from "../src/lib/labs/spec";
import { compileTerminalCheck, buildInitActions, mkdirForFile, absolutePath } from "../src/lib/labs/terminal-checks";
import { compareOutput } from "../src/lib/compile/compare";
import { Judge0Provider } from "../src/lib/compile/judge0";

const strictHost = process.platform === "linux";
let failures = 0;
let warnings = 0;

function fail(msg: string) {
  failures++;
  console.log(`    ✗ ${msg}`);
}
function warn(msg: string) {
  warnings++;
  console.log(`    ! ${msg}`);
}

function bash(script: string, home: string): number {
  try {
    execFileSync("bash", ["-c", script], { env: { ...process.env, HOME: home, LANG: "C.UTF-8" }, cwd: home, stdio: "pipe", timeout: 20_000 });
    return 0;
  } catch (e) {
    return (e as { status?: number }).status ?? 1;
  }
}

function runTerminalLab(slug: string, spec: TerminalLabSpec) {
  const home = mkdtempSync(path.join(tmpdir(), `labci-${slug}-`)).replace(/\\/g, "/");
  try {
    for (const a of buildInitActions(spec)) {
      if (a.kind === "run" && a.script) {
        if (bash(a.script, home) !== 0) fail(`init script failed`);
      } else if (a.kind === "file" && a.path) {
        bash(`${mkdirForFile(a.path)}\ncat > ${JSON.stringify(absolutePath(a.path, home))} <<'__LABCI__'\n${a.content}\n__LABCI__`, home);
      }
    }
    for (const step of spec.steps) {
      const checks = step.checks.filter((c) => c.type !== "challenge.answer") as TerminalCheck[];
      if (!checks.length) continue;
      if (!step.solution) {
        warn(`step "${step.id}" has checks but no solution (reset-to-step and CI can't cover it)`);
        continue;
      }
      // A step passes only when ALL its checks pass, so the step as a whole
      // must fail before the solution (single checks like a clean worktree may
      // legitimately pass already).
      const passesBefore = checks.every((c) => {
        const script = compileTerminalCheck(c);
        return script ? bash(script, home) === 0 : true;
      });
      if (passesBefore) {
        const msg = `step "${step.id}" already passes BEFORE its solution`;
        if (strictHost) fail(msg);
        else warn(`${msg} (host is ${process.platform}; verify on Linux)`);
      }
      if (bash(`cd "$HOME" || exit 1\n${step.solution}`, home) !== 0) fail(`step "${step.id}" solution exited non-zero`);
      for (const c of checks) {
        const script = compileTerminalCheck(c);
        if (script && bash(script, home) !== 0) fail(`step "${step.id}" check "${c.id}" (${c.type}) fails AFTER the solution`);
      }
    }
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

async function runCompileLab(slug: string, spec: CompileLabSpec, provider: Judge0Provider, languageId: number) {
  if (!spec.solution && !spec.steps.every((s) => s.solution)) {
    warn("no reference solution");
    return;
  }
  const main = (spec.files.find((f) => f.main) ?? spec.files[0]).path;
  const filesFor = (overrides: Record<string, string> | null, prelude?: string) =>
    spec.files.map((f) => {
      const content = overrides?.[f.path] ?? f.content;
      return { path: f.path, content: f.path === main && prelude ? `${prelude}\n${content}` : content };
    });

  for (const step of spec.steps) {
    const solution = step.solution ?? spec.solution;
    if (!solution) {
      warn(`step "${step.id}" has no reference solution`);
      continue;
    }
    for (const raw of step.checks) {
      const check = raw as CompileCheck;
      for (const which of ["starter", "solution"] as const) {
        const reqs = check.cases.map((c) => ({
          languageId,
          files: filesFor(which === "solution" ? solution : null, check.prelude ?? spec.runtime.prelude),
          mainPath: main,
          multiFile: spec.runtime.multiFile,
          stdin: c.stdin,
          args: c.args,
          limits: { cpuSeconds: spec.runtime.limits.cpuSeconds ?? 5, wallSeconds: spec.runtime.limits.wallSeconds ?? 10, memoryMiB: spec.runtime.limits.memoryMiB ?? 256 },
        }));
        const results = await provider.runBatch(reqs);
        const passed = results.map((r, i) => r.verdict === "accepted" && compareOutput(check.cases[i].stdout, r.stdout, check.compare).passed);
        if (which === "starter" && passed.every(Boolean)) fail(`step "${step.id}" check "${check.id}": the starter code already passes every case`);
        if (which === "solution") {
          passed.forEach((ok, i) => {
            if (!ok) fail(`step "${step.id}" case "${check.cases[i].name}": solution failed (${results[i].verdict}) ${results[i].compileOutput || results[i].stderr || ""}`.trim());
          });
        }
      }
    }
  }
}

// Judge0 CE ids from the reference-data migration (override with LABCI_LANGUAGE_IDS='{"python3":71}').
const LANGUAGE_IDS: Record<string, number> = {
  python3: 71, javascript: 63, typescript: 74, java: 62, c: 50, cpp: 54, go: 60, rust: 73, csharp: 51, kotlin: 78, sqlite: 82, multi: 89,
  ...(process.env.LABCI_LANGUAGE_IDS ? JSON.parse(process.env.LABCI_LANGUAGE_IDS) : {}),
};

async function main() {
  const dir = path.join(process.cwd(), "labs");
  const slugs = readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  const judge0 = process.env.JUDGE0_URL ? new Judge0Provider(process.env.JUDGE0_URL.replace(/\/+$/, ""), process.env.JUDGE0_API_KEY ?? "") : null;
  if (!judge0) console.log("JUDGE0_URL not set: compile labs are schema-checked only.\n");

  for (const slug of slugs) {
    console.log(`• ${slug}`);
    const parsed = parseLabYaml(readFileSync(path.join(dir, slug, "lab.yaml"), "utf8"));
    if (!parsed.ok) {
      parsed.errors.forEach(fail);
      continue;
    }
    const spec = parsed.spec;
    if (spec.metadata.slug !== slug) fail(`metadata.slug "${spec.metadata.slug}" must equal the folder name`);
    if (isTerminalSpec(spec)) runTerminalLab(slug, spec);
    else if (isCompileSpec(spec) && judge0) await runCompileLab(slug, spec, judge0, LANGUAGE_IDS[spec.runtime.language] ?? 0);
  }

  console.log(`\n${failures} failure(s), ${warnings} warning(s).`);
  process.exit(failures ? 1 : 0);
}

void main();
