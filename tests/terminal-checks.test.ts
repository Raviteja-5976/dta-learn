import { describe, expect, it } from "vitest";
import { buildShellRc, compileTerminalCheck, interpretCheckResult, qpath } from "@/lib/labs/terminal-checks";
import { parseLabYaml, type TerminalCheck, type TerminalLabSpec } from "@/lib/labs/spec";
import { bash, tempHome } from "./helpers";

const check = (c: Record<string, unknown>) => ({ id: "c1", ...c }) as unknown as TerminalCheck;
const run = (c: Record<string, unknown>, home: string) => bash(compileTerminalCheck(check(c)) as string, home).status;

describe("qpath", () => {
  it("expands ~ to $HOME and quotes the rest", () => {
    const home = tempHome();
    const bashHome = bash(`printf '%s' "$HOME"`, home).stdout; // Git Bash on Windows maps paths
    expect(bash(`printf '%s' ${qpath("~/my dir/a'b")}`, home).stdout).toBe(`${bashHome}/my dir/a'b`);
    expect(bash(`printf '%s' ${qpath("~")}`, home).stdout).toBe(bashHome);
  });
});

describe("file checks (real bash)", () => {
  it("file.exists / dir.exists", () => {
    const home = tempHome();
    expect(run({ type: "file.exists", path: "~/a.txt" }, home)).not.toBe(0);
    bash(`mkdir -p "$HOME/d" && touch "$HOME/a.txt"`, home);
    expect(run({ type: "file.exists", path: "~/a.txt" }, home)).toBe(0);
    expect(run({ type: "dir.exists", path: "~/d" }, home)).toBe(0);
    expect(run({ type: "dir.exists", path: "~/a.txt" }, home)).not.toBe(0);
  });

  it("file.contains handles regex and fixed strings, and missing files", () => {
    const home = tempHome();
    expect(run({ type: "file.contains", path: "~/r.md", pattern: "x", fixed: false }, home)).not.toBe(0);
    bash(`printf '# My projects\\nprice: $5 (approx)\\n' > "$HOME/r.md"`, home);
    expect(run({ type: "file.contains", path: "~/r.md", pattern: "^# My projects$", fixed: false }, home)).toBe(0);
    expect(run({ type: "file.contains", path: "~/r.md", pattern: "$5 (approx)", fixed: true }, home)).toBe(0);
    expect(run({ type: "file.contains", path: "~/r.md", pattern: "^nope", fixed: false }, home)).not.toBe(0);
  });

  it("file.equals ignores a trailing newline only", () => {
    const home = tempHome();
    bash(`printf 'a\\nb\\n' > "$HOME/e.txt"`, home);
    expect(run({ type: "file.equals", path: "~/e.txt", content: "a\nb" }, home)).toBe(0);
    expect(run({ type: "file.equals", path: "~/e.txt", content: "a\nb\n" }, home)).toBe(0);
    expect(run({ type: "file.equals", path: "~/e.txt", content: "a b" }, home)).not.toBe(0);
  });

  it("command.output_matches and command.exit_code", () => {
    const home = tempHome();
    expect(run({ type: "command.output_matches", run: "echo hello", pattern: "^hello$" }, home)).toBe(0);
    expect(run({ type: "command.exit_code", run: "false", code: 1 }, home)).toBe(0);
    expect(run({ type: "command.exit_code", run: "true", code: 1 }, home)).not.toBe(0);
  });

  it("script.custom JSON results are interpreted", () => {
    const c = check({ type: "script.custom", script: "x" });
    expect(interpretCheckResult(c, { status: 0, stdout: '{"passed": false, "message": "nope"}', stderr: "" })).toEqual({ passed: false, message: "nope" });
    expect(interpretCheckResult(c, { status: 1, stdout: "not json", stderr: "" }).passed).toBe(false);
    expect(interpretCheckResult(check({ type: "file.exists", path: "x" }), { status: 124, stdout: "", stderr: "" }).message).toMatch(/timed out/);
  });
});

describe("git checks (real bash + git)", () => {
  const hasGit = bash("git --version").status === 0;

  it.skipIf(!hasGit)("branch, commit count, message, merge, clean worktree, remote", () => {
    const home = tempHome();
    const setup = [
      `printf '[user]\\n\\tname = T\\n\\temail = t@x\\n' > "$HOME/.gitconfig"`,
      `git init -q --bare "$HOME/remote.git"`,
      `mkdir -p "$HOME/p" && cd "$HOME/p" && git init -q && git checkout -q -b main`,
      `echo a > a && git add a && git commit -q -m init`,
      `git remote add origin "$HOME/remote.git" && git push -q origin main`,
    ].join(" && ");
    expect(bash(setup, home).status).toBe(0);

    expect(run({ type: "git.branch_exists", repo: "~/p", branch: "feature/x" }, home)).not.toBe(0);
    expect(run({ type: "git.current_branch", repo: "~/p", branch: "main" }, home)).toBe(0);
    bash(`cd "$HOME/p" && git checkout -q -b feature/x && echo b > b && git add b && git commit -q -m "Add login form"`, home);
    expect(run({ type: "git.branch_exists", repo: "~/p", branch: "feature/x" }, home)).toBe(0);
    expect(run({ type: "git.commit_count", repo: "~/p", ref: "feature/x", base: "main", min: 1 }, home)).toBe(0);
    expect(run({ type: "git.commit_count", repo: "~/p", ref: "feature/x", base: "main", min: 2 }, home)).not.toBe(0);
    expect(run({ type: "git.commit_message_matches", repo: "~/p", ref: "feature/x", pattern: "[Ll]ogin" }, home)).toBe(0);
    expect(run({ type: "git.merged", repo: "~/p", branch: "feature/x", into: "main" }, home)).not.toBe(0);
    expect(run({ type: "git.clean_worktree", repo: "~/p" }, home)).toBe(0);
    bash(`echo dirty > "$HOME/p/c"`, home);
    expect(run({ type: "git.clean_worktree", repo: "~/p" }, home)).not.toBe(0);
    bash(`cd "$HOME/p" && rm c && git checkout -q main && git merge -q feature/x && git push -q origin main feature/x`, home);
    expect(run({ type: "git.merged", repo: "~/p", branch: "feature/x", into: "main" }, home)).toBe(0);
    expect(run({ type: "git.remote_has", repo: "~/p", remote: "origin", branch: "feature/x" }, home)).toBe(0);
    expect(run({ type: "git.no_conflict_markers", repo: "~/p" }, home)).toBe(0);
    bash(`cd "$HOME/p" && printf '<<<<<<< HEAD\\nx\\n=======\\ny\\n>>>>>>> b\\n' > a && git add a`, home);
    expect(run({ type: "git.no_conflict_markers", repo: "~/p" }, home)).not.toBe(0);
  });
});

describe("shell rc", () => {
  it("is valid bash and enables history for shell.ran checks", () => {
    const parsed = parseLabYaml(`
runtime: { type: terminal, image: x }
metadata: { slug: t, title: T }
ui: { cwd: /home/user/project }
steps:
  - id: s
    title: S
    checks: [{ type: shell.ran, pattern: grep }]
`);
    expect(parsed.ok).toBe(true);
    const rc = buildShellRc((parsed as { spec: TerminalLabSpec }).spec);
    expect(rc).toContain("PROMPT_COMMAND='history -a'");
    expect(bash(`bash -n <<'EOF'\n${rc}\nEOF`).status).toBe(0);
  });
});
