import { z } from "zod";
import YAML from "yaml";

/**
 * The lab spec (design §6): a lab is DATA — a versioned lab.yaml with starter
 * files, steps, typed checks, hints and a reference solution. One format
 * covers both runtimes; only runtime.type, ui.layout and the check families
 * differ. Content is inline (instructions, templates, test cases) because
 * specs live in the database rather than a package directory.
 */

const id = z.string().regex(/^[a-z0-9][a-z0-9_-]*$/i, "use letters, digits, - and _");
const nonEmpty = z.string().min(1);

const checkBase = {
  id: id.optional(),
  title: z.string().optional(),
  fail: z.string().optional(), // message shown when the check fails
};

// ── Terminal check families (compiled to bash, run in the learner's browser) ──
export const terminalCheckSchema = z.discriminatedUnion("type", [
  z.object({ ...checkBase, type: z.literal("file.exists"), path: nonEmpty }),
  z.object({ ...checkBase, type: z.literal("dir.exists"), path: nonEmpty }),
  z.object({ ...checkBase, type: z.literal("file.contains"), path: nonEmpty, pattern: nonEmpty, fixed: z.boolean().default(false) }),
  z.object({ ...checkBase, type: z.literal("file.equals"), path: nonEmpty, content: z.string() }),
  z.object({ ...checkBase, type: z.literal("file.mode"), path: nonEmpty, mode: z.string().regex(/^(\+x|[0-7]{3,4})$/, 'mode is "+x" or octal like 755') }),
  z.object({ ...checkBase, type: z.literal("git.branch_exists"), repo: nonEmpty, branch: nonEmpty }),
  z.object({ ...checkBase, type: z.literal("git.current_branch"), repo: nonEmpty, branch: nonEmpty }),
  z.object({
    ...checkBase,
    type: z.literal("git.commit_count"),
    repo: nonEmpty,
    ref: z.string().default("HEAD"),
    base: z.string().optional(),
    min: z.number().int().min(0).optional(),
    max: z.number().int().min(0).optional(),
  }),
  z.object({ ...checkBase, type: z.literal("git.commit_message_matches"), repo: nonEmpty, ref: z.string().default("HEAD"), pattern: nonEmpty }),
  z.object({ ...checkBase, type: z.literal("git.merged"), repo: nonEmpty, branch: nonEmpty, into: z.string().default("main") }),
  z.object({ ...checkBase, type: z.literal("git.no_conflict_markers"), repo: nonEmpty }),
  z.object({ ...checkBase, type: z.literal("git.clean_worktree"), repo: nonEmpty }),
  z.object({ ...checkBase, type: z.literal("git.remote_has"), repo: nonEmpty, remote: z.string().default("origin"), branch: nonEmpty }),
  z.object({ ...checkBase, type: z.literal("command.exit_code"), run: nonEmpty, code: z.number().int().default(0) }),
  z.object({ ...checkBase, type: z.literal("command.output_matches"), run: nonEmpty, pattern: nonEmpty }),
  z.object({ ...checkBase, type: z.literal("process.running"), name: nonEmpty }),
  z.object({ ...checkBase, type: z.literal("sql.result_equals"), db: nonEmpty, query: nonEmpty, expected: z.string() }),
  z.object({
    ...checkBase,
    type: z.literal("sql.row_count"),
    db: nonEmpty,
    table: nonEmpty,
    equals: z.number().int().optional(),
    min: z.number().int().optional(),
  }),
  z.object({ ...checkBase, type: z.literal("shell.ran"), pattern: nonEmpty }),
  z.object({ ...checkBase, type: z.literal("script.custom"), script: nonEmpty }),
  // Seeded challenge: the learner finds a value in the terminal and submits it
  // in a form. The SERVER recomputes the answer from the attempt's seed.
  z.object({ ...checkBase, type: z.literal("challenge.answer"), generator: nonEmpty }),
]);

// ── Compile check families (run on Judge0, compared on the server) ──
const compareSchema = z
  .object({
    trim: z.enum(["none", "lines", "all"]).default("lines"),
    ordered: z.boolean().default(true),
    caseSensitive: z.boolean().default(true),
    floatTolerance: z.number().positive().optional(),
  })
  .default({ trim: "lines", ordered: true, caseSensitive: true });

const ioCaseSchema = z.object({
  name: nonEmpty,
  stdin: z.string().default(""),
  stdout: z.string(),
  args: z.string().max(512).optional(),
  hidden: z.boolean().default(false),
});

