import { describe, expect, it } from "vitest";
import { parseFrontMatter } from "../../src/render/frontmatter";
import { extractMarpImages } from "../../src/render/marp/images";
import { overlayCorner, renderMarp, slideNavLevels } from "../../src/render/marp/render";
import { buildSlides, isMarp, parseDirectiveComment, splitSlides } from "../../src/render/marp/slides";

const MARP_DECK = `---
marp: true
title: My Deck
paginate: true
footer: "**Acme** Deck"
---

# First slide

Intro text.

<!-- Say hello to the room. -->

---

<!-- _class: lead -->
<!-- _backgroundColor: #123456 -->

## Second slide

\`\`\`yaml
---
<!-- not a note -->
\`\`\`

<!--
Multi-line note.
- with a bullet
-->

---

<!-- paginate: false -->

### Third slide
`;

function deck(text: string) {
  const { meta, body, bodyLine } = parseFrontMatter(text);
  return renderMarp(meta, body, bodyLine);
}

const slides = (body: string) => deck(`---\nmarp: true\n---\n${body}`);

describe("isMarp", () => {
  it.each(["true", "True", " true "])("is true for marp: %j", (value) => {
    expect(isMarp({ marp: value })).toBe(true);
  });

  it.each<Record<string, string>>([{}, { marp: "false" }, { title: "x" }])("is false for %j", (meta) => {
    expect(isMarp(meta)).toBe(false);
  });
});

describe("splitSlides", () => {
  it("splits on --- lines", () => {
    expect(splitSlides("a\n---\nb\n---\nc")).toEqual(["a", "b", "c"]);
  });

  it("ignores a --- inside fenced code", () => {
    expect(splitSlides("a\n```\n---\n```\n---\nb")).toEqual(["a\n```\n---\n```", "b"]);
  });

  it("respects ~~~ fences too", () => {
    expect(splitSlides("~~~\n---\n~~~")).toHaveLength(1);
  });
});

describe("parseDirectiveComment", () => {
  it("reads local and spot directives", () => {
    expect(parseDirectiveComment(" paginate: true ")).toEqual({ paginate: "true" });
    expect(parseDirectiveComment("_class: lead")).toEqual({ _class: "lead" });
  });

  it("treats prose as a note", () => {
    expect(parseDirectiveComment("Remember: smile")).toBeNull();
  });

  it("treats the whole comment as a note when one key is unknown", () => {
    expect(parseDirectiveComment("class: lead\nmood: happy")).toBeNull();
  });

  it("treats an empty comment as neither", () => {
    expect(parseDirectiveComment("   ")).toBeNull();
  });
});

describe("buildSlides", () => {
  const { meta, body } = parseFrontMatter(MARP_DECK);
  const built = buildSlides(meta, body);

  it("splits the deck", () => {
    expect(built).toHaveLength(3);
  });

  it("takes note comments out of the content as notes", () => {
    expect(built[0].notes).toBe("Say hello to the room.");
    expect(built[0].markdown).not.toContain("<!--");
  });

  it("keeps a multi-line note's lines", () => {
    expect(built[1].notes).toBe("Multi-line note.\n- with a bullet");
  });

  it("leaves comments inside fenced code alone", () => {
    expect(built[1].markdown).toContain("<!-- not a note -->");
    expect(built[1].notes).not.toContain("not a note");
  });

  it("applies global directives to every slide", () => {
    expect(built[0].directives.footer).toBe("**Acme** Deck");
    expect(built[2].directives.footer).toBe("**Acme** Deck");
  });

  it("applies spot directives to their slide only", () => {
    expect(built[1].directives.class).toBe("lead");
    expect(built[1].directives.backgroundColor).toBe("#123456");
    expect(built[2].directives).not.toHaveProperty("class");
  });

  it("carries a local directive on from its slide", () => {
    expect(built[1].directives.paginate).toBe("true");
    expect(built[2].directives.paginate).toBe("false");
  });

  it("doesn't make global-only keys slide directives", () => {
    expect(built[0].directives).not.toHaveProperty("title");
  });
});

describe("inline code isn't acted on", () => {
  it("leaves a comment in inline code as neither note nor directive", () => {
    const [slide] = buildSlides({}, "Use `<!-- footer: x -->` to set it");
    expect(slide.notes).toBe("");
    expect(slide.directives).not.toHaveProperty("footer");
    expect(slide.markdown).toContain("`<!-- footer: x -->`");
  });

  it("protects double-backtick spans too", () => {
    expect(buildSlides({}, "See ``<!-- a note -->`` here")[0].notes).toBe("");
  });

  it("still acts on a real comment beside inline code", () => {
    const [slide] = buildSlides({}, "`<!-- not me -->`\n\n<!-- _class: lead -->");
    expect(slide.directives).toEqual({ class: "lead" });
    expect(slide.markdown).toContain("`<!-- not me -->`");
  });

  it("keeps a note containing backticks as a note", () => {
    const [slide] = buildSlides({}, "Body\n\n<!-- mention `code` in a note -->");
    expect(slide.notes).toBe("mention `code` in a note");
    expect(slide.markdown).not.toContain("<!--");
  });

  it("doesn't let an unclosed backtick hide a later paragraph's comment", () => {
    expect(buildSlides({}, "it`s here\n\n<!-- _class: lead -->\n\nmore`")[0].directives).toEqual({ class: "lead" });
  });

  it("leaves image syntax in inline code untouched", () => {
    const text = "`![bg](x.png)` and `![w:320](y.png)`";
    expect(extractMarpImages(text, 1280)).toEqual({ text, backgrounds: [] });
  });

  it("shows a quoted comment and keeps the real footer", () => {
    const html = slides("<!-- footer: real -->\n\nQuote `<!-- footer: fake -->` here\n").html;
    expect(html).toContain("<footer>real</footer>");
    expect(html).toContain("<code>&lt;!-- footer: fake --&gt;</code>");
  });
});

