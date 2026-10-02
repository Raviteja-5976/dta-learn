/**
 * Demo course content loaded by `npm run seed`. Each course is a list of
 * sections; each section holds articles (blocks), labs (by lab slug from
 * labs/<slug>/lab.yaml) and quizzes. Edit freely, or author everything in the
 * Studio instead.
 */
import type { Block } from "../src/lib/blocks/schema";

export type SeedQuestion =
  | { type: "single" | "multiple"; prompt: string; code?: string; codeLanguage?: string; options: string[]; correct: number[]; explanation?: string }
  | { type: "text" | "code_output"; prompt: string; code?: string; codeLanguage?: string; accepted: string[]; caseSensitive?: boolean; explanation?: string };

export type SeedItem =
  | { kind: "article"; title: string; summary?: string; preview?: boolean; minutes?: number; blocks: Omit<Block, "id" | "v">[] }
  | { kind: "lab"; title: string; summary?: string; preview?: boolean; minutes?: number; lab: string; required?: boolean }
  | { kind: "quiz"; title: string; summary?: string; passScore?: number; questions: SeedQuestion[] };

export interface SeedCourse {
  slug: string;
  title: string;
  subtitle: string;
  description: string;
  level: "beginner" | "intermediate" | "advanced";
  tags: string[];
  skills: string[];
  hours: number;
  isFree: boolean;
  pricePaise?: number;
  sections: { title: string; description?: string; items: SeedItem[] }[];
}

const md = (text: string) => ({ type: "markdown" as const, data: { md: text.trim() } });

