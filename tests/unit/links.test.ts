import { describe, expect, it } from "vitest";
import { resolveRelative } from "../../src/render/links";
import { byFolderThenName } from "../../src/source/fsAccess";

describe("resolveRelative", () => {
  it.each(["https://x.com/a.png", "http://x/a.png", "data:image/png;base64,AA", "mailto:a@b.c", "/abs.png", "#frag", ""])(
    "leaves %j alone",
    (href) => expect(resolveRelative("doc.md", href)).toBeNull(),
  );

  it("resolves beside the doc", () => {
    expect(resolveRelative("doc.md", "img/a.png")).toEqual({ path: "img/a.png", fragment: "" });
  });

  it("resolves from the doc's own folder", () => {
    expect(resolveRelative("sub/b.md", "../a.md#part")).toEqual({ path: "a.md", fragment: "part" });
    expect(resolveRelative("sub/b.md", "./c.md")).toEqual({ path: "sub/c.md", fragment: "" });
  });

  it("decodes encoded names", () => {
    expect(resolveRelative("doc.md", "img/a%20b.png")?.path).toBe("img/a b.png");
  });

  it("keeps the fragment encoded and drops a query", () => {
    expect(resolveRelative("doc.md", "b.md?x=1#caf%C3%A9")).toEqual({ path: "b.md", fragment: "caf%C3%A9" });
  });

  it.each(["../outside.png", "..%2Foutside.png", "sub/../../outside.png"])("refuses %j, which climbs out of the root", (href) =>
    expect(resolveRelative("doc.md", href)).toBeNull(),
  );

  it("refuses a folder or malformed encoding", () => {
    expect(resolveRelative("doc.md", "img/")).toBeNull();
    expect(resolveRelative("doc.md", "%E0%A4%A.png")).toBeNull();
  });
});

describe("byFolderThenName", () => {
  it("lists top-level docs first, then each folder's", () => {
    expect(["sub/a.md", "z.md", "a.md", "sub/deeper/x.md", "b/c.md"].sort(byFolderThenName)).toEqual([
      "a.md",
      "z.md",
      "b/c.md",
      "sub/a.md",
      "sub/deeper/x.md",
    ]);
  });
});
