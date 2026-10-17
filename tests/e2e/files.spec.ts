import { expect, test } from "@playwright/test";
import { clearFiles, stubPickers, writeFiles } from "./helpers";

const DOT_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><circle cx="10" cy="10" r="8"/></svg>';
const LONG = Array.from({ length: 80 }, (_, i) => `Paragraph ${i}.`).join("\n\n");

test.describe("with file handles (Chromium)", () => {
  test.beforeEach(async ({ page }) => {
    await stubPickers(page);
    await page.goto("/");
    await clearFiles(page);
    await writeFiles(page, {
      "a.md": "# Doc A\n\n![dot](img/dot.svg)\n\n[to b](sub/b.md#part) · [nowhere](missing.md) · [web](https://example.com)\n",
      "sub/b.md": `# Doc B\n\n${LONG}\n\n## Part\n\n[back](../a.md)\n`,
      "img/dot.svg": DOT_SVG,
      "notes.txt": "not markdown",
    });
  });

  test("opening a folder lists its Markdown files above the demo", async ({ page }) => {
    await page.getByRole("button", { name: "📁 Open folder…" }).click();
    await expect(page.locator("#mdd-rendered h1")).toHaveText("Doc A");
    await expect(page.locator('#mdd-doc-select optgroup[label="📁 notes"] option')).toHaveText(["a.md", "sub/b.md"]);
    await expect(page.locator('#mdd-doc-select optgroup[label="Demo"] option')).toHaveCount(2);
    await expect(page).toHaveURL(/\?doc=local%2Fa\.md$/);
  });

  test("shows images from the folder", async ({ page }) => {
    await page.getByRole("button", { name: "📁 Open folder…" }).click();
    const img = page.locator('#mdd-rendered img[alt="dot"]');
    await expect(img).toHaveAttribute("src", /^blob:/);
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBe(20);
  });

  test("links to other docs open them here; links to files that aren't open go nowhere", async ({ page }) => {
    await page.getByRole("button", { name: "📁 Open folder…" }).click();
    await expect(page.getByText("nowhere", { exact: true })).not.toHaveAttribute("href");
    await expect(page.getByText("web", { exact: true })).toHaveAttribute("href", "https://example.com");

    await page.getByText("to b", { exact: true }).click();
    await expect(page.locator("#mdd-rendered h1")).toHaveText("Doc B");
    await expect(page.locator("#user-content-part")).toBeInViewport();
    await expect(page).toHaveURL(/\?doc=local%2Fsub%2Fb\.md#part$/);

    await page.getByText("back", { exact: true }).click();
    await expect(page.locator("#mdd-rendered h1")).toHaveText("Doc A");
  });

  test("updates live when the file changes, keeping the reading position", async ({ page }) => {
    await page.getByRole("button", { name: "📁 Open folder…" }).click();
    await page.locator("#mdd-doc-select").selectOption("local/sub/b.md");
    await page.locator("#mdd-content").evaluate((el) => (el.scrollTop = 600));

    await writeFiles(page, { "sub/b.md": `# Doc B, edited\n\n${LONG}\n\n## Part\n` });
    await expect(page.locator("#mdd-rendered h1")).toHaveText("Doc B, edited", { timeout: 5000 });
    expect(await page.locator("#mdd-content").evaluate((el) => el.scrollTop)).toBe(600);
    await expect(page.getByRole("button", { name: "🔄 Reload" })).toBeHidden();
  });

  test("an opened file is remembered across reloads", async ({ page }) => {
    await page.getByRole("button", { name: "📄 Open file…" }).click();
    await expect(page.locator("#mdd-rendered h1")).toHaveText("Doc A");
    await page.reload();
    await expect(page.locator("#mdd-rendered h1")).toHaveText("Doc A");
    await expect(page.locator('#mdd-doc-select optgroup[label="Opened files"] option')).toHaveText(["a.md"]);
  });

  test("an opened file on its own can't reach images beside it, and says so", async ({ page }) => {
    await page.getByRole("button", { name: "📄 Open file…" }).click();
    await expect(page.locator('#mdd-rendered img[alt="dot"]')).toHaveClass(/mdd-missing/);
  });
});

test.describe("without file handles (Firefox, Safari)", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      delete (window as Partial<Window>).showOpenFilePicker;
      delete (window as Partial<Window>).showDirectoryPicker;
    });
    await page.goto("/");
  });

  const file = (name: string, text: string) => ({ name, mimeType: "text/markdown", buffer: Buffer.from(text) });

  test("opens files through a file input and offers Reload", async ({ page }) => {
    // A listener for the whole test keeps Playwright intercepting file choosers.
    // Otherwise it stops after the first, and may not start again before the second opens.
    page.on("filechooser", () => {});
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "📄 Open file…" }).click();
    await (await chooser).setFiles([file("one.md", "# One\n")]);
    await expect(page.locator("#mdd-rendered h1")).toHaveText("One");

    const reloadChooser = page.waitForEvent("filechooser");
    await page.keyboard.press("l");
    await (await reloadChooser).setFiles([file("one.md", "# One, edited\n")]);
    await expect(page.locator("#mdd-rendered h1")).toHaveText("One, edited");
  });

  test("opens dropped files", async ({ page }) => {
    const transfer = await page.evaluateHandle(() => {
      const dt = new DataTransfer();
      dt.items.add(new File(["# Dropped\n"], "dropped.md", { type: "text/markdown" }));
      return dt;
    });
    await page.dispatchEvent("body", "dragenter", { dataTransfer: transfer });
    await expect(page.locator("body")).toHaveClass(/mdd-dragging/);
    await page.dispatchEvent("body", "drop", { dataTransfer: transfer });
    await expect(page.locator("#mdd-rendered h1")).toHaveText("Dropped");
    await expect(page.locator("body")).not.toHaveClass(/mdd-dragging/);
  });
});
