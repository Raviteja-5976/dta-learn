import { expect, test } from "@playwright/test";

/**
 * Studio authoring as an admin (an email listed in ADMIN_EMAILS that already
 * has an account — run learner-flow.spec.ts first with E2E_EMAIL set to it).
 */
const email = process.env.E2E_ADMIN_EMAIL ?? process.env.E2E_EMAIL ?? "admin@example.com";
const password = "correct-horse-battery";

test("author a course with an article and a quiz, publish it, version a lab", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/dashboard/);

  // Create a course
  const title = `E2E Course ${Date.now()}`;
  await page.goto("/studio/courses");
  await page.getByLabel("New course title").fill(title);
  await page.getByRole("button", { name: "Create course" }).click();
  await expect(page).toHaveURL(/\/studio\/courses\/[0-9a-f-]+$/);
  await expect(page.getByRole("heading", { name: title })).toBeVisible();

  // Add an article and write it
  await page.getByLabel("Item title").fill("Hello article");
  await page.getByRole("button", { name: "Add item" }).click();
  await expect(page).toHaveURL(/\/studio\/items\//);
  await page.getByLabel("Markdown").fill("## Welcome\n\nThis article was written by an **E2E test**.");
  await page.getByRole("button", { name: /Callout/ }).click();
  await page.getByLabel("Callout text").fill("Remember to save.");
  await page.getByRole("button", { name: "Save article" }).click();
  await expect(page.getByText(/Saved · about/)).toBeVisible();

  // Back to the builder, add a quiz
  await page.getByRole("link", { name: `← ${title}` }).click();
  await page.getByLabel("Item type").selectOption("quiz");
  await page.getByLabel("Item title").fill("Pop quiz");
  await page.getByRole("button", { name: "Add item" }).click();
  await expect(page).toHaveURL(/\/studio\/items\//);
  await page.getByRole("button", { name: /Single choice/ }).click();
  await page.getByLabel("Prompt (Markdown)").fill("2 + 2 = ?");
  await page.getByPlaceholder("Option 1").fill("4");
  await page.getByPlaceholder("Option 2").fill("5");
  await page.getByLabel("Option 1 is correct").check();
  await page.getByRole("button", { name: "Save quiz" }).click();
  await expect(page.getByText("Saved ✓")).toBeVisible();

  // Publish and take it as a learner
  await page.getByRole("link", { name: `← ${title}` }).click();
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText("published", { exact: true })).toBeVisible();
  const slug = await page.locator("#slug").inputValue();
  await page.goto(`/courses/${slug}`);
  await page.getByRole("button", { name: /Enroll/ }).click();
  await expect(page.getByRole("heading", { name: "Welcome" })).toBeVisible();
  await expect(page.getByText("Remember to save.")).toBeVisible();
  await page.getByRole("button", { name: /Mark complete/ }).click();
  await expect(page.getByRole("heading", { name: "Pop quiz" })).toBeVisible();
  await page.getByText("4", { exact: true }).click();
  await page.getByRole("button", { name: /Submit answers/ }).click();
  await expect(page).toHaveURL(/\/verify\/DTA-/, { timeout: 20_000 }); // course complete → certificate

  // Lab builder: invalid spec is rejected, valid edit publishes a new version
  await page.goto("/studio/labs");
  await page.getByRole("link", { name: /FizzBuzz/ }).click();
  await page.waitForFunction(() => (window as unknown as { monaco?: unknown }).monaco !== undefined);
  const setYaml = (fn: string) =>
    page.evaluate((body) => {
      const monaco = (window as unknown as { monaco: { editor: { getModels: () => { getValue: () => string; setValue: (v: string) => void }[] } } }).monaco;
      const model = monaco.editor.getModels()[0];
      model.setValue(new Function("v", body)(model.getValue()) as string);
    }, fn);
  await setYaml("return v.replace('runtime:\\n  type: compile', 'runtime:\\n  type: docker');");
  await expect(page.getByText(/error/).first()).toBeVisible();
  await setYaml("return v.replace('type: docker', 'type: compile').replace('estimatedMinutes: 10', 'estimatedMinutes: 12');");
  await expect(page.getByText("Valid spec")).toBeVisible();
  await page.getByRole("button", { name: "Publish new version" }).click();
  await expect(page.getByText(/Published v\d+ ✓/)).toBeVisible();
});
