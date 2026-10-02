import { shellQuote } from "@/lib/terminal-sandbox/fs-bridge";
import type { TerminalCheck, TerminalLabSpec } from "./spec";

/**
 * Terminal checks are pure functions (design §6): each check compiles to a
 * bash script whose exit status 0 means "passed". They run in the learner's
 * VM through the hidden exec channel, so they are client-verified.
 */

/** Quote a path, expanding a leading ~ to $HOME. */
export function qpath(path: string): string {
  if (path === "~") return '"$HOME"';
  if (path.startsWith("~/")) return `"$HOME"/${shellQuote(path.slice(2))}`;
  return shellQuote(path);
}

function git(repo: string): string {
  return `git -C ${qpath(repo)}`;
}

/** Compile one check to bash. Returns null for server-verified checks. */
export function compileTerminalCheck(check: TerminalCheck): string | null {
  switch (check.type) {
    case "file.exists":
      return `test -f ${qpath(check.path)}`;
    case "dir.exists":
      return `test -d ${qpath(check.path)}`;
    case "file.contains":
      return `test -f ${qpath(check.path)} && grep -${check.fixed ? "F" : "E"}q -- ${shellQuote(check.pattern)} ${qpath(check.path)}`;
    case "file.equals":
      // $(…) strips trailing newlines on both sides, so a final newline never matters.
      return `test -f ${qpath(check.path)} && [ "$(cat -- ${qpath(check.path)})" = "$(printf '%s' ${shellQuote(check.content)})" ]`;
    case "file.mode":
      return check.mode === "+x"
        ? `test -x ${qpath(check.path)}`
        : `[ "$(stat -c %a -- ${qpath(check.path)})" = ${shellQuote(check.mode.replace(/^0(?=\d{3}$)/, ""))} ]`;
    case "git.branch_exists":
      return `${git(check.repo)} rev-parse --verify --quiet ${shellQuote(`refs/heads/${check.branch}`)} >/dev/null`;
    case "git.current_branch":
      return `[ "$(${git(check.repo)} symbolic-ref --short -q HEAD)" = ${shellQuote(check.branch)} ]`;
    case "git.commit_count": {
      const range = check.base ? `${check.base}..${check.ref}` : check.ref;
      const lines = [`n=$(${git(check.repo)} rev-list --count ${shellQuote(range)} 2>/dev/null) || exit 1`];
      if (check.min !== undefined) lines.push(`[ "$n" -ge ${check.min} ] || exit 1`);
      if (check.max !== undefined) lines.push(`[ "$n" -le ${check.max} ] || exit 1`);
      if (check.min === undefined && check.max === undefined) lines.push(`[ "$n" -ge 1 ] || exit 1`);
      lines.push("exit 0");
      return lines.join("\n");
    }
    case "git.commit_message_matches":
      return `${git(check.repo)} log -1 --format=%B ${shellQuote(check.ref)} 2>/dev/null | grep -Eq -- ${shellQuote(check.pattern)}`;
    case "git.merged":
      return `${git(check.repo)} merge-base --is-ancestor ${shellQuote(`refs/heads/${check.branch}`)} ${shellQuote(check.into)}`;
    case "git.no_conflict_markers":
      return [
        `${git(check.repo)} rev-parse --git-dir >/dev/null 2>&1 || exit 1`,
        `if ${git(check.repo)} grep -qE '^(<{7}|>{7})( |$)|^={7}$' -- . 2>/dev/null; then exit 1; fi`,
        "exit 0",
      ].join("\n");
    case "git.clean_worktree":
      return `out=$(${git(check.repo)} status --porcelain 2>/dev/null) || exit 1\n[ -z "$out" ]`;
    case "git.remote_has":
      return `${git(check.repo)} ls-remote --exit-code --heads ${shellQuote(check.remote)} ${shellQuote(check.branch)} >/dev/null 2>&1`;
    case "command.exit_code":
      return `( cd "$HOME" && ${check.run} ) >/dev/null 2>&1\n[ $? -eq ${check.code} ]`;
    case "command.output_matches":
      return `out=$( cd "$HOME" && ${check.run} 2>&1 )\nprintf '%s\\n' "$out" | grep -Eq -- ${shellQuote(check.pattern)}`;
    case "process.running":
      return `pgrep -f -- ${shellQuote(check.name)} >/dev/null 2>&1`;
    case "sql.result_equals":
      return `test -f ${qpath(check.db)} || exit 1\n[ "$(sqlite3 -batch -noheader ${qpath(check.db)} ${shellQuote(check.query)} 2>/dev/null)" = "$(printf '%s' ${shellQuote(check.expected)})" ]`;
    case "sql.row_count": {
      const q = `SELECT COUNT(*) FROM "${check.table.replace(/"/g, '""')}";`;
      const lines = [`n=$(sqlite3 -batch -noheader ${qpath(check.db)} ${shellQuote(q)} 2>/dev/null) || exit 1`];
      if (check.equals !== undefined) lines.push(`[ "$n" -eq ${check.equals} ] || exit 1`);
      if (check.min !== undefined) lines.push(`[ "$n" -ge ${check.min} ] || exit 1`);
      lines.push("exit 0");
      return lines.join("\n");
    }
    case "shell.ran":
      // Needs `history -a` after each command (enabled by shell.history or automatically).
      return `grep -Eq -- ${shellQuote(check.pattern)} "$HOME/.bash_history" 2>/dev/null`;
    case "script.custom":
      return check.script;
    case "challenge.answer":
      return null;
  }
}

