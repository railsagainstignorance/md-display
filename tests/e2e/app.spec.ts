import { expect, test } from "@playwright/test";
import { clearFiles, writeFiles } from "./helpers";

// The installable app: offline use, the manifest, and files the operating
// system opens with it.

test("works offline once it has been visited, Mermaid included", async ({ page, context }) => {
  await page.goto("/");
  await expect(page.locator("#mdd-rendered h1").first()).toBeVisible();
  // The service worker caches the whole app as it installs.
  await page.evaluate(() => navigator.serviceWorker.ready);
  await context.setOffline(true);
  await page.goto("/?doc=demo/md-display-demo.md");
  await expect(page.locator("#mdd-rendered h1").first()).toHaveText("md-display");
  await expect(page.locator("#mdd-rendered pre.mermaid svg").first()).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".mermaid-load-error")).toHaveCount(0);
  await expect(page.locator('#mdd-rendered img[alt="A sample image"]')).toHaveJSProperty("complete", true);
  expect(await page.locator('#mdd-rendered img[alt="A sample image"]').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);

  await page.goto("/?doc=demo/md-display-demo-slides.md");
  await expect(page.locator(".slide-wrapper").first()).toBeVisible();
});

test("is installable, and handles .md files", async ({ page, request }) => {
  await page.goto("/");
  const href = await page.locator('link[rel="manifest"]').getAttribute("href");
  const manifest = await (await request.get(href!)).json();
  expect(manifest).toMatchObject({ name: "md-display", start_url: "./", display: "standalone" });
  expect(manifest.file_handlers[0].accept["text/markdown"]).toEqual([".md", ".markdown"]);
  for (const icon of manifest.icons) expect((await request.get(icon.src)).ok()).toBe(true);
});

test("opens the files it's launched with", async ({ page }) => {
  // Stands in for the browser's launch queue, handing over files from the private file system.
  await page.addInitScript(() => {
    const w = window as unknown as { launch: (params: LaunchParams) => void };
    // Chromium has its own (read-only) launchQueue, so this one is defined over it.
    const launchQueue: LaunchQueue = { setConsumer: (consumer) => (w.launch = consumer) };
    Object.defineProperty(window, "launchQueue", { value: launchQueue });
  });
  await page.goto("/");
  await clearFiles(page);
  await writeFiles(page, { "a.md": "# Launched\n" });
  await page.evaluate(async () => {
    const folder = await (await navigator.storage.getDirectory()).getDirectoryHandle("notes");
    (window as unknown as { launch: (params: LaunchParams) => void }).launch({ files: [await folder.getFileHandle("a.md")] });
  });
  await expect(page.locator("#mdd-rendered h1")).toHaveText("Launched");
  await expect(page.locator('#mdd-doc-select optgroup[label="Opened files"] option')).toHaveText(["a.md"]);
});