export const compileCheckSchema = z.discriminatedUnion("type", [
  z.object({ ...checkBase, type: z.literal("program.io"), compare: compareSchema, prelude: z.string().optional(), cases: z.array(ioCaseSchema).min(1) }),
  // SQL on SQLite: the hidden fixture (prelude) runs before the learner's query
  z.object({ ...checkBase, type: z.literal("sql.result_equals"), compare: compareSchema, prelude: z.string().optional(), cases: z.array(ioCaseSchema).min(1) }),
]);

const metadataSchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "slug must be kebab-case"),
  title: nonEmpty,
  description: z.string().optional(),
  tags: z.array(z.string()).default([]),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]).default("beginner"),
  estimatedMinutes: z.number().int().positive().optional(),
});

const cheatsheetSchema = z
  .array(z.object({ title: nonEmpty, items: z.array(z.object({ cmd: nonEmpty, desc: z.string().default("") })) }))
  .optional();

const terminalStepSchema = z.object({
  id,
  title: nonEmpty,
  instructions: z.string().default(""),
  cmds: z.array(z.string()).default([]),
  checks: z.array(terminalCheckSchema).default([]),
  hints: z.array(z.string()).default([]),
  solution: z.string().optional(), // bash that completes this step (Lab CI, reset-to-step)
});

const compileStepSchema = z.object({
  id,
  title: nonEmpty,
  instructions: z.string().default(""),
  checks: z.array(compileCheckSchema).default([]),
  hints: z.array(z.string()).default([]),
  // Per-step reference files (path → content) when steps need different code; falls back to the lab solution.
  solution: z.record(z.string(), z.string()).optional(),
});

const initEntrySchema = z.union([
  z.object({ run: nonEmpty }),
  z.object({ file: nonEmpty, content: z.string(), mode: z.string().optional() }),
]);

const limitsSchema = z.object({
  cpuSeconds: z.number().positive().max(15).optional(),
  wallSeconds: z.number().positive().max(20).optional(),
  memoryMiB: z.number().int().positive().max(256).optional(),
  maxProcesses: z.number().int().positive().max(128).optional(),
  maxOutputKiB: z.number().int().positive().max(1024).optional(),
});

export const terminalLabSpecSchema = z.object({
  apiVersion: z.literal("labs/v1").default("labs/v1"),
  kind: z.literal("Lab").default("Lab"),
  metadata: metadataSchema,
  runtime: z.object({
    type: z.literal("terminal"),
    image: nonEmpty, // "slug" or "slug:version" → sandbox_images
    user: z.string().default("user"),
    limits: z.object({ idleTimeoutMinutes: z.number().int().min(0).max(240).optional() }).default({}),
    network: z.literal("none").default("none"),
  }),
  shell: z.object({ rc: z.string().optional(), history: z.boolean().default(false) }).default({ history: false }),
  init: z.array(initEntrySchema).default([]),
  ui: z.object({ layout: z.literal("terminal").default("terminal"), cwd: z.string().optional(), cheatsheet: cheatsheetSchema }).default({ layout: "terminal" }),
  steps: z.array(terminalStepSchema).min(1),
});

export const compileLabSpecSchema = z.object({
  apiVersion: z.literal("labs/v1").default("labs/v1"),
  kind: z.literal("Lab").default("Lab"),
  metadata: metadataSchema,
  runtime: z.object({
    type: z.literal("compile"),
    language: nonEmpty, // compile_languages.slug
    limits: limitsSchema.default({}),
    prelude: z.string().optional(), // server-side code/fixture prepended to every run (e.g. SQL tables)
    multiFile: z.object({ compile: z.string().optional(), run: nonEmpty }).optional(),
  }),
  files: z
    .array(z.object({ path: z.string().regex(/^[\w][\w./-]*$/, "relative path"), content: z.string().default(""), editable: z.boolean().default(true), main: z.boolean().default(false) }))
    .min(1),
  ui: z.object({ layout: z.literal("editor-output").default("editor-output") }).default({ layout: "editor-output" }),
  steps: z.array(compileStepSchema).min(1),
  solution: z.record(z.string(), z.string()).optional(), // path → reference content (never sent to learners)
});

export type TerminalCheck = z.infer<typeof terminalCheckSchema> & { id: string };
export type CompileCheck = z.infer<typeof compileCheckSchema> & { id: string };
export type IoCase = z.infer<typeof ioCaseSchema>;
export type CompareOptions = z.infer<typeof compareSchema>;
export type TerminalLabSpec = z.infer<typeof terminalLabSpecSchema>;
export type CompileLabSpec = z.infer<typeof compileLabSpecSchema>;
export type LabSpec = TerminalLabSpec | CompileLabSpec;
export type TerminalStep = TerminalLabSpec["steps"][number];
export type CompileStep = CompileLabSpec["steps"][number];

