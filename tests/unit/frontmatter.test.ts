import { describe, expect, it } from "vitest";
import { parseFrontMatter } from "../../src/render/frontmatter";

describe("parseFrontMatter", () => {
  it("parses flat keys and strips quotes", () => {
    const { meta, body } = parseFrontMatter('---\nmarp: true\nfooter: "A: B"\n---\n# Hi\n');
    expect(meta).toEqual({ marp: "true", footer: "A: B" });
    expect(body).toBe("# Hi\n");
  });

  it("reads a block scalar value", () => {
    const { meta } = parseFrontMatter("---\nstyle: |\n  section {\n    color: red;\n  }\nmarp: true\n---\n");
    expect(meta.style).toBe("section {\n  color: red;\n}");
    expect(meta.marp).toBe("true");
  });

  it("returns the text unchanged when there is no front matter", () => {
    expect(parseFrontMatter("# Hi\n---\nx")).toEqual({ meta: {}, body: "# Hi\n---\nx", block: null });
  });

  it("only counts front matter at the very start", () => {
    expect(parseFrontMatter("\n---\nmarp: true\n---\n").meta).toEqual({});
  });

  it("returns the block's own lines", () => {
    expect(parseFrontMatter("---\na: 1\nb: 2\n---\nbody").block).toBe("a: 1\nb: 2");
  });
});
