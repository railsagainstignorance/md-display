import type { MarkdownIt, StateCore, Token } from "markdown-it";

export interface Heading {
  level: 1 | 2 | 3;
  id: string;
  text: string;
  /** The line (from 0) it's on in the rendered Markdown. */
  line: number;
}

/** An entry in the nav: a heading, or a slide (indented only when the deck's headings vary in level). */
export interface NavItem {
  level?: 1 | 2 | 3;
  id: string;
  text: string;
  /** The line (from 0) its heading or slide starts on in the doc's source, for the raw view. */
  line?: number;
}

export function slugify(text: string): string {
  return text
    .replace(/[*_`[\]()#]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}_-]/gu, "");
}

/** The heading's text as a reader sees it: inline markup and raw HTML tags dropped. */
function plainText(inline: Token): string {
  return (inline.children ?? [])
    .filter((child) => child.type === "text" || child.type === "code_inline")
    .map((child) => child.content)
    .join("")
    .trim();
}

export interface FirstHeading {
  level: number;
  text: string;
}

/**
 * Gives every `#`, `##` and `###` heading an id from its text (repeats get
 * `-1`, `-2`, … as on GitHub) and lists them in `env.headings` for the nav.
 * `env.firstHeading` is the first heading of any level. Renders sharing one
 * `env.idCounts` (a deck's slides) number repeats across all of them.
 */
export function headingIds(md: MarkdownIt): void {
  md.core.ruler.push("heading_ids", (state: StateCore) => {
    const headings: Heading[] = [];
    const env = state.env as { idCounts?: Map<string, number> };
    const seen = (env.idCounts ??= new Map());
    let first: FirstHeading | undefined;
    state.tokens.forEach((token, i) => {
      if (token.type !== "heading_open") return;
      const level = Number(token.tag.slice(1));
      const text = plainText(state.tokens[i + 1]);
      first ??= { level, text };
      if (level > 3) return;
      const base = slugify(text) || "section";
      const count = seen.get(base) ?? 0;
      seen.set(base, count + 1);
      const id = count ? `${base}-${count}` : base;
      token.attrSet("id", id);
      headings.push({ level: level as Heading["level"], id, text, line: token.map?.[0] ?? 0 });
    });
    state.env.headings = headings;
    state.env.firstHeading = first;
  });
}