export type ParseResult = { ok: true; spec: LabSpec } | { ok: false; errors: string[] };

/** Parse and validate a lab.yaml string. Assigns check ids where missing. */
export function parseLabYaml(source: string): ParseResult {
  let raw: unknown;
  try {
    raw = YAML.parse(source);
  } catch (e) {
    return { ok: false, errors: [`YAML: ${(e as Error).message}`] };
  }
  return validateLabSpec(raw);
}

export function validateLabSpec(raw: unknown): ParseResult {
  const runtimeType = (raw as { runtime?: { type?: string } })?.runtime?.type;
  const schema = runtimeType === "terminal" ? terminalLabSpecSchema : runtimeType === "compile" ? compileLabSpecSchema : null;
  if (!schema) return { ok: false, errors: ['runtime.type must be "terminal" or "compile"'] };

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
    };
  }
  const spec = parsed.data as LabSpec;
  const errors: string[] = [];

  const stepIds = new Set<string>();
  for (const step of spec.steps) {
    if (stepIds.has(step.id)) errors.push(`steps: duplicate step id "${step.id}"`);
    stepIds.add(step.id);
    const checkIds = new Set<string>();
    step.checks.forEach((check, i) => {
      const c = check as { id?: string };
      c.id = c.id ?? `c${i + 1}`;
      if (checkIds.has(c.id)) errors.push(`steps.${step.id}: duplicate check id "${c.id}"`);
      checkIds.add(c.id);
    });
  }

  if (spec.runtime.type === "compile") {
    const s = spec as CompileLabSpec;
    const paths = new Set<string>();
    for (const f of s.files) {
      if (paths.has(f.path)) errors.push(`files: duplicate path "${f.path}"`);
      paths.add(f.path);
    }
    if (!s.files.some((f) => f.main)) s.files[0].main = true;
    if (s.files.filter((f) => f.main).length > 1) errors.push("files: only one file can be main");
  }

  return errors.length ? { ok: false, errors } : { ok: true, spec };
}

export function isTerminalSpec(spec: LabSpec): spec is TerminalLabSpec {
  return spec.runtime.type === "terminal";
}

export function isCompileSpec(spec: LabSpec): spec is CompileLabSpec {
  return spec.runtime.type === "compile";
}

/** Steps that have at least one check; a lab is complete when all of them pass. */
export function gradedStepIds(spec: LabSpec): string[] {
  return spec.steps.filter((s) => s.checks.length > 0).map((s) => s.id);
}

export const TERMINAL_LAB_TEMPLATE = `apiVersion: labs/v1
kind: Lab
metadata:
  slug: my-terminal-lab
  title: My terminal lab
  tags: [linux]
  difficulty: beginner
  estimatedMinutes: 15
runtime:
  type: terminal
  image: webvm-debian        # sandbox_images slug (optionally slug:version)
  limits: { idleTimeoutMinutes: 30 }
init:                        # runs hidden in the background once the VM exists
  - run: mkdir -p ~/project
ui:
  cwd: /home/user/project
steps:
  - id: create-file
    title: Create a file called hello.txt
    instructions: |
      Use \`touch\` or \`echo\` to create **hello.txt** inside \`~/project\`.
    cmds:
      - echo "hello" > hello.txt
    checks:
      - type: file.exists
        path: ~/project/hello.txt
        fail: "No hello.txt yet. Run \`ls\` to see what is in the folder."
    hints:
      - "\`echo text > file\` writes text into a file."
    solution: echo hello > ~/project/hello.txt
`;

export const COMPILE_LAB_TEMPLATE = `apiVersion: labs/v1
kind: Lab
metadata:
  slug: my-compile-lab
  title: My coding exercise
  tags: [python]
  difficulty: beginner
runtime:
  type: compile
  language: python3          # compile_languages slug
  limits: { cpuSeconds: 2, wallSeconds: 5, memoryMiB: 256 }
files:
  - path: main.py
    main: true
    content: |
      name = input()
      # print a greeting
ui:
  layout: editor-output
steps:
  - id: greet
    title: Print "Hello, <name>!"
    instructions: |
      Read a name from stdin and print \`Hello, <name>!\`.
    checks:
      - type: program.io
        compare: { trim: lines, ordered: true }
        cases:
          - { name: sample, stdin: "Ada\\n", stdout: "Hello, Ada!\\n" }
          - { name: hidden-1, stdin: "Linus\\n", stdout: "Hello, Linus!\\n", hidden: true }
    hints:
      - "Use an f-string: f\\"Hello, {name}!\\""
solution:
  main.py: |
    name = input()
    print(f"Hello, {name}!")
`;
