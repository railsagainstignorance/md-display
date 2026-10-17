import { describe, expect, it } from "vitest";
import { renderMarkdown } from "../../src/render/markdown";

describe("renderMarkdown", () => {
  it("renders GFM tables and strikethrough", () => {
    const html = renderMarkdown("| a | b |\n|---|---|\n| 1 | 2 |\n\n~~gone~~");
    expect(html).toContain("<table>");
    expect(html).toContain("<s>gone</s>");
  });

  it("links bare URLs", () => {
    expect(renderMarkdown("see https://example.com")).toContain('<a href="https://example.com">');
  });

  it("passes raw HTML through", () => {
    expect(renderMarkdown("<kbd>r</kbd>")).toContain("<kbd>r</kbd>");
  });

  it("treats a single newline as a soft break in documents", () => {
    expect(renderMarkdown("one\ntwo")).not.toContain("<br>");
  });

  it("treats a single newline as a hard break on slides", () => {
    expect(renderMarkdown("one\ntwo", { slides: true })).toContain("<br>");
  });

  it("leaves quotes and dashes alone", () => {
    expect(renderMarkdown('"a" -- b')).toContain("&quot;a&quot; -- b");
  });
});
