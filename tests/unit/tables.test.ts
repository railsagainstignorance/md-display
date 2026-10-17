import { describe, expect, it } from "vitest";
import { renderMarkdown } from "../../src/render/markdown";

const CORNER = "|  | Q1 | Q2 |\n|---|---|---|\n| North | 1 | 2 |\n| South | 3 | 4 |";
const table = (text: string) => renderMarkdown(text);

describe("table headings", () => {
  it("gives header cells column scope", () => {
    const html = table("| A | B |\n|---|---|\n| 1 | 2 |");
    expect(html).toContain("<thead>");
    expect(html).toContain('<th scope="col">A</th>');
  });

  it("makes the first column row headings under an empty corner", () => {
    const html = table(CORNER);
    expect(html).toContain('<th scope="row">North</th>');
    expect(html).toContain('<th scope="row">South</th>');
    expect(html).toContain("<td>1</td>");
  });

  it("marks the empty corner cell, not as a column heading", () => {
    const html = table(CORNER);
    expect(html).toContain('<th class="table-corner"></th>');
    expect(html).toContain('<th scope="col">Q1</th>');
  });

  it("only marks the corner when it's empty", () => {
    expect(table("| Region | Q1 |\n|---|---|\n| North | 1 |")).not.toContain("table-corner");
  });

  it("keeps bold first cells bold under an empty corner", () => {
    const html = table("|  | **A** |\n|---|---|\n| **Row** | 1 |");
    expect(html).toContain('<th class="table-corner"></th>');
    expect(html).toContain('<th scope="col"><strong>A</strong></th>');
    expect(html).toContain('<th scope="row"><strong>Row</strong></th>');
  });

  it("leaves the first column as data without an empty corner", () => {
    const html = table("| Region | Q1 |\n|---|---|\n| North | 1 |");
    expect(html).toContain("<td>North</td>");
    expect(html).not.toContain('scope="row"');
  });

  it("makes a wholly bold first cell a row heading for that row only", () => {
    const html = table("| Region | Q1 |\n|---|---|\n| **Total** | 9 |\n| North | 1 |");
    expect(html).toContain('<th scope="row">Total</th>');
    expect(html).toContain("<td>North</td>");
  });

  it("leaves a partly bold first cell as data", () => {
    expect(table("| Region | Q1 |\n|---|---|\n| **North** east | 1 |")).toContain(
      "<td><strong>North</strong> east</td>",
    );
  });

  it("leaves two separately bold words as data", () => {
    expect(table("| Region | Q1 |\n|---|---|\n| **A** and **B** | 1 |")).toContain(
      "<td><strong>A</strong> and <strong>B</strong></td>",
    );
  });

  it("keeps explicit alignment on headings", () => {
    const html = table("|  | Q1 |\n|---:|:---:|\n| North | 1 |");
    expect(html).toContain('<th scope="row" style="text-align:right">North</th>');
    expect(html).toContain('<th scope="col" style="text-align:center">Q1</th>');
  });

  it("treats each table independently", () => {
    const html = table(CORNER + "\n\ntext\n\n| A | B |\n|---|---|\n| x | y |");
    expect(html).toContain('<th scope="row">North</th>');
    expect(html).toContain("<td>x</td>");
  });

  it("leaves a table inside a code block alone", () => {
    expect(table("```\n" + CORNER + "\n```")).not.toContain('scope="row"');
  });

  it("applies on slides too", () => {
    expect(renderMarkdown(CORNER, { slides: true })).toContain('<th scope="row">North</th>');
  });
});
