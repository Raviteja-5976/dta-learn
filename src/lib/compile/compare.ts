import type { CompareOptions } from "@/lib/labs/spec";

/**
 * Output comparison happens in the LMS, not in Judge0 (design §5.3), so the
 * comparison mode is ours: per-line trimming, optional float tolerance,
 * order-insensitive lines and case folding.
 */

function normalizeLines(text: string, opts: CompareOptions): string[] {
  let lines = text.replace(/\r\n?/g, "\n").split("\n");
  if (opts.trim === "lines") lines = lines.map((l) => l.replace(/\s+$/, ""));
  if (opts.trim === "all") lines = lines.map((l) => l.trim().replace(/\s+/g, " "));
  if (opts.trim !== "none") {
    while (lines.length && lines[lines.length - 1] === "") lines.pop();
    if (opts.trim === "all") while (lines.length && lines[0] === "") lines.shift();
  }
  if (!opts.caseSensitive) lines = lines.map((l) => l.toLowerCase());
  if (!opts.ordered) lines = [...lines].sort();
  return lines;
}

const NUM = /^-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?$/;

function tokensEqual(a: string, b: string, tolerance?: number): boolean {
  if (a === b) return true;
  if (tolerance === undefined) return false;
  const ta = a.split(/\s+/);
  const tb = b.split(/\s+/);
  if (ta.length !== tb.length) return false;
  return ta.every((x, i) => {
    const y = tb[i];
    if (x === y) return true;
    if (NUM.test(x) && NUM.test(y)) return Math.abs(Number(x) - Number(y)) <= tolerance;
    return false;
  });
}

export interface CompareResult {
  passed: boolean;
  /** First differing line (1-based) for the diff shown on public cases. */
  firstDiffLine?: number;
}

export function compareOutput(expected: string, actual: string, opts: CompareOptions): CompareResult {
  const e = normalizeLines(expected, opts);
  const a = normalizeLines(actual, opts);
  const n = Math.max(e.length, a.length);
  for (let i = 0; i < n; i++) {
    if (e[i] === undefined || a[i] === undefined || !tokensEqual(e[i], a[i], opts.floatTolerance)) {
      return { passed: false, firstDiffLine: i + 1 };
    }
  }
  return { passed: true };
}
