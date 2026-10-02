/**
 * Seeded challenges (design §6, trust model). The server issues a random
 * seed per attempt; the dataset is generated from it by a pure function and
 * written into the learner's VM; the learner analyses it in the terminal and
 * submits the answer in a form; the server recomputes the expected answer
 * from the same seed. A classmate's answer is useless because seeds differ.
 */

export interface ChallengeInstance {
  prompt: string;
  files: { path: string; content: string }[];
  answer: string;
  answerHint: string; // e.g. "a whole number"
}

type Generator = (rand: () => number) => ChallengeInstance;

function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T,>(rand: () => number, arr: T[]): T => arr[Math.floor(rand() * arr.length)];
const int = (rand: () => number, min: number, max: number) => min + Math.floor(rand() * (max - min + 1));

function ip(rand: () => number): string {
  return `${pick(rand, [10, 172, 192, 203])}.${int(rand, 0, 255)}.${int(rand, 0, 255)}.${int(rand, 1, 254)}`;
}

function timestamp(base: number, offsetSec: number): string {
  const d = new Date(base + offsetSec * 1000);
  const mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()];
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${mon} ${String(d.getUTCDate()).padStart(2, " ")} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

const generators: Record<string, Generator> = {
  /** Count failed SSH logins for one user in an auth.log. */
  "failed-logins": (rand) => {
    const users = ["admin", "root", "deploy", "ubuntu", "postgres", "git", "alice", "bob"];
    const target = pick(rand, ["admin", "deploy", "postgres"]);
    const base = Date.UTC(2026, 8, 14, 6, 0, 0);
    const lines: string[] = [];
    let failedForTarget = 0;
    let t = 0;
    const total = int(rand, 220, 320);
    for (let i = 0; i < total; i++) {
      t += int(rand, 1, 90);
      const user = rand() < 0.35 ? target : pick(rand, users);
      const pid = int(rand, 1000, 65000);
      const host = ip(rand);
      const port = int(rand, 30000, 65000);
      const failed = rand() < 0.6;
      if (failed && user === target) failedForTarget++;
      lines.push(
        failed
          ? `${timestamp(base, t)} sandbox sshd[${pid}]: Failed password for ${user} from ${host} port ${port} ssh2`
          : `${timestamp(base, t)} sandbox sshd[${pid}]: Accepted password for ${user} from ${host} port ${port} ssh2`,
      );
      if (rand() < 0.15) lines.push(`${timestamp(base, t)} sandbox CRON[${pid + 1}]: pam_unix(cron:session): session opened for user root`);
      // Decoys: "invalid user" lines mention the target but are not "Failed password for <target>"
      if (rand() < 0.05) lines.push(`${timestamp(base, t)} sandbox sshd[${pid}]: Invalid user ${target}x from ${host} port ${port}`);
    }
    return {
      prompt: `How many **failed password** attempts were made for the user \`${target}\` in \`~/logs/auth.log\`?`,
      files: [{ path: "~/logs/auth.log", content: lines.join("\n") + "\n" }],
      answer: String(failedForTarget),
      answerHint: "a whole number",
    };
  },

  /** Find the IP address with the most requests in an access log. */
  "top-ip": (rand) => {
    const ips = Array.from({ length: 12 }, () => ip(rand));
    const weights = ips.map(() => rand());
    const winner = int(rand, 0, ips.length - 1);
    weights[winner] += 1.2;
    const sum = weights.reduce((a, b) => a + b, 0);
    const paths = ["/", "/login", "/api/courses", "/api/progress", "/static/app.js", "/favicon.ico", "/dashboard"];
    const counts = new Map<string, number>();
    const lines: string[] = [];
    const total = int(rand, 400, 600);
    for (let i = 0; i < total; i++) {
      let r = rand() * sum;
      let idx = 0;
      while (r > weights[idx] && idx < ips.length - 1) r -= weights[idx++];
      const addr = ips[idx];
      counts.set(addr, (counts.get(addr) ?? 0) + 1);
      const status = pick(rand, [200, 200, 200, 304, 404, 500]);
      lines.push(`${addr} - - [14/Sep/2026:${String(int(rand, 0, 23)).padStart(2, "0")}:${String(int(rand, 0, 59)).padStart(2, "0")}:00 +0000] "GET ${pick(rand, paths)} HTTP/1.1" ${status} ${int(rand, 200, 9000)}`);
    }
    // Ties are possible in theory; resolve to the lexicographically smallest of the top IPs.
    const max = Math.max(...counts.values());
    const top = [...counts.entries()].filter(([, c]) => c === max).map(([a]) => a).sort()[0];
    return {
      prompt: "Which IP address made the **most requests** in `~/logs/access.log`?",
      files: [{ path: "~/logs/access.log", content: lines.join("\n") + "\n" }],
      answer: top,
      answerHint: "an IPv4 address",
    };
  },
};

export const CHALLENGE_GENERATORS = Object.keys(generators);

export function generateChallenge(generator: string, seed: string): ChallengeInstance | null {
  const g = generators[generator];
  if (!g) return null;
  return g(mulberry32(fnv1a(`${generator}:${seed}`)));
}

export function normalizeAnswer(a: string): string {
  return a.trim().toLowerCase().replace(/\s+/g, " ");
}
