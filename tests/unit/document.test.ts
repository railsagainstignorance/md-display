import { describe, expect, it } from "vitest";
import { renderDocument } from "../../src/render/document";
import { slugify } from "../../src/render/headings";

describe("slugify", () => {
  it("lowercases, hyphenates and drops punctuation", () => {
    expect(slugify("Hello, World! (v2)")).toBe("hello-world-v2");
  });

  it("keeps non-Latin letters", () => {
    expect(slugify("Café déjà vu")).toBe("café-déjà-vu");
  });
});

describe("renderDocument headings", () => {
  it("gives h1–h3 ids and lists them for the nav", () => {
    const doc = renderDocument("# One\n\n## Two `code`\n\n### Three\n\n#### Four\n");
    expect(doc.html).toContain('<h1 id="one">One</h1>');
    expect(doc.html).toContain('<h2 id="two-code">Two <code>code</code></h2>');
    expect(doc.html).toContain("<h4>Four</h4>");
    expect(doc.headings).toEqual([
      { level: 1, id: "one", text: "One", line: 0 },
      { level: 2, id: "two-code", text: "Two code", line: 2 },
      { level: 3, id: "three", text: "Three", line: 4 },
    ]);
  });

  it("numbers repeated headings so ids stay unique", () => {
    const ids = renderDocument("## Notes\n\n## Notes\n\n## Notes\n").headings.map((h) => h.id);
    expect(ids).toEqual(["notes", "notes-1", "notes-2"]);
  });

  it("drops inline markup and HTML from nav text", () => {
    expect(renderDocument("## **Bold** <kbd>r</kbd> key\n").headings[0].text).toBe("Bold r key");
  });
});

describe("renderDocument front matter", () => {
  it("shows front matter as a YAML block instead of a heading", () => {
    const html = renderDocument("---\nmarp: true\ntitle: <x>\n---\n# Hi\n").html;
    expect(html).toContain('<pre class="front-matter"><code class="language-yaml">marp: true\ntitle: &lt;x&gt;\n</code></pre>');
    expect(html).not.toContain("<h2>");
    expect(html).toContain('<h1 id="hi">Hi</h1>');
  });

  it("counts heading lines from the top of the file", () => {
    expect(renderDocument("---\ntitle: x\n---\n\n# Hi\n").headings[0].line).toBe(4);
  });

  it("adds nothing when there is no front matter", () => {
    expect(renderDocument("# Hi\n").html).not.toContain("front-matter");
  });
});

describe("CommonMark/GFM rendering, as GitLab does it", () => {
  const html = (text: string) => renderDocument(text).html;

  it("doesn't treat #123 at the start of a line as a heading", () => {
    expect(html("Intro\n\n#42 was the trigger\n")).toContain("<p>#42 was the trigger</p>");
  });

  it.each([2, 3, 4])("nests a list indented %i spaces", (indent) => {
    expect(html(`- a\n${" ".repeat(indent)}- b\n- c\n`)).toContain("<li>a\n<ul>\n<li>b</li>\n</ul>\n</li>");
  });

  it("starts a list directly after a paragraph", () => {
    const out = html("Para line\n- one\n- two\n");
    expect(out).toContain("<p>Para line</p>");
    expect(out).toContain("<li>one</li>");
  });

  it("keeps columns when rows mix leading pipes", () => {
    expect(html("Region | Q1 | Q2\n---|---|---\nNorth | 1 | 2\n| South | 3 | 4 |\n")).toContain(
      "<td>South</td>\n<td>3</td>\n<td>4</td>",
    );
  });
});

describe("Mermaid fences", () => {
  const FLOW = "```mermaid\ngraph TD\nA-->B & C\n```\n";

  it("become a mermaid pre with escaped source", () => {
    const doc = renderDocument(FLOW);
    expect(doc.html).toContain('<pre class="mermaid">graph TD\nA--&gt;B &amp; C\n</pre>');
    expect(doc.html).not.toContain("language-mermaid");
    expect(doc.hasMermaid).toBe(true);
  });

  it("still count with extra words in the info string", () => {
    expect(renderDocument("```mermaid title\ngraph TD\n```\n").hasMermaid).toBe(true);
  });

  it("leave other fences as code blocks", () => {
    const doc = renderDocument("```python\nx = 1\n```\n");
    expect(doc.html).toContain('<pre><code class="language-python">x = 1\n</code></pre>');
    expect(doc.hasMermaid).toBe(false);
  });

  it("aren't triggered by a mermaid fence shown inside a code block", () => {
    expect(renderDocument("````\n```mermaid\ngraph TD\n```\n````\n").hasMermaid).toBe(false);
  });
});
