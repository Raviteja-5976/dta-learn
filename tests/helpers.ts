import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/** Run a script through REAL bash (design §4.13) and return status and stdout. */
export function bash(script: string, home?: string): { status: number; stdout: string } {
  try {
    const stdout = execFileSync("bash", ["-c", script], {
      env: { ...process.env, ...(home ? { HOME: home } : {}), LANG: "C.UTF-8" },
      cwd: home,
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8",
    });
    return { status: 0, stdout };
  } catch (e) {
    const err = e as { status?: number; stdout?: string };
    return { status: err.status ?? 1, stdout: err.stdout ?? "" };
  }
}

export function tempHome(): string {
  return mkdtempSync(path.join(tmpdir(), "dta-test-")).replace(/\\/g, "/");
}