export const courses: SeedCourse[] = [
  {
    slug: "linux-git-foundations",
    title: "Linux & Git Foundations",
    subtitle: "Get comfortable in a real terminal and ship code with Git — no installs, it all runs in your browser.",
    description: `
Every developer lives in the terminal. In this course you'll work in a **real Debian Linux** that runs inside your browser tab: move around the file system, wrangle text with \`grep\`, and use Git the way teams do.

**What you'll do**

- Create, move and edit files from the shell
- Filter logs with \`grep\`, \`awk\`, \`sort\` and \`uniq\`
- Branch, commit, merge and push with Git
- Solve a personalised log-analysis challenge that's verified on our servers
`,
    level: "beginner",
    tags: ["linux", "git"],
    skills: ["Linux", "Bash", "Git"],
    hours: 3,
    isFree: true,
    sections: [
      {
        title: "The shell",
        description: "Files, folders and your first script.",
        items: [
          {
            kind: "article",
            title: "Why the terminal?",
            summary: "What a shell is and why every developer uses one.",
            preview: true,
            minutes: 4,
            blocks: [
              md(`
## Text in, text out

A **shell** is a program that reads a command you type, runs it, and prints the result. That sounds primitive next to a graphical app — and that's exactly why it's powerful: every command takes text in and gives text out, so you can **chain** them together.

\`\`\`bash
grep error app.log | wc -l
\`\`\`

That one line finds every error in a log and counts them. No clicking, and you can save it, repeat it or run it on a server on the other side of the world.
`),
              {
                type: "callout",
                data: { tone: "tip", title: "Where am I?", md: "Lost? `pwd` prints the folder you're in, and `ls` lists what's inside it. `cd ~` always takes you home." },
              },
              md(`
## The commands you'll use today

| Command | What it does |
| --- | --- |
| \`pwd\` | print the current folder |
| \`ls -la\` | list everything, including hidden files |
| \`cd <dir>\` | change folder |
| \`mkdir <dir>\` | make a folder |
| \`echo text > file\` | write text into a file |
| \`grep <pattern> <file>\` | print matching lines |
| \`chmod +x <file>\` | make a file executable |

In the next lab you'll run all of them in a real Linux machine. Your sandbox is wiped when you stop it, so experiment freely — you can't break anything.
`),
            ],
          },
          { kind: "lab", title: "Lab: files and folders", lab: "linux-basics", minutes: 15 },
          {
            kind: "quiz",
            title: "Quiz: shell basics",
            passScore: 70,
            questions: [
              { type: "single", prompt: "Which command prints the folder you are currently in?", options: ["`ls`", "`pwd`", "`cd`", "`whoami`"], correct: [1], explanation: "`pwd` stands for *print working directory*." },
              { type: "single", prompt: "What does `echo hi > notes.txt` do if `notes.txt` already exists?", options: ["Appends hi to the end", "Replaces the file's content with hi", "Fails with an error", "Prints hi and leaves the file alone"], correct: [1], explanation: "A single `>` truncates the file first. Use `>>` to append." },
              { type: "multiple", prompt: "Which of these make `script.sh` runnable as `./script.sh`? Select all that apply.", options: ["`chmod +x script.sh`", "`chmod 755 script.sh`", "`mv script.sh script`", "`chmod 644 script.sh`"], correct: [0, 1], explanation: "Both `+x` and `755` set the execute bit. `644` is read/write only." },
              { type: "code_output", prompt: "How many lines does this print?", code: "printf 'error: a\\ninfo: b\\nerror: c\\n' | grep -c error", codeLanguage: "bash", accepted: ["2"], explanation: "`grep -c` prints the *count* of matching lines: 2." },
            ],
          },
        ],
      },
      {
        title: "Version control with Git",
        description: "Branches, commits, merges and remotes.",
        items: [
          {
            kind: "article",
            title: "How Git thinks",
            summary: "Commits are snapshots; branches are just labels.",
            minutes: 5,
            blocks: [
              md(`
## Snapshots, not diffs

Every **commit** is a snapshot of your whole project plus a pointer to the commit before it. Follow those pointers and you get the history.

A **branch** is nothing more than a movable label that points at a commit. When you commit on a branch, the label moves forward to the new commit.
`),
              {
                type: "code",
                data: {
                  language: "text",
                  code: "main            A --- B\n                       \\\nfeature/login           C   ← you commit here",
                },
              },
              md(`
## The everyday loop

1. \`git checkout -b feature/login\` — make a branch for your work
2. edit files, then \`git add\` and \`git commit\`
3. \`git checkout main\` and \`git merge feature/login\`
4. \`git push origin main\` to share it

In the lab, a local bare repository at \`~/remote.git\` plays the role of GitHub.
`),
              { type: "callout", data: { tone: "info", md: "Older Git versions don't have `git switch`, so this course uses `git checkout -b`. Both do the same thing." } },
            ],
          },
          { kind: "lab", title: "Lab: Git branches 101", lab: "git-branches-101", minutes: 20 },
          {
            kind: "quiz",
            title: "Quiz: Git check",
            questions: [
              { type: "single", prompt: "What is a Git branch?", options: ["A full copy of the repository", "A movable pointer to a commit", "A folder inside `.git`", "A list of changed files"], correct: [1] },
              { type: "single", prompt: "You're on `main`. Which command brings the commits from `feature/login` into `main`?", options: ["`git push feature/login`", "`git merge feature/login`", "`git checkout feature/login`", "`git commit feature/login`"], correct: [1] },
              { type: "text", prompt: "Which command shows staged and unstaged changes in your working tree? (two words)", accepted: ["git status"], explanation: "`git status` is the command you'll run most often." },
            ],
          },
        ],
      },
      {
        title: "Capstone",
        items: [{ kind: "lab", title: "Challenge: log detective", lab: "log-detective", minutes: 20 }],
      },
    ],
  },
  {
    slug: "python-problem-solving",
    title: "Python Problem Solving",
    subtitle: "Write real programs, run them on a sandboxed server and get graded on hidden tests.",
    description: `
Short, focused exercises that build the habits behind interview-style problem solving: read input carefully, pick the right data structure, and test edge cases.

Your code runs on our compile service and is checked against **hidden test cases**, so a pass here really means your solution works.
`,
    level: "beginner",
    tags: ["python"],
    skills: ["Python", "Problem solving", "Hash maps"],
    hours: 2,
    isFree: true,
    sections: [
      {
        title: "Warm-up",
        items: [
          {
            kind: "article",
            title: "Input, output and the grader",
            preview: true,
            minutes: 4,
            blocks: [
              md(`
## How coding labs work

Your program reads from **standard input** and writes to **standard output**. The grader feeds it test input and compares what you print with the expected output.
`),
              { type: "code", data: { language: "python", filename: "main.py", code: "n = int(input())          # read one line, turn it into an int\nnums = input().split()    # read a line of space-separated values\nprint(n * 2)              # write a line to stdout" } },
              md(`
- **Run** (Ctrl/Cmd + Enter) executes your code with whatever you type in the *stdin* box.
- **Check** (Ctrl/Cmd + Shift + Enter) runs the visible examples **and hidden tests** on the server.
- Trailing spaces at the end of lines are ignored, but every line must match.
`),
              { type: "callout", data: { tone: "warning", title: "No interactive input", md: "Programs can't prompt you while running. Everything they read must be in the stdin box before you press Run." } },
            ],
          },
          { kind: "lab", title: "Lab: FizzBuzz", lab: "python-fizzbuzz", minutes: 10 },
          {
            kind: "quiz",
            title: "Quiz: Python basics",
            questions: [
              { type: "code_output", prompt: "What does this print?", code: "print(17 % 5)", codeLanguage: "python", accepted: ["2"] },
              { type: "single", prompt: "Which expression is `True` exactly when `i` is divisible by both 3 and 5?", options: ["`i % 3 == 0 or i % 5 == 0`", "`i % 15 == 0`", "`i / 15 == 0`", "`i % 8 == 0`"], correct: [1] },
              { type: "code_output", prompt: "What does this print?", code: "nums = '3 1 2'.split()\nprint(len(nums))", codeLanguage: "python", accepted: ["3"] },
            ],
          },
        ],
      },
      {
        title: "Hash maps",
        items: [
          {
            kind: "article",
            title: "Dictionaries are fast",
            minutes: 4,
            blocks: [
              md(`
## O(1) lookups

A Python \`dict\` finds a key in (roughly) constant time, no matter how big it is. That turns many "compare every pair" problems from O(n²) into O(n).
`),
              { type: "code", data: { language: "python", code: "seen = {}\nfor i, x in enumerate(nums):\n    if target - x in seen:     # O(1) membership check\n        return seen[target - x], i\n    seen[x] = i" } },
              { type: "callout", data: { tone: "tip", md: "Before writing nested loops, ask: *what would I need to remember to answer this in one pass?* That's usually your dictionary." } },
            ],
          },
          { kind: "lab", title: "Lab: Two Sum", lab: "python-two-sum", minutes: 20 },
        ],
      },
    ],
  },
  {
    slug: "sql-essentials",
    title: "SQL Essentials",
    subtitle: "Query real tables with SELECT, WHERE, ORDER BY and GROUP BY.",
    description: `
SQL is the language of data. You'll write queries against an SQLite database and get them graded against a hidden dataset, so your query has to be right — not just right for the example.

*This is a paid course: the first lesson is a free preview. Admins can grant access from Studio → Learners.*
`,
    level: "beginner",
    tags: ["sql"],
    skills: ["SQL", "SQLite"],
    hours: 1.5,
    isFree: false,
    pricePaise: 49900,
    sections: [
      {
        title: "Querying a table",
        items: [
          {
            kind: "article",
            title: "SELECT, WHERE and ORDER BY",
            preview: true,
            minutes: 5,
            blocks: [
              md(`
## The shape of a query

\`\`\`sql
SELECT name, salary          -- which columns
FROM employees               -- which table
WHERE department = 'Sales'   -- which rows
ORDER BY salary DESC;        -- in what order
\`\`\`

Read it out loud: *select the name and salary from employees where the department is Sales, ordered by salary, highest first.*

## Counting with GROUP BY

\`GROUP BY\` collapses rows that share a value, and aggregate functions like \`COUNT(*)\` summarise each group:

\`\`\`sql
SELECT department, COUNT(*) FROM employees GROUP BY department;
\`\`\`
`),
            ],
          },
          { kind: "lab", title: "Lab: query the employees table", lab: "sql-select-basics", minutes: 15 },
          {
            kind: "quiz",
            title: "Quiz: SQL check",
            questions: [
              { type: "single", prompt: "Which clause filters **rows** before grouping?", options: ["`ORDER BY`", "`WHERE`", "`GROUP BY`", "`SELECT`"], correct: [1] },
              { type: "single", prompt: "Which clause filters **groups** after `GROUP BY`?", options: ["`WHERE`", "`HAVING`", "`LIMIT`", "`FILTER`"], correct: [1] },
            ],
          },
        ],
      },
    ],
  },
];
