import { expect, test } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The page served by the local server (server/cli.ts) on a folder of its
// own, rather than by the preview server the other specs use.

const SOURCE = ["--disable-warning=ExperimentalWarning", "server/cli.ts"];
// What the release package runs, compiled by `npm run build` (as the
// preview server's command does before these specs start).
const COMPILED = ["dist-server/cli.js"];

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
function serve(...args: string[]): Promise<string> {
  return serveWith(SOURCE, ...args);
}

/** Starts `cli` on `args`; anything on stderr, a warning included, fails it. */
async function serveWith(cli: string[], ...args: string[]): Promise<string> {
  const port = await freePort();
  const child = spawn(
    process.execPath,
    [...cli, "--no-browser", "--port", String(port), ...args],
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

test("the compiled server, as packaged for release, serves the same", async ({ page }) => {
  await page.goto(await serveWith(COMPILED, join(dir, "notes")));
  await expect(page.locator("#mdd-rendered h1")).toHaveText("Doc A");
  await expect(page.locator('#mdd-doc-select optgroup[label="📁 notes"] option')).toHaveText(["a.md", "sub/b.md"]);
  writeFileSync(join(dir, "notes/a.md"), "# Doc A, edited\n");
  await expect(page.locator("#mdd-rendered h1")).toHaveText("Doc A, edited", { timeout: 5000 });
});

test("updates live when a file changes, with no Reload button", async ({ page }) => {
  await page.goto(await serve(join(dir, "notes")));
  await expect(page.locator("#mdd-rendered h1")).toHaveText("Doc A");
  writeFileSync(join(dir, "notes/a.md"), "# Doc A, edited\n");
  await expect(page.locator("#mdd-rendered h1")).toHaveText("Doc A, edited", { timeout: 5000 });
  await expect(page.getByRole("button", { name: "🔄 Reload" })).toBeHidden();
});

test("a doc can't send the reader to a file that would run as md-display", async ({ page, request }) => {
  const evil = "<script>fetch('/api/docs')</script>";
  writeFileSync(join(dir, "notes/evil.html"), evil);
  writeFileSync(join(dir, "notes/evil.svg"), `<svg xmlns="http://www.w3.org/2000/svg">${evil}</svg>`);
  const base = await serve(join(dir, "notes"));
  const absolute = new URL("/api/file?path=evil.svg", base).href;
  writeFileSync(
    join(dir, "notes/a.md"),
    `# Doc A\n\n[site-absolute](/api/file?path=evil.html) · [absolute](${absolute}) · [web](https://example.com)\n`,
  );
  await page.goto(base);

  // Links into md-display's own address are turned off; others are left alone.
  await expect(page.getByText("site-absolute", { exact: true })).not.toHaveAttribute("href");
  await expect(page.getByText("absolute", { exact: true })).not.toHaveAttribute("href");
  await expect(page.getByText("web", { exact: true })).toHaveAttribute("href", "https://example.com");

  // Opened directly, a file is sandboxed, and anything that could run is a download.
  for (const [path, download] of [["evil.html", true], ["evil.svg", true], ["img/dot.svg", true], ["a.md", false]] as const) {
    const res = await request.get(new URL(`/api/file?path=${path}`, base).href);
    expect(res.headers()["content-security-policy"]).toMatch(/^sandbox;/);
    expect(res.headers()["content-disposition"]).toBe(download ? "attachment" : undefined);
  }
});

test("another site can't load a doc's files, even to see if they're there", async ({ request }) => {
  const file = new URL("/api/file?path=img/dot.svg", await serve(join(dir, "notes"))).href;
  for (const site of ["cross-site", "same-site"]) {
    expect((await request.get(file, { headers: { "sec-fetch-site": site } })).status()).toBe(403);
  }
  const own = await request.get(file, { headers: { "sec-fetch-site": "same-origin" } });
  expect(own.status()).toBe(200);
  expect(own.headers()["cross-origin-resource-policy"]).toBe("same-origin");
});

test("a doc's CSS styles only the doc, and can't load anything", async ({ page }) => {
  const leak = "http://127.0.0.1:9/leak";
  writeFileSync(
    join(dir, "notes/a.md"),
    `# Doc A\n\n<style>h1 { color: rgb(1, 2, 3) }\n#mdd-nav, & ~ #mdd-raw-source { outline: 7px solid red }\n` +
      `:root:has(option[value*="b.md"]) :scope { background-image: url(${leak}) }\n` +
      `:scope { --x: \\75 rl(${leak}); background-image: var(--x) }</style>\n`,
  );
  writeFileSync(
    join(dir, "notes/deck.md"),
    "---\nmarp: true\nstyle: |\n  section { color: rgb(4, 5, 6); }\n  } #mdd-toolbar { outline: 7px solid red } .x {\n---\n# Slide\n",
  );
  const requested: string[] = [];
  page.on("request", (req) => requested.push(req.url()));
  const base = await serve(join(dir, "notes"));
  const outline = (selector: string) => page.locator(selector).evaluate((el) => getComputedStyle(el).outlineStyle);

  await page.goto(base);
  await expect(page.locator("#mdd-rendered h1")).toHaveCSS("color", "rgb(1, 2, 3)");
  expect(await outline("#mdd-nav")).toBe("none");
  expect(await outline("#mdd-raw-source")).toBe("none");

  await page.goto(`${base}?doc=local%2Fdeck.md`);
  await expect(page.locator("#mdd-rendered section").first()).toHaveCSS("color", "rgb(4, 5, 6)");
  expect(await outline("#mdd-toolbar")).toBe("none");
  expect(requested.filter((url) => url.startsWith(leak))).toEqual([]);
});

test("started on one file, opens it; --no-demo leaves the demo out", async ({ page }) => {
  const url = await serve("--no-demo", join(dir, "notes/sub/b.md"));
  expect(url).toMatch(/\?doc=local%2Fb\.md$/);
  await page.goto(url);
  await expect(page.locator("#mdd-rendered h1")).toHaveText("Doc B");
  await expect(page.locator("#mdd-doc-select option")).toHaveText(["b.md"]);
});