/** Human-readable label for a check, shown in the Steps panel. */
export function describeTerminalCheck(check: TerminalCheck): string {
  if (check.title) return check.title;
  switch (check.type) {
    case "file.exists":
      return `File ${check.path} exists`;
    case "dir.exists":
      return `Folder ${check.path} exists`;
    case "file.contains":
      return `${check.path} contains “${check.pattern}”`;
    case "file.equals":
      return `${check.path} has the expected content`;
    case "file.mode":
      return check.mode === "+x" ? `${check.path} is executable` : `${check.path} has mode ${check.mode}`;
    case "git.branch_exists":
      return `Branch ${check.branch} exists`;
    case "git.current_branch":
      return `You are on branch ${check.branch}`;
    case "git.commit_count":
      return check.base ? `New commits on ${check.ref} since ${check.base}` : `Commits on ${check.ref}`;
    case "git.commit_message_matches":
      return `Latest commit message matches “${check.pattern}”`;
    case "git.merged":
      return `${check.branch} is merged into ${check.into}`;
    case "git.no_conflict_markers":
      return "No merge conflict markers left";
    case "git.clean_worktree":
      return "Working tree is clean";
    case "git.remote_has":
      return `${check.branch} is pushed to ${check.remote}`;
    case "command.exit_code":
      return "Command succeeds";
    case "command.output_matches":
      return "Command output looks right";
    case "process.running":
      return `Process ${check.name} is running`;
    case "sql.result_equals":
      return "Query returns the expected rows";
    case "sql.row_count":
      return `Table ${check.table} has the right number of rows`;
    case "shell.ran":
      return "You ran the right command";
    case "script.custom":
      return "Custom check";
    case "challenge.answer":
      return "Your answer";
  }
}

/** Wrap a compiled check with a 10 s timeout (design §6, script.custom). */
export function withTimeout(script: string, seconds = 10): string {
  return `timeout ${seconds} bash -c ${shellQuote(script)}`;
}

/**
 * Interpret a check's exec result. script.custom may print
 * {"passed": bool, "message": str}; everything else uses the exit status.
 */
export function interpretCheckResult(
  check: TerminalCheck,
  result: { status: number; stdout: string; stderr: string },
): { passed: boolean; message?: string } {
  if (check.type === "script.custom") {
    const last = result.stdout.trim().split("\n").pop() ?? "";
    try {
      const parsed = JSON.parse(last) as { passed?: unknown; message?: unknown };
      if (typeof parsed.passed === "boolean") {
        return { passed: parsed.passed, message: typeof parsed.message === "string" ? parsed.message : undefined };
      }
    } catch {
      /* not JSON: fall through to the exit status */
    }
  }
  if (result.status === 124) return { passed: false, message: "The check timed out." };
  return { passed: result.status === 0, message: result.status === 0 ? undefined : check.fail };
}

function needsHistory(spec: TerminalLabSpec): boolean {
  return spec.shell.history || spec.steps.some((s) => s.checks.some((c) => c.type === "shell.ran"));
}

/**
 * The shell rc (design §4.12): sourced once before the first prompt through
 * PROMPT_COMMAND, using bash builtins only — every new binary costs seconds
 * on a cold start.
 */
export function buildShellRc(spec: TerminalLabSpec): string {
  const cwd = spec.ui.cwd;
  const lines = [
    "unset PROMPT_COMMAND",
    `PS1='\\[\\e[1;38;5;75m\\]\\u@sandbox\\[\\e[0m\\]:\\[\\e[1;38;5;222m\\]\\w\\[\\e[0m\\]\\$ '`,
    "alias ls='ls --color=auto' ll='ls -alF --color=auto' la='ls -A --color=auto' grep='grep --color=auto'",
    `if [ ! -f "$HOME/.gitconfig" ]; then printf '[user]\\n\\tname = Learner\\n\\temail = learner@sandbox.local\\n[init]\\n\\tdefaultBranch = main\\n[advice]\\n\\tdetachedHead = false\\n' > "$HOME/.gitconfig"; fi`,
  ];
  if (cwd) lines.push(`if [ -d ${qpath(cwd)} ]; then cd ${qpath(cwd)}; fi`);
  if (spec.shell.rc) lines.push(spec.shell.rc);
  if (needsHistory(spec)) lines.push("PROMPT_COMMAND='history -a'");
  return lines.join("\n") + "\n";
}

export interface InitAction {
  kind: "run" | "file";
  script?: string;
  path?: string;
  content?: string;
  mode?: string;
}

/** Hidden setup actions, run in order once the VM exists. */
export function buildInitActions(spec: TerminalLabSpec, extraFiles: { path: string; content: string }[] = []): InitAction[] {
  const actions: InitAction[] = [];
  for (const entry of spec.init) {
    if ("run" in entry) actions.push({ kind: "run", script: `cd "$HOME" || exit 1\n${entry.run}` });
    else actions.push({ kind: "file", path: entry.file, content: entry.content, mode: entry.mode });
  }
  for (const f of extraFiles) actions.push({ kind: "file", path: f.path, content: f.content });
  return actions;
}

/** Script that creates a file's parent dir; the content is written through the fs bridge. */
export function mkdirForFile(path: string): string {
  const i = path.lastIndexOf("/");
  const parent = i < 0 ? "~" : i === 0 ? "/" : path.slice(0, i);
  return `mkdir -p -- ${qpath(parent)}`;
}

/** Absolute in-VM path for a spec path (expands ~). */
export function absolutePath(path: string, home = "/home/user"): string {
  if (path === "~") return home;
  if (path.startsWith("~/")) return `${home}/${path.slice(2)}`;
  if (path.startsWith("/")) return path;
  return `${home}/${path}`;
}
