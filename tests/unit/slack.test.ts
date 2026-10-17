import { describe, expect, it } from "vitest";
import { markdownToSlack } from "../../src/render/slack";

describe("markdownToSlack", () => {
  it("turns a heading into a bold line", () => {
    expect(markdownToSlack("# Title")).toBe("*Title*");
  });

  it("turns **bold** into single asterisks", () => {
    expect(markdownToSlack("This is **bold** text.")).toBe("This is *bold* text.");
  });

  it("turns __bold__ into single asterisks", () => {
    expect(markdownToSlack("This is __bold__ text.")).toBe("This is *bold* text.");
  });

  it("turns strikethrough into single tildes", () => {
    expect(markdownToSlack("~~gone~~")).toBe("~gone~");
  });

  it("turns links into Slack's angle-bracket form", () => {
    expect(markdownToSlack("See [the docs](https://example.com/x).")).toBe("See <https://example.com/x|the docs>.");
  });

  it("turns a horizontal rule into a divider", () => {
    expect(markdownToSlack("---")).toBe("—".repeat(20));
  });

  it("passes fenced code through untouched", () => {
    const text = "```python\n**not bold**\n```";
    expect(markdownToSlack(text)).toBe(text);
  });

  it("turns a table into an aligned code block", () => {
    const result = markdownToSlack("| Name | Age |\n|------|-----|\n| Alice | 30 |\n| Bo | 4 |");
    expect(result.startsWith("```\n")).toBe(true);
    expect(result.endsWith("\n```")).toBe(true);
    const lines = result.replace(/^```\n|\n```$/g, "").split("\n");
    expect(lines[0].startsWith("Name")).toBe(true);
    expect(lines[1].startsWith("Alice")).toBe(true);
    expect(new Set(lines.map((line) => line.length)).size).toBe(1);
  });

  it("pads ragged table rows before aligning", () => {
    expect(markdownToSlack("| A | B | C |\n|---|---|---|\n| 1 | 2 |\n| x | y | z |")).toContain("```");
  });
});
