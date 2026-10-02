import { describe, expect, it } from "vitest";
import { basename, dirname, joinPath, normalizePath, parseFindOutput, shellQuote, validateName, ShellFileSystem } from "@/lib/terminal-sandbox/fs-bridge";
import { VmError, type CommandRunner, type ExecResult } from "@/lib/terminal-sandbox/types";
import { bash, tempHome } from "./helpers";

describe("shellQuote", () => {
  const samples = [
    "plain",
    "with space",
    "it's",
    "$HOME",
    "`whoami`",
    "a;rm -rf /",
    "-n",
    "",
    "line\nbreak",
    "tab\there",
    "üñíçødé ✓",
    "'''",
    'double "quotes"',
    "back\\slash",
    "*glob?",
  ];

  it.each(samples)("round-trips %j through real bash", (s) => {
    const { stdout } = bash(`printf '%s' ${shellQuote(s)}`);
    expect(stdout).toBe(s);
  });

  it("passes safe bare words through unquoted", () => {
    expect(shellQuote("/home/user/file.txt")).toBe("/home/user/file.txt");
    expect(shellQuote("a-b_c.d")).toBe("a-b_c.d");
  });

  it("quotes words that start with a dash", () => {
    expect(shellQuote("-rf")).toBe("'-rf'");
  });

  it("rejects NUL", () => {
    expect(() => shellQuote("a\0b")).toThrow(VmError);
  });
});

describe("path helpers", () => {
  it("normalises . and ..", () => {
    expect(normalizePath("/home/user/./a/../b/")).toBe("/home/user/b");
    expect(normalizePath("/../..")).toBe("/");
  });
  it("requires absolute paths", () => {
    expect(() => normalizePath("relative/path")).toThrow(VmError);
  });
  it("joins, dirname and basename", () => {
    expect(joinPath("/home/user", "x.txt")).toBe("/home/user/x.txt");
    expect(dirname("/home/user/x.txt")).toBe("/home/user");
    expect(dirname("/x")).toBe("/");
    expect(basename("/home/user/x.txt")).toBe("x.txt");
  });
  it("validates names", () => {
    expect(() => validateName("")).toThrow();
    expect(() => validateName(".")).toThrow();
    expect(() => validateName("..")).toThrow();
    expect(() => validateName("a/b")).toThrow();
    expect(() => validateName("x".repeat(256))).toThrow();
    expect(() => validateName("ok name.txt")).not.toThrow();
  });
});

describe("parseFindOutput", () => {
  it("parses NUL-terminated records with tabs and newlines in names", () => {
    const out = ["d\td\t4096\t1700000000.5\tsrc", "f\tf\t12\t1700000001.0\tna\tme\nwith newline", "l\td\t7\t1700000002.0\tlink", "f\tf\t3\t1700000003.0\tB.txt", "f\tf\t3\t1700000003.0\ta10.txt", "f\tf\t3\t1700000003.0\ta9.txt"].join("\0") + "\0";
    const entries = parseFindOutput(out, "/home/user");
    expect(entries.map((e) => e.name)).toEqual(["link", "src", "a9.txt", "a10.txt", "B.txt", "na\tme\nwith newline"]);
    const link = entries.find((e) => e.name === "link")!;
    expect(link.type).toBe("symlink");
    expect(link.linkToDir).toBe(true);
    expect(entries.find((e) => e.name === "src")!.mtime).toBe(1700000000500);
  });

  it("parses real find output", () => {
    const home = tempHome();
    bash(`mkdir -p "$HOME/dir" && printf 'hello' > "$HOME/file one.txt"`, home);
    const { stdout, status } = bash(`find "$HOME" -mindepth 1 -maxdepth 1 -printf '%y\\t%Y\\t%s\\t%T@\\t%f\\0'`, home);
    if (status !== 0) return; // find without -printf (e.g. BSD find) — skip on that host
    const entries = parseFindOutput(stdout, "/home/user");
    expect(entries[0]).toMatchObject({ name: "dir", type: "dir" });
    expect(entries[1]).toMatchObject({ name: "file one.txt", type: "file", size: 5 });
  });
});

describe("ShellFileSystem", () => {
  // A CommandRunner backed by real bash in a temp dir, mapped to "/" paths.
  function runner(root: string): CommandRunner {
    return {
      async exec(script: string): Promise<ExecResult> {
        const mapped = script.replace(/(^|[\s'])\/(vm)\//g, `$1${root}/`);
        const { status, stdout } = bash(mapped, root);
        return { status, stdout, stderr: status ? "failed" : "", stdoutBytes: new TextEncoder().encode(stdout) };
      },
    };
  }

  it("writes with the base64 fallback, reads, renames and refuses to move a folder into itself", async () => {
    const root = tempHome();
    const fs = new ShellFileSystem(runner(root));
    await fs.mkdir("/vm/project");
    await fs.write("/vm/project/note.txt", "hi there\n");
    expect(new TextDecoder().decode(await fs.read("/vm/project/note.txt"))).toBe("hi there\n");
    await fs.rename("/vm/project/note.txt", "/vm/project/renamed.txt");
    await expect(fs.rename("/vm/project", "/vm/project/inner")).rejects.toThrow(/into itself/);
    await expect(fs.remove("/")).rejects.toThrow();
  });
});
