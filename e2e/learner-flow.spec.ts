import { expect, test, type Page } from "@playwright/test";

const email = process.env.E2E_EMAIL ?? `learner+${Date.now()}@example.com`;
const password = "correct-horse-battery";

test.describe.configure({ mode: "serial" });

let page: Page;

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
});

test.afterAll(async () => {
  await page.close();
});

async function setMonacoValue(p: Page, value: string) {
  await p.waitForFunction(() => (window as unknown as { monaco?: unknown }).monaco !== undefined);
  await p.evaluate((v) => {
    const monaco = (window as unknown as { monaco: { editor: { getModels: () => { setValue: (s: string) => void; uri: { path: string } }[] } } }).monaco;
    const model = monaco.editor.getModels().find((m) => m.uri.path.endsWith(".py") || m.uri.path.endsWith(".sql")) ?? monaco.editor.getModels()[0];
    model.setValue(v);
  }, value);
}

test("sign up and land on the dashboard", async () => {
  await page.goto("/signup");
  await page.getByLabel("Full name").fill("Ada Lovelace");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole("heading", { name: /Hey Ada/ })).toBeVisible();
});

test("enroll in a course and complete an article", async () => {
  await page.goto("/courses/python-problem-solving");
  await page.getByRole("button", { name: "Enroll now" }).click();
  await expect(page).toHaveURL(/\/learn\/python-problem-solving\//);
  await expect(page.getByRole("heading", { name: "Input, output and the grader" })).toBeVisible();
  await page.getByRole("button", { name: /Mark complete/ }).click();
  await expect(page.getByRole("heading", { name: "FizzBuzz", exact: true })).toBeVisible();
});

test("coding lab: run, fail a check, then pass on the server", async () => {
  await expect(page.getByText("Python 3", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Run" }).click();
  // Text matching collapses whitespace, so newlines become spaces.
  await expect(page.locator("pre").filter({ hasText: /^1\s+2\s+3/ })).toBeVisible();

  await page.getByRole("button", { name: "Check" }).click();
  // The starter prints plain numbers, so only the hidden n=1 case passes.
  await expect(page.getByText(/tests passed/)).toContainText("1/4 tests passed — first failure: Wrong answer");

  await setMonacoValue(
    page,
    'n = int(input())\nfor i in range(1, n + 1):\n    print("FizzBuzz" if i % 15 == 0 else "Fizz" if i % 3 == 0 else "Buzz" if i % 5 == 0 else i)\n',
  );
  await page.getByRole("button", { name: "Check" }).click();
  await expect(page.getByText("Lab complete! Every step passed on the server.")).toBeVisible();
  await expect(page.getByText("4/4 tests passed")).toBeVisible();
});

test("quiz: graded on the server with explanations", async () => {
  await page.getByRole("button", { name: "Next" }).first().click();
  await expect(page.getByRole("heading", { name: "Quiz: Python basics" })).toBeVisible();
  await page.getByLabel("Answer for question 1").fill("2");
  await page.getByText("i % 15 == 0").click();
  await page.getByLabel("Answer for question 3").fill("3");
  await page.getByRole("button", { name: /Submit answers/ }).click();
  await expect(page.getByText("100%")).toBeVisible();
  await expect(page.getByText("Passed", { exact: true })).toBeVisible();
});

test("finish the course and get a verifiable certificate", async () => {
  await page.getByRole("button", { name: /^Next/ }).click();
  await expect(page.getByRole("heading", { name: "Dictionaries are fast" })).toBeVisible();
  await page.getByRole("button", { name: /Mark complete/ }).click();
  await expect(page.getByRole("heading", { name: "Two Sum", exact: true })).toBeVisible();
  await setMonacoValue(
    page,
    "def two_sum(nums, target):\n    seen = {}\n    for i, x in enumerate(nums):\n        if target - x in seen:\n            return seen[target - x], i\n        seen[x] = i\n\n\nn = int(input())\nnums = list(map(int, input().split()))\ntarget = int(input())\ni, j = two_sum(nums, target)\nprint(i, j)\n",
  );
  await page.getByRole("button", { name: "Check" }).click();
  await expect(page).toHaveURL(/\/verify\/DTA-/, { timeout: 30_000 });
  await expect(page.getByText("Certificate of completion")).toBeVisible();
  await expect(page.getByText("Ada Lovelace")).toBeVisible();
  await expect(page.getByText("Verified")).toBeVisible();
});

test("terminal lab: real Linux boots, hidden checks run, progress is saved", async () => {
  await page.goto("/courses/linux-git-foundations");
  await page.getByRole("button", { name: "Enroll now" }).click();
  await expect(page).toHaveURL(/\/learn\/linux-git-foundations\//);
  await page.getByRole("link", { name: /Lab: files and folders/ }).first().click();
  await page.getByRole("link", { name: /Open terminal lab/ }).click();
  await expect(page).toHaveURL(/\/labs\/terminal\//);

  expect(await page.evaluate(() => window.crossOriginIsolated)).toBe(true);
  await expect(page.getByText("Running", { exact: true })).toBeVisible({ timeout: 180_000 });

  // Type into the terminal and see real bash output.
  await page.locator(".xterm").click();
  await page.keyboard.type("echo sandbox-$((6*7))\n");
  await expect(page.locator(".xterm-rows")).toContainText("sandbox-42", { timeout: 30_000 });

  // Complete "Create a projects folder" via the terminal and let the live check tick.
  await page.getByRole("button", { name: /Create a projects folder/ }).click();
  await page.locator(".xterm").click();
  await page.keyboard.type("mkdir -p ~/playground/projects\n");
  await page.getByRole("button", { name: "Check my work" }).click();
  await expect(page.getByText(/1\/4 steps passed/)).toBeVisible({ timeout: 60_000 });

  // The file manager lists the VM's files through the hidden exec channel.
  await page.getByRole("tab", { name: /Files/ }).click();
  await expect(page.getByRole("row", { name: /playground/ })).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: "Stop" }).click();
  await expect(page.getByText("Sandbox stopped")).toBeVisible({ timeout: 30_000 });
});

test("studio is admin-only and loads for staff", async () => {
  await page.goto("/studio");
  if (email.startsWith("admin@")) {
    await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
    await page.goto("/studio/courses");
    await expect(page.getByText("Linux & Git Foundations")).toBeVisible();
  } else {
    await expect(page).toHaveURL(/\/dashboard/);
  }
});
