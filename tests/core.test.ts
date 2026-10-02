import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { compareOutput } from "@/lib/compile/compare";
import { crc32, createZip } from "@/lib/compile/zip";
import { COMPILE_LAB_TEMPLATE, TERMINAL_LAB_TEMPLATE, gradedStepIds, parseLabYaml } from "@/lib/labs/spec";
import { CHALLENGE_GENERATORS, generateChallenge, normalizeAnswer } from "@/lib/labs/challenges";
import { generateCertificateCode, isValidCertificateCode } from "@/lib/certificate-code";
import { estimateReadingMinutes, parseBlocks } from "@/lib/blocks/schema";

const opts = { trim: "lines" as const, ordered: true, caseSensitive: true };

describe("compareOutput", () => {
  it("ignores trailing whitespace and trailing blank lines", () => {
    expect(compareOutput("0 1\n", "0 1   \n\n", opts).passed).toBe(true);
  });
  it("reports the first differing line", () => {
    expect(compareOutput("a\nb\nc\n", "a\nx\nc\n", opts)).toEqual({ passed: false, firstDiffLine: 2 });
    expect(compareOutput("a\nb\n", "a\n", opts)).toEqual({ passed: false, firstDiffLine: 2 });
  });
  it("supports unordered, case-insensitive and float tolerance", () => {
    expect(compareOutput("b\na\n", "a\nb\n", { ...opts, ordered: false }).passed).toBe(true);
    expect(compareOutput("Hello\n", "hello\n", { ...opts, caseSensitive: false }).passed).toBe(true);
    expect(compareOutput("3.14159\n", "3.1416\n", { ...opts, floatTolerance: 0.001 }).passed).toBe(true);
    expect(compareOutput("3.14\n", "3.2\n", { ...opts, floatTolerance: 0.001 }).passed).toBe(false);
  });
  it("trim none is exact", () => {
    expect(compareOutput("a\n", "a \n", { ...opts, trim: "none" }).passed).toBe(false);
  });
});

describe("zip", () => {
  it("computes the standard CRC-32", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });
  it("writes local headers and an end-of-central-directory record", () => {
    const zip = createZip([{ path: "run", content: "#!/bin/bash\necho hi\n" }, { path: "main.py", content: "print(1)" }]);
    const view = new DataView(zip.buffer);
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    expect(view.getUint32(zip.length - 22, true)).toBe(0x06054b50);
    expect(view.getUint16(zip.length - 22 + 10, true)).toBe(2);
  });
});

describe("lab spec", () => {
  it("parses both templates and assigns check ids", () => {
    for (const t of [TERMINAL_LAB_TEMPLATE, COMPILE_LAB_TEMPLATE]) {
      const r = parseLabYaml(t);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.spec.steps.every((s) => s.checks.every((c) => (c as { id?: string }).id))).toBe(true);
    }
  });

  it("parses every lab in labs/", () => {
    const dir = path.join(process.cwd(), "labs");
    for (const slug of readdirSync(dir)) {
      const r = parseLabYaml(readFileSync(path.join(dir, slug, "lab.yaml"), "utf8"));
      expect(r.ok, `${slug}: ${r.ok ? "" : r.errors.join("; ")}`).toBe(true);
      if (r.ok) {
        expect(r.spec.metadata.slug).toBe(slug);
        expect(gradedStepIds(r.spec).length).toBeGreaterThan(0);
      }
    }
  });

  it("rejects unknown runtimes, duplicate steps and bad check fields", () => {
    expect(parseLabYaml("runtime: { type: docker }").ok).toBe(false);
    const dup = parseLabYaml(`
metadata: { slug: x, title: X }
runtime: { type: terminal, image: img }
steps:
  - { id: a, title: A }
  - { id: a, title: B }
`);
    expect(dup.ok).toBe(false);
    const bad = parseLabYaml(`
metadata: { slug: x, title: X }
runtime: { type: terminal, image: img }
steps:
  - { id: a, title: A, checks: [{ type: file.mode, path: f, mode: rwx }] }
`);
    expect(bad.ok).toBe(false);
  });

  it("marks the first compile file as main when none is", () => {
    const r = parseLabYaml(`
metadata: { slug: x, title: X }
runtime: { type: compile, language: python3 }
files: [{ path: a.py }, { path: b.py }]
steps: [{ id: s, title: S, checks: [{ type: program.io, cases: [{ name: c, stdout: "1" }] }] }]
`);
    expect(r.ok).toBe(true);
    if (r.ok && r.spec.runtime.type === "compile") expect((r.spec as { files: { main: boolean }[] }).files[0].main).toBe(true);
  });
});

describe("seeded challenges", () => {
  it.each(CHALLENGE_GENERATORS)("%s is deterministic per seed and differs across seeds", (g) => {
    const a = generateChallenge(g, "seed-1")!;
    const b = generateChallenge(g, "seed-1")!;
    const c = generateChallenge(g, "seed-2")!;
    expect(a).toEqual(b);
    expect(a.files[0].content).not.toEqual(c.files[0].content);
  });

  it("failed-logins answer equals a recount of the generated log", () => {
    for (const seed of ["a", "b", "c", "d"]) {
      const inst = generateChallenge("failed-logins", seed)!;
      const user = /`(\w+)`/.exec(inst.prompt)![1];
      const count = inst.files[0].content.split("\n").filter((l) => l.includes(`Failed password for ${user} from`)).length;
      expect(inst.answer).toBe(String(count));
    }
  });

  it("top-ip answer equals the most frequent first column", () => {
    const inst = generateChallenge("top-ip", "xyz")!;
    const counts = new Map<string, number>();
    for (const l of inst.files[0].content.trim().split("\n")) counts.set(l.split(" ")[0], (counts.get(l.split(" ")[0]) ?? 0) + 1);
    const max = Math.max(...counts.values());
    expect([...counts].filter(([, n]) => n === max).map(([ip]) => ip)).toContain(inst.answer);
  });

  it("normalises answers", () => {
    expect(normalizeAnswer("  42 ")).toBe("42");
    expect(normalizeAnswer("10.0.0.1")).toBe(normalizeAnswer("10.0.0.1\n"));
  });
});

describe("certificate codes", () => {
  it("generates valid codes and rejects tampering", () => {
    for (let i = 0; i < 50; i++) {
      const code = generateCertificateCode();
      expect(code).toMatch(/^DTA-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]$/);
      expect(isValidCertificateCode(code)).toBe(true);
    }
    const code = generateCertificateCode(() => 5);
    const tampered = code.slice(0, 4) + (code[4] === "A" ? "B" : "A") + code.slice(5);
    expect(isValidCertificateCode(tampered)).toBe(false);
    expect(isValidCertificateCode("DTA-IIII-OOOO-U")).toBe(false);
  });
});

describe("article blocks", () => {
  it("keeps valid blocks and reports invalid ones", () => {
    const { blocks, errors } = parseBlocks([
      { id: "1", type: "markdown", v: 1, data: { md: "hello world" } },
      { id: "2", type: "image", v: 1, data: { alt: "no url" } },
      { id: "3", type: "nope", v: 1, data: {} },
    ]);
    expect(blocks).toHaveLength(1);
    expect(errors).toHaveLength(2);
    expect(estimateReadingMinutes(blocks)).toBe(1);
  });
});
