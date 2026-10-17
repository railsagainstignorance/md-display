import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

const DEMO_SOURCE = readFileSync("demo/md-display-demo.md", "utf8");

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#mdd-rendered h1").first()).toBeVisible();
});

test("lists the doc's h1–h3 headings in the nav", async ({ page }) => {
  const links = page.locator("#mdd-nav-links a");
  await expect(links.first()).toHaveText("md-display");
  await expect(page.locator('#mdd-nav-links a.h2[data-id="tables"]')).toHaveText("Tables");
  await expect(page.locator('#mdd-nav-links a.h3[data-id="alignment"]')).toBeVisible();
});

test("clicking a nav link scrolls to it and highlights it", async ({ page }) => {
  await page.locator('#mdd-nav-links a[data-id="tables"]').click();
  await expect(page.locator("#user-content-tables")).toBeInViewport();
  await expect(page.locator('#mdd-nav-links a[data-id="tables"]')).toHaveClass(/active/);
});

test("r toggles the raw Markdown and is remembered across reloads", async ({ page }) => {
  await page.keyboard.press("r");
  await expect(page.locator("#mdd-raw-source")).toBeVisible();
  await expect(page.locator("#mdd-rendered")).toBeHidden();
  expect(await page.locator("#mdd-raw-source").textContent()).toBe(DEMO_SOURCE);
  await expect(page.getByRole("button", { name: "📝 Show rendered view" })).toBeVisible();

  await page.reload();
  await expect(page.locator("#mdd-raw-source")).toBeVisible();

  await page.getByRole("button", { name: "📝 Show rendered view" }).click();
  await expect(page.locator("#mdd-rendered")).toBeVisible();
});

test("draws Mermaid diagrams", async ({ page }) => {
  await expect(page.locator("#mdd-rendered pre.mermaid svg").first()).toBeVisible({ timeout: 15_000 });
});

test("Copy for Slack puts mrkdwn on the clipboard", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByRole("button", { name: "📋 Copy for Slack" }).click();
  await expect(page.getByRole("button", { name: "✅ Copied!" })).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied.startsWith("*md-display*\n")).toBe(true);
});

test("Download raw Markdown saves the source as-is", async ({ page }) => {
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "⬇️ Download raw Markdown" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("md-display-demo.md");
  const path = await download.path();
  expect(readFileSync(path, "utf8")).toBe(DEMO_SOURCE);
});

test("the dropdown switches docs and the URL follows", async ({ page }) => {
  await page.locator("#mdd-doc-select").selectOption("demo/md-display-demo-slides.md");
  await expect(page).toHaveURL(/\?doc=demo%2Fmd-display-demo-slides\.md$/);
  await expect(page.locator("#mdd-rendered .slide-wrapper").first()).toBeVisible();
  await expect(page).toHaveTitle("md-display slide demo · md-display");
});

test("a ?doc= link opens that doc at the heading in its hash", async ({ page }) => {
  await page.goto("/?doc=demo/md-display-demo.md#tables");
  await expect(page.locator("#user-content-tables")).toBeInViewport();
  await expect(page.locator("#mdd-doc-select")).toHaveValue("demo/md-display-demo.md");
});

test("a heading whose id matches a word the page uses is still just a heading", async ({ page }) => {
  // The demo has a "Toolbar" heading; its id must not clash with the page's own elements.
  await page.locator('#mdd-nav-links a[data-id="toolbar"]').click();
  const heading = page.locator("#user-content-toolbar");
  await expect(heading).toBeInViewport();
  expect(await heading.evaluate((el) => el.tagName)).toBe("H3");
  await expect(heading).toHaveCSS("display", "block");
  await expect(page.locator('#mdd-nav-links a[data-id="toolbar"]')).toHaveClass(/active/);
});

test("in-page links scroll to their heading", async ({ page }) => {
  await page.locator('#mdd-rendered a[href="#slide-decks"]').first().click();
  await expect(page.locator("#user-content-slide-decks")).toBeInViewport();
  await expect(page).toHaveURL(/#slide-decks$/);
});
