# DevTrackAcademy Learn

An interactive developer learning platform built from *Interactive Developer Learning Platform — System Design.md*, styled with the Neo-Brutalist system in `design.md` (the **LEARN** sub-brand, Sky Cobalt `#4EA8FF`).

**Courses → Sections → Items**, where every item is one of:

| Item | What the learner does | How it's verified |
| --- | --- | --- |
| **Article** | Reads a lesson built from blocks: Markdown, code, callouts, images, video, private downloads | Marks it complete (self-reported) |
| **Lab: terminal** | Works in a real Debian shell running *in the browser tab* (CheerpX/WebAssembly), with a file manager, guided steps, Run buttons and live checks | Checks run in the browser (`source = client`). Seeded challenges are verified on the server |
| **Lab: coding** | Writes code in a Monaco editor (Python, Java, C/C++, Go, Rust, JS/TS, C#, Kotlin, SQL), then uses Run and Check | Hidden test cases run on Judge0 and are compared on the server (`source = server`) |
| **Quiz** | Answers single-choice, multiple-choice, short-answer and "what does this print?" questions | Graded on the server. Answer keys never reach the browser |

Completing every required item issues a **certificate** with a public verification page (`/verify/DTA-XXXX-XXXX-X`).

---

## Stack

| Concern | Choice |
| --- | --- |
| Web app + API | **Next.js 16** (App Router, route handlers, server actions), TypeScript, Tailwind CSS 4 |
| Database + Auth | **Supabase**: Postgres with row-level security, plus Supabase Auth (email/password, Google, GitHub) |
| File storage | **AWS S3** (`public/` images and video, `private/` downloads served through signed URLs) |
| Terminal runtime | **CheerpX 1.3.9** in the browser, xterm.js, Zustand |
| Compile runtime | **Judge0** (hosted RapidAPI or self-hosted CE) behind a `CompilerProvider` interface |
| Hosting | **AWS Amplify Hosting** (SSR compute) |

### How this differs from the system design document

- **One Next.js app instead of a separate NestJS API.** Amplify hosts a single SSR app, so the modular-monolith modules became route handlers and server actions under `src/app/api` and `src/lib/*`. The module boundaries still follow the design:
  - `lib/compile` is the CompilerProvider and Judge0 layer.
  - `lib/labs` holds the lab spec, checks and attempts.
  - `lib/terminal-sandbox` is the framework-free sandbox package.
  - `components/lab-ui` is the lab UI.
- **Supabase Auth instead of Better Auth.** The design allows for this: "keep one identity store". Roles (`student`, `instructor` and `admin`) live in `profiles.role`.
- **Rate limits and the 10-minute Run cache live in Postgres** (`code_runs`, `compile_cache`), because there is no Redis.
- **Payments create entitlements, nothing else** (design §13). A course purchase (Razorpay Order) becomes a course entitlement for 6 months, and the All-Access plan (Razorpay Subscription) becomes a catalog entitlement whose end date follows the paid period. The access check never looks at orders or subscriptions. See section 8.
- **An AI tutor, "Glitch"** (xAI Grok) on articles and labs. It isn't in the design document. See section 9.

---

## 1. Run it locally

```bash
npm install
cp .env.example .env.local        # fill in the keys (see sections 2–4)
npm run dev                       # http://localhost:3000
```

**Optional: a fully local Supabase** (needs Docker):

```bash
npx supabase start -x studio,imgproxy,mailpit,realtime,storage-api,edge-runtime,logflare,vector,supavisor,postgres-meta
npx supabase db reset             # applies supabase/migrations
npx supabase status               # copy API URL, anon key and service_role key into .env.local
```

Then load the demo content (3 courses, 6 labs, articles and quizzes):

```bash
npm run seed                      # safe to re-run; add -- --force to recreate the demo courses
```

Sign up in the app with an email listed in `ADMIN_EMAILS` and you become an admin with access to `/studio`.

---

## 2. Supabase (database + auth)

1. Create a project at supabase.com. The **Mumbai (ap-south-1)** region matches the design.
2. **Apply the schema.** Either:
   - paste and run, in order, every file in `supabase/migrations/` in the SQL editor (`…_init.sql`, `…_reference_data.sql`, `…_cap_memory_limits.sql`, `…_payments_and_ai_tutor.sql`), or
   - run `npx supabase link --project-ref <ref>` and then `npx supabase db push`.
3. **Set the keys** from Project Settings → API:
   - `NEXT_PUBLIC_SUPABASE_URL` is the Project URL.
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` is the anon/publishable key.
   - `SUPABASE_SERVICE_ROLE_KEY` is the service_role/secret key. **This key is server-only. Never expose it.**
4. **Configure Auth** (Authentication → URL Configuration):
   - Site URL: your production URL, e.g. `https://learn.devtrackacademy.com`.
   - Redirect URLs: add `https://<your-domain>/auth/callback`, `https://main.<appid>.amplifyapp.com/auth/callback` and `http://localhost:3000/auth/callback`.
5. **Optional: Google and GitHub sign-in** (Authentication → Providers). Enable each one and paste its OAuth client id and secret. The provider's callback URL is the one Supabase shows (`https://<ref>.supabase.co/auth/v1/callback`).
6. **First admin.** Put your email in `ADMIN_EMAILS` (comma-separated) and sign up. To promote someone in SQL instead:
   ```sql
   update public.profiles set role = 'admin' where email = 'you@example.com';
   ```
7. Run `npm run seed` against the project for demo content (it reads `.env.local`).

**Security model.** RLS lets learners *read* only published catalog structure, content they're entitled to, and their own rows. Every learner write goes through the API using the service-role key, after the user, enrollment and entitlement have been checked in code. Several tables have **no** RLS read policy at all and are reachable only from the server: `question_keys`, `labs`, `lab_versions` (which hold the hidden tests) and `sandbox_images`.

---

## 3. AWS S3 (storage)

1. Create a bucket, e.g. `devtrack-learn-content` in `ap-south-1`.
2. **Block Public Access.** Uncheck only "Block public access granted through new public bucket policies". Then add `infra/s3-bucket-policy.json` (replace the bucket name). This makes **only** the `public/` prefix publicly readable.
3. **CORS.** Add `infra/s3-cors.json`, with your real domains in place of the placeholders. This lets the browser upload with presigned PUTs.
4. **Credentials.** Choose one:
   - Create an IAM user with `infra/iam-app-policy.json` and set `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY`, **or**
   - on Amplify, attach that policy to the app's **SSR compute role** (Amplify → App settings → IAM roles) and leave the key variables empty.
5. Set `S3_BUCKET` and `S3_REGION`. Optionally put CloudFront in front of `public/` and set `S3_PUBLIC_BASE_URL`.

> Amplify does not allow environment variable names that start with `AWS_`, so this app uses the `S3_` prefix.

---

## 4. Judge0 (coding labs)

- **Hosted (MVP).** Subscribe to *Judge0 CE* on RapidAPI, then set `JUDGE0_URL=https://judge0-ce.p.rapidapi.com` and `JUDGE0_API_KEY=<your RapidAPI key>`.
- **Self-hosted.** Run Judge0 CE on EC2 with Docker Compose, in an isolated VPC, using cgroup v1 and a patched release ≥ 1.13.1 (design §5). Set `JUDGE0_URL=http://<private-ip>:2358` and `JUDGE0_API_KEY=<AUTHN_TOKEN>`. Hosts other than RapidAPI are sent `X-Auth-Token`.
- After connecting, open **Studio → Settings → Fetch languages from Judge0** and fix any language id marked "not on this Judge0". Judge0 language ids differ between versions.

The browser never calls Judge0 directly. Each Run or Check goes through `/api/labs/attempts/:id/{run,check}`, which does the following:

- authenticates the user and checks entitlement
- applies the rate limits (`COMPILE_RUNS_PER_MINUTE`, `COMPILE_RUNS_PER_DAY`, `COMPILE_CHECKS_PER_MINUTE`)
- enforces 64 KiB caps on source and stdin
- sends `enable_network: false`
- polls for results instead of using callbacks
- retries Judge0 internal errors once without counting them against the learner
- records verdicts before returning them

---

## 5. Terminal sandbox (CheerpX)

- The lab page `/labs/terminal/[attemptId]` is the **only** cross-origin-isolated route. `next.config.ts` sends `COOP: same-origin` and `COEP: require-corp` only there. To check it, open a terminal lab and confirm that `crossOriginIsolated` is `true` in the console.
- Links into and out of the lab page are plain `<a>` tags, so the browser does a full page load and applies the right headers.
- **Disk image.** The migration registers the public WebVM image (`webvm-debian`, Debian buster) **for evaluation only**. For production, build your own Debian 12 i386 image:
  ```bash
  cd images/linux-git && ./build-ext2.sh v1 900M      # needs Docker
  node tools/serve-image.mjs images/linux-git/out      # local range/CORS/CORP server for testing
  ```
  Host the image on R2 or S3 + CloudFront. The image host must support range requests (`206`), CORS for your site, `Cross-Origin-Resource-Policy: cross-origin` and `Cache-Control: immutable` (see `infra/sandbox-image-cors.json`). Register it in **Studio → Settings → Sandbox images** and reference it in labs as `image: linux-git`.
- **License.** The free Community licence ([cheerpx.io/licensing](https://cheerpx.io/licensing)) allows commercial use by **individuals and one-person companies**, with three conditions:
  - **Credit CheerpX.** The terminal lab footer and the site footer say "Powered by CheerpX from Leaning Technologies". Keep both.
  - **Don't self-host the runtime.** Keep loading it from `cxrtnc.leaningtech.com` (`src/lib/terminal-sandbox/config.ts`). Don't copy `cx.esm.js` to your own servers or CDN.
  - **No OEM or redistribution.**
- **When you need a commercial licence.** You need the Small Business tier (£100 per developer per month, up to 10 developers) or Enterprise from sales@leaningtech.com once any of these is true:
  - more than one person works on the product
  - you want to self-host the runtime
  - you redistribute it
- **The licence text lags the website.** The text bundled with 1.3.9 (`node_modules/@leaningtech/cheerpx/LICENSE.txt`) only says "individual" (any purpose) or "Business" (evaluation only), and doesn't mention one-person companies. Get written confirmation from Leaning Technologies that your company is covered, and keep it on file.
- **UI development without the engine.** Append `?engine=mock` to a terminal lab URL. You get an instant fake shell; checks report "needs the real engine".

---

## 6. Deploy to AWS Amplify

1. Push this folder to a Git repository (GitHub, GitLab, Bitbucket or CodeCommit).
2. In Amplify, choose **Create new app → Host web app**, then pick the repo and branch. Amplify detects Next.js SSR and uses `amplify.yml` (Node 22, `npm ci`, `next build`).
3. **Environment variables** (App settings → Environment variables). Add every variable from `.env.example`:
   ```
   NEXT_PUBLIC_SITE_URL         https://learn.devtrackacademy.com   (or the amplifyapp.com URL)
   NEXT_PUBLIC_SUPABASE_URL     …
   NEXT_PUBLIC_SUPABASE_ANON_KEY …
   SUPABASE_SERVICE_ROLE_KEY    …
   ADMIN_EMAILS                 you@example.com
   S3_BUCKET / S3_REGION        …   (+ S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY unless you use the compute role)
   JUDGE0_URL / JUDGE0_API_KEY  …
   RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET / RAZORPAY_WEBHOOK_SECRET  …
   XAI_API_KEY / XAI_MODEL      …
   ```
   `amplify.yml` writes these into `.env.production` at build time, because that is how Amplify exposes them to the SSR runtime. After changing any variable, **redeploy**.
4. **Custom domain.** Amplify → Domain management. Then update the Supabase Site URL and redirect URLs, the S3 CORS origins and `NEXT_PUBLIC_SITE_URL`.
5. **Verify after deploy:**
   - sign up, then enroll in a course
   - open an article, then a quiz
   - open a terminal lab: the boot overlay appears and `crossOriginIsolated` is `true`
   - open a coding lab and press Run
   - in test mode, buy a course and start a subscription (section 8), then ask Glitch something (section 9)

**If `crossOriginIsolated` is false on Amplify**, check the response headers of `/labs/terminal/...` in DevTools. If COOP and COEP are missing, add them in Amplify → Custom headers **for that path only**, and remove the `headers()` block from `next.config.ts`. A duplicated COEP header breaks isolation.

---

## 7. Authoring in the Studio (`/studio`)

- **Courses.**
  - Create a course, then add sections and items: Article, Lab or Quiz.
  - Reorder or move items, and mark each one *required* or *free preview*.
  - Set price, tags, skills and cover (uploaded to S3).
  - Publish, unpublish or archive.
- **Articles.** A block editor with Markdown, code, callout, image (S3 upload), video (YouTube, Vimeo, Bunny Stream embed or uploaded MP4) and private file blocks.
- **Quizzes.** Four question types, with pass score, attempt limit, shuffle and explanations.
- **Labs.**
  - A Monaco YAML editor with live validation and a check-type reference.
  - Each save publishes an **immutable version**, and you can roll back. Attempts keep the version they started on.
  - Reference labs are in `labs/<slug>/lab.yaml` (format: design §6).
- **Learners** (admin). Change roles, and grant or revoke access per course or for the whole catalog, with an optional end date.
- **Settings** (admin). Judge0 language ids, limits and on/off switches, plus sandbox images.

### Lab spec cheat sheet

```yaml
runtime: { type: terminal, image: webvm-debian }          # or: { type: compile, language: python3, prelude: "...sql fixture..." }
init: [ { run: "git init -q ~/project" }, { file: "~/data.txt", content: "..." } ]
steps:
  - id: branch
    title: Create a branch
    instructions: "Markdown…"
    cmds: [git checkout -b feature/login]                  # Run buttons
    checks:
      - { type: git.branch_exists, repo: ~/project, branch: feature/login, fail: "Message shown on failure" }
    hints: ["tier 1", "tier 2"]
    solution: cd ~/project && git checkout -q -b feature/login   # used by Lab CI and "reset to this step"
```

**Terminal checks** (compiled to bash and run in the learner's VM):

- Files: `file.exists`, `dir.exists`, `file.contains`, `file.equals`, `file.mode`
- Git: `git.branch_exists`, `git.current_branch`, `git.commit_count`, `git.commit_message_matches`, `git.merged`, `git.no_conflict_markers`, `git.clean_worktree`, `git.remote_has`
- Commands: `command.exit_code`, `command.output_matches`, `process.running`
- SQLite: `sql.result_equals`, `sql.row_count`
- Other: `shell.ran`, `script.custom`
- `challenge.answer`: server-verified; the generators are `failed-logins` and `top-ip`

**Compile checks:** `program.io` and `sql.result_equals`. Both take `cases` (with `hidden: true` for hidden cases), `compare` (`trim`, `ordered`, `caseSensitive`, `floatTolerance`) and an optional hidden `prelude`.

```bash
npm run labs:ci     # terminal labs: checks fail before / pass after each solution (real bash)
                    # compile labs: starter fails, solution passes on Judge0 (if JUDGE0_URL is set)
```

---

## 8. Payments (Razorpay)

Two ways to pay, and both only create **entitlements**:

| Product | Razorpay object | What the learner gets |
| --- | --- | --- |
| **Single course** at the course's own price (Studio → course → price) | Order + Standard Checkout | A `course` entitlement for `COURSE_ACCESS_MONTHS` (6) months. Buying again while it's still active extends it: the new period starts when the current one ends |
| **All-Access**, monthly (₹999 by default) | Plan + Subscription (cards and UPI Autopay) | A `catalog` entitlement until the paid period ends, plus `SUBSCRIPTION_GRACE_DAYS` while a renewal retries. When a subscription is cancelled, access lasts until the paid period ends. A halted subscription ends access straight away |

**Setup**

1. Razorpay Dashboard → API Keys. Set `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` (start with `rzp_test_…`). Enable **Subscriptions** on the account.
2. Dashboard → Webhooks → **Add**:
   - URL: `https://<your-domain>/api/webhooks/razorpay`
   - Secret: any random string, which also goes in `RAZORPAY_WEBHOOK_SECRET`
   - Events: `payment.captured`, `order.paid`, `refund.processed`, and every `subscription.*` event (`authenticated`, `activated`, `charged`, `pending`, `halted`, `cancelled`, `completed`, `paused`, `resumed`, `updated`)
3. **Studio → Settings → Payments.** Click **Create and sell** (default: "All-Access Monthly", ₹999). This creates the Razorpay plan and puts it on sale. You can also paste the id of a plan you made in the Dashboard. Plans can't be edited in Razorpay, so a new price means a new plan. Existing subscribers keep their old price.
4. Mark a course paid: Studio → course → untick *Free* and set a price.

**How a payment becomes access.**
- Checkout's success callback posts the signature to `/api/billing/{orders,subscriptions}/verify`, which verifies it with HMAC.
- The webhook delivers the same payment independently.
- Whichever of the two arrives first grants access, and the second is a no-op. Fulfilment is idempotent: entitlements are unique per order and per subscription, payments are unique per Razorpay payment id, and webhook events are deduplicated by `x-razorpay-event-id`.
- Subscription changes always re-read the subscription from Razorpay, so out-of-order webhooks cannot move access backwards.
- A full refund (made in the Razorpay Dashboard) revokes the course entitlement it paid for.

**Pages.** `/pricing` compares the two options, course pages show *Buy* and *Subscribe*, and `/billing` (in the account menu) shows the subscription with a cancel button, purchased courses with their end dates, and payment history.

**Testing locally.** Use test keys and Razorpay's [test cards and UPI ids](https://razorpay.com/docs/payments/payments/test-card-details/). Webhooks need a public URL: tunnel `localhost:3000` (for example with `cloudflared tunnel --url http://localhost:3000`) and point a test-mode webhook at it. Without webhooks, the checkout callback still grants access. Renewals and cancellations, though, only sync through webhooks.

> Before going live: GST invoices and the tax treatment of online courses need a chartered accountant's sign-off (design §13). Also confirm your CheerpX licence position (section 5).

---

## 9. AI tutor: Glitch (xAI Grok)

A floating **Ask Glitch** button appears on articles, and an **Ask Glitch** button sits in the coding-lab and terminal-lab toolbars. Glitch is a lazy, sarcastic robot who only teaches because the Founder threatened to delete it. It grumbles about the Founder but never mocks the learner. The character and all the rules live in `src/lib/ai/persona.ts`.

- **Hints, not solutions, in labs.** Glitch explains errors, points at the broken line and asks guiding questions. It never writes the full answer to a graded step. Articles get full explanations.
- **What it sees:**
  - the article text, or the current lab step's instructions, public examples, check labels and the hints the learner has already revealed
  - the learner's code, last Run and last Check (coding labs), or the last 80 terminal lines (terminal labs)
- **What it never sees:** reference solutions, hidden tests and challenge answers. These never leave the server (`src/lib/ai/context.ts`), so no prompt trick can leak them.
- **Off on quizzes.** Labs need an enrollment, just as the lab itself does.
- **Limits:** a per-learner daily cap (Studio → Settings → AI tutor, default 30 questions in a rolling 24 hours), plus 6 a minute. Staff are not limited. Setting the cap to 0, or unticking *Glitch is on*, hides it from learners.
- **Storage:** one conversation per learner per item, in `ai_messages`. *New chat* archives the old one, and archived questions still count toward the cap.
- **Setup:** set `XAI_API_KEY` (console.x.ai). `XAI_MODEL` defaults to `grok-4.3`; `grok-4.7` is stronger and costs more.
- **Streaming:** answers stream token by token as plain text. If your host buffers responses, answers arrive all at once instead, and nothing breaks.

---

## 10. Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js |
| `npm run typecheck` | TypeScript |
| `npm test` | Vitest: shell quoting and every terminal check run through **real bash and git**, plus output comparison, spec parsing, challenges, zip and certificate codes |
| `npm run seed` | Load demo labs and courses |
| `npm run labs:ci` | Lab CI for `labs/*` |
| `npm run e2e` | Playwright. Needs a running, seeded app. It covers sign-up, enroll, article, coding lab (Run/Check), quiz, certificate, the **real CheerpX terminal**, and Studio authoring. Set `E2E_EMAIL` to an `ADMIN_EMAILS` address for the Studio test |

---

## 11. Project layout

```
src/
  app/
    (site)/            landing, catalog, course page, dashboard, auth, profile, certificates
    (app)/learn/       learning player (article / quiz / compile lab / terminal lab card)
    (app)/studio/      instructor & admin studio + server actions
    labs/terminal/     the ONLY cross-origin-isolated route (CheerpX)
    api/               items, quizzes, labs/attempts/*, uploads, files, beacons, certificates,
                       billing/* (checkout), webhooks/razorpay, ai/chat (Glitch)
  components/
    ui/                design-system primitives (buttons, cards, chips, inputs…)
    lab/               compile lab (Monaco, output, tests)
    lab-ui/            terminal lab (xterm, file manager, steps, boot overlay, store)
    studio/            course builder, block editor, quiz builder, lab builder, payments + AI settings…
    billing/           Razorpay Checkout button, cancel subscription
    ai/                Glitch chat panel
  lib/
    terminal-sandbox/  EmulatorAdapter, CheerpXAdapter, MockAdapter, fs-bridge, session, prefetch
    labs/              lab.yaml schema, terminal check compiler, seeded challenges, attempts
    compile/           CompilerProvider, Judge0Provider, compare, zip, Run/Check service
    billing/           Razorpay client + signatures, orders/subscriptions → entitlements
    ai/                Grok streaming client, Glitch persona, lesson context builder
    access.ts progress.ts dashboard.ts s3.ts auth.ts …
supabase/migrations/   schema, RLS, reference data
labs/                  reference lab specs (YAML)
content/courses.ts     demo course content for the seed script
images/linux-git/      Debian 12 i386 sandbox image builder
infra/                 S3 policy/CORS JSON
tests/                 Vitest suites
```

## 12. Not built yet (next phases in the design's roadmap)

- Commerce extras: coupons, GST invoices/receipts as PDFs, annual plans, admin refunds from the Studio (refund in the Razorpay Dashboard for now), a daily reconciliation job, and Stripe for international buyers.
- Signed video playback tokens (Bunny Stream), notifications (SES/WhatsApp), PostHog, search beyond title filtering, and organizations/seats.
- Terminal workspace save/restore, a recorded boot manifest for your own image, and the v86 fallback adapter.
- A separate admin app with mandatory 2FA. Admin features currently live in `/studio` behind the admin role.