describe("extractMarpImages", () => {
  it("leaves a plain image alone", () => {
    expect(extractMarpImages("![alt](a.png)", 1280)).toEqual({ text: "![alt](a.png)", backgrounds: [] });
  });

  it("scales a width in slide pixels with the slide", () => {
    expect(extractMarpImages("![w:400 Chart](a.png)", 1280).text).toBe(
      '<img src="a.png" alt="Chart" style="width: calc(400 / 1280 * 100cqw)">',
    );
  });

  it("passes heights and non-px units through", () => {
    expect(extractMarpImages("![height:50% w:10em](a.png)", 1280).text).toContain('style="height: 50%; width: 10em"');
  });

  it("takes a bg image out of the content, cover by default", () => {
    const { text, backgrounds } = extractMarpImages("# T\n\n![bg](a.png)", 1280);
    expect(text).not.toContain("a.png");
    expect(backgrounds).toEqual([{ url: "a.png", size: "cover", splitWidth: "50%" }]);
  });

  it.each([
    ["bg contain", "contain"],
    ["bg fit", "contain"],
    ["bg 60%", "60%"],
    ["bg constructor", "cover"],
  ])("sizes ![%s] as %s", (alt, size) => {
    expect(extractMarpImages(`![${alt}](a.png)`, 1280).backgrounds[0].size).toBe(size);
  });

  it("splits left or right, with or without a width", () => {
    const [left, right] = extractMarpImages("![bg left](a.png)\n![bg right:40%](b.png)", 1280).backgrounds;
    expect([left.split, left.splitWidth]).toEqual(["left", "50%"]);
    expect([right.split, right.splitWidth]).toEqual(["right", "40%"]);
  });

  it("leaves images in fenced code alone", () => {
    const { text, backgrounds } = extractMarpImages("```\n![bg](a.png)\n```", 1280);
    expect(text).toContain("![bg](a.png)");
    expect(backgrounds).toEqual([]);
  });
});

