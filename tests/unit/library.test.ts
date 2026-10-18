import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LibraryError, openLibrary } from "../../server/library.ts";

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "md-display-library-"));
  const files: Record<string, string> = {
    "notes/a.md": "# A",
    "notes/z.markdown": "# Z",
    "notes/sub/b.md": "# B",
    "notes/img.png": "png",
    "notes/.hidden/c.md": "# C",
    "notes/node_modules/d.md": "# D",
    "notes/.env": "SECRET=1",
    "other/e.md": "# E",
    "outside.txt": "outside",
  };
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(dir, path, ".."), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  symlinkSync(join(dir, "outside.txt"), join(dir, "notes/link.txt"));
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("openLibrary", () => {
  it("lists a folder's Markdown, top level first, skipping hidden folders and node_modules", async () => {
    const library = await openLibrary([join(dir, "notes")]);
    expect(library.label).toBe("notes");
    expect(library.startDoc).toBeNull();
    expect(await library.listDocs()).toEqual(["a.md", "z.markdown", "sub/b.md"]);
  });

  it("opens one file, starting on it", async () => {
    const library = await openLibrary([join(dir, "notes/sub/b.md")]);
    expect(library.label).toBe("b.md");
    expect(library.startDoc).toBe("b.md");
    expect(await library.listDocs()).toEqual(["b.md"]);
  });

  it("serves several from the folder holding them all", async () => {
    const library = await openLibrary([join(dir, "notes/a.md"), join(dir, "other")]);
    expect(await library.listDocs()).toEqual(["notes/a.md", "other/e.md"]);
  });

  it("refuses a missing path or a file that isn't Markdown", async () => {
    await expect(openLibrary([join(dir, "nope.md")])).rejects.toThrow(LibraryError);
    await expect(openLibrary([join(dir, "outside.txt")])).rejects.toThrow(/isn't a Markdown file/);
  });
});

describe("resolve", () => {
  it("finds files under the root, Markdown or not", async () => {
    const library = await openLibrary([join(dir, "notes")]);
    expect(await library.resolve("sub/b.md")).toBe(join(library.root, "sub/b.md"));
    expect(await library.resolve("img.png")).toBe(join(library.root, "img.png"));
  });

  it.each(["../outside.txt", "sub/../a.md", "/etc/passwd", ".env", ".hidden/c.md", "", "sub/", "missing.md", "sub"])(
    "refuses %j",
    async (path) => {
      const library = await openLibrary([join(dir, "notes")]);
      expect(await library.resolve(path)).toBeNull();
    },
  );

  it("refuses a link leading out of the root", async () => {
    const library = await openLibrary([join(dir, "notes")]);
    expect(await library.resolve("link.txt")).toBeNull();
  });
});
