import { expect, test } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The page served by the local server (server/cli.ts) on a folder of its
// own, rather than by the preview server the other specs use.

const DOT_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><circle cx="10" cy="10" r="8"/></svg>';

let dir: string;
const servers: ChildProcess[] = [];

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const probe = createServer().listen(0, "127.0.0.1", () => {
      const { port } = probe.address() as { port: number };
      probe.close(() => resolve(port));
    });
  });
}

/** Starts md-display on `args`, resolving with the address it prints. */
async function serve(...args: string[]): Promise<string> {
  const port = await freePort();
  const child = spawn(
    process.execPath,
    ["--disable-warning=ExperimentalWarning", "server/cli.ts", "--no-browser", "--port", String(port), ...args],
    { env: { ...process.env, MD_DISPLAY_HOME: join(dir, "home") } },
  );
  servers.push(child);
  return new Promise((resolve, reject) => {
    let out = "";
    child.stdout.on("data", (chunk) => {
      out += chunk;
      const url = /http:\/\/\S+/.exec(out)?.[0];
      if (url) resolve(url);
    });
    child.stderr.on("data", (chunk) => reject(new Error(String(chunk))));
  });
}

test.beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "md-display-server-"));
  const files: Record<string, string> = {
    "notes/a.md": "# Doc A\n\n![dot](img/dot.svg)\n\n[to b](sub/b.md)\n",
    "notes/sub/b.md": "# Doc B\n",
    "notes/img/dot.svg": DOT_SVG,
  };
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(dir, path, ".."), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
});

test.afterEach(() => {
  for (const child of servers.splice(0)) child.kill();
  rmSync(dir, { recursive: true, force: true });
});

test("serves the folder's docs with nothing to pick, images included", async ({ page }) => {
  await page.goto(await serve(join(dir, "notes")));
  await expect(page.locator("#mdd-rendered h1")).toHaveText("Doc A");
  await expect(page.locator('#mdd-doc-select optgroup[label="📁 notes"] option')).toHaveText(["a.md", "sub/b.md"]);
  await expect(page.locator('#mdd-doc-select optgroup[label="Demo"] option')).toHaveCount(2);
  const img = page.locator('#mdd-rendered img[alt="dot"]');
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBe(20);

  await page.getByText("to b", { exact: true }).click();
  await expect(page.locator("#mdd-rendered h1")).toHaveText("Doc B");
  await expect(page).toHaveURL(/\?doc=local%2Fsub%2Fb\.md$/);
});

test("updates live when a file changes, with no Reload button", async ({ page }) => {
  await page.goto(await serve(join(dir, "notes")));
  await expect(page.locator("#mdd-rendered h1")).toHaveText("Doc A");
  writeFileSync(join(dir, "notes/a.md"), "# Doc A, edited\n");
  await expect(page.locator("#mdd-rendered h1")).toHaveText("Doc A, edited", { timeout: 5000 });
  await expect(page.getByRole("button", { name: "🔄 Reload" })).toBeHidden();
});

test("started on one file, opens it; --no-demo leaves the demo out", async ({ page }) => {
  const url = await serve("--no-demo", join(dir, "notes/sub/b.md"));
  expect(url).toMatch(/\?doc=local%2Fb\.md$/);
  await page.goto(url);
  await expect(page.locator("#mdd-rendered h1")).toHaveText("Doc B");
  await expect(page.locator("#mdd-doc-select option")).toHaveText(["b.md"]);
});