describe("renderMarp", () => {
  const rendered = deck(MARP_DECK);

  it("wraps each slide", () => {
    expect(rendered.html.match(/class="slide-wrapper"/g)).toHaveLength(3);
    expect(rendered.html).toContain('id="slide-3"');
  });

  it("puts notes in an aside, and says when a slide has none", () => {
    expect(rendered.html).toContain('<aside class="slide-notes">');
    expect(rendered.html).toContain("<p>Say hello to the room.</p>");
    expect(rendered.html).toContain("No speaker notes.");
  });

  it("applies class, style, footer and pagination directives", () => {
    expect(rendered.html).toContain('<section class="slide lead" style="background-color: #123456">');
    expect(rendered.html).toContain("<footer><strong>Acme</strong> Deck</footer>");
    expect(rendered.html).toContain('<span class="slide-number">1</span>');
    expect(rendered.html).not.toContain('<span class="slide-number">3</span>');
  });

  it("lists slides in the nav by first heading, indented by level", () => {
    expect(rendered.nav).toEqual([
      { id: "slide-1", text: "1. First slide", level: 1, line: 6 },
      { id: "slide-2", text: "2. Second slide", level: 2, line: 13 },
      { id: "slide-3", text: "3. Third slide", level: 3, line: 30 },
    ]);
  });

  it("gives each slide's line in the file: its --- separator, or the body's start", () => {
    const deck = renderMarp({}, "# One\n\n---\n\n```\n---\n```\n\n---\n# Three", 3);
    expect(deck.nav.map((item) => item.line)).toEqual([3, 5, 11]);
  });

  it("names a slide with no heading by its number", () => {
    expect(slides("Just text\n").nav).toEqual([{ id: "slide-1", text: "1. Slide 1", level: undefined, line: 3 }]);
  });

  it("gives headings ids unique across the deck", () => {
    const html = slides("# Same\n\n---\n\n# Same\n").html;
    expect(html).toContain('<h1 id="same">');
    expect(html).toContain('<h1 id="same-1">');
  });

  it("takes the title from the front matter", () => {
    expect(rendered.title).toBe("My Deck");
  });

  it("sizes 16:9 by default and 4:3 on request", () => {
    expect(rendered.pageCss).toBe("@page { size: 1280px 720px; margin: 0; }");
    expect(rendered.deckCss).toContain("width: min(100vw, calc(100vh * 1280 / 720))");
    expect(rendered.deckCss).toContain(
      "body.presenting.show-thumbs .slide-wrapper .slide-frame { width: min(calc(100vw - var(--thumb-w)), calc(100vh * 1280 / 720)); }",
    );
    const four = deck("---\nmarp: true\nsize: 4:3\n---\n# A\n");
    expect(four.pageCss).toBe("@page { size: 960px 720px; margin: 0; }");
    expect(four.deckCss).toContain("aspect-ratio: 960 / 720");
  });

  it("passes the front matter's style on, for the page to scope", () => {
    const { userCss } = deck("---\nmarp: true\nstyle: |\n  section { color: red; }\n---\n# A\n");
    expect(userCss).toBe("section { color: red; }");
    expect(rendered.userCss).toBe("");
  });

  it("escapes directive values in attributes", () => {
    const html = slides('<!-- _color: red" onclick="x -->\n# A\n').html;
    expect(html).not.toContain('onclick="x');
    expect(html).toContain("color: red&quot; onclick=&quot;x");
  });

  it("notes Mermaid on any slide", () => {
    expect(slides("# A\n\n---\n\n```mermaid\ngraph TD\nA-->B\n```\n").hasMermaid).toBe(true);
    expect(rendered.hasMermaid).toBe(false);
  });

  it("renders Markdown inside column divs", () => {
    const html = slides('<div class="columns">\n<div>\n\n## Left\n- a\n\n</div>\n<div>\n\n**Right**\n\n</div>\n</div>\n').html;
    expect(html).toContain('<div class="columns">');
    expect(html).toContain("<li>a</li>");
    expect(html).toContain("<strong>Right</strong>");
    expect(html).toContain('<h2 id="left">Left</h2>');
  });

  it("leaves a div in fenced code alone", () => {
    expect(slides('```html\n<div class="columns">\n```\n').html).toContain("&lt;div class=&quot;columns&quot;&gt;");
  });

  it("allows a palette class as a slide class", () => {
    expect(slides("<!-- _class: bg-primary -->\n# A\n").html).toContain('<section class="slide bg-primary">');
  });
});

describe("slide backgrounds", () => {
  it("renders a full background for the page to load", () => {
    expect(slides("![bg contain](pic.png)\n# Title\n").html).toContain(
      '<div class="slide-bg" data-mdd-bg="pic.png" style="background-size: contain"></div>',
    );
  });

  it("pads the content side of a split, sharing the space beside the contents column", () => {
    const html = slides("![bg right:40%](pic.png)\n# Title\n").html;
    expect(html).toContain('class="slide-bg slide-bg-right"');
    expect(html).toContain("width: calc((100% - var(--toc-shift, 0px)) * 0.4)");
    expect(html).toContain('style="padding-right: calc((100% - var(--toc-shift, 0px)) * 0.4 + 2.7em)"');
  });

  it("uses only the first background on a slide", () => {
    expect(slides("![bg](a.png)\n![bg](b.png)\n").html).not.toContain("b.png");
  });

  it("passes the backgroundImage directive on for the page to load", () => {
    expect(slides("<!-- _backgroundImage: url('pic.png') -->\n# T\n").html).toContain(
      `data-mdd-bg-image="url('pic.png')"`,
    );
  });
});

describe("slideNavLevels", () => {
  it("is flat when every slide's heading is one level", () => {
    expect(slideNavLevels([2, 2, undefined])).toEqual([undefined, undefined, undefined]);
  });

  it("puts a slide without a heading at the deepest level", () => {
    expect(slideNavLevels([1, 2, undefined])).toEqual([1, 2, 2]);
  });

  it("caps the depth at three", () => {
    expect(slideNavLevels([1, 2, 3, 4])).toEqual([1, 2, 3, 3]);
  });
});

describe("overlay corners", () => {
  it.each([
    ["top-left", "top-left"],
    ["Top Right", "top-right"],
    ["lower left", "bottom-left"],
    ["bottom_right", "bottom-right"],
    ["middle", null],
  ])("reads %j as %j", (value, corner) => {
    expect(overlayCorner(value)).toBe(corner);
  });

  it("defaults to notes bottom right, timer top right", () => {
    const { deckCss } = slides("# A\n");
    expect(deckCss).toContain("#mdd-present-notes { bottom: 16px; right: 16px; }");
    expect(deckCss).toContain("#mdd-present-timer { top: 16px; right: 16px; }");
  });

  it("moves a left-hand overlay clear of the thumbnail strip", () => {
    const { deckCss } = deck("---\nmarp: true\nnotesPosition: bottom-left\n---\n# A\n");
    expect(deckCss).toContain("body.show-thumbs #mdd-present-notes { left: calc(var(--thumb-w) + 16px); }");
  });
});
