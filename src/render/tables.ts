import type { MarkdownIt, StateCore, Token } from "markdown-it";

/**
 * Column and row heading semantics from conventions that need no new syntax
 * and still render normally on GitLab:
 *  - header cells get `scope="col"`;
 *  - an empty top-left header cell makes the whole first column row headings
 *    (the corner itself gets `class="table-corner"`, styled borderless);
 *  - otherwise a wholly bold first cell makes that row's first cell a row
 *    heading, with the bold removed since headings are bold already.
 */
export function tableHeadings(md: MarkdownIt): void {
  md.core.ruler.push("table_headings", (state: StateCore) => {
    const tokens = state.tokens;
    let inHead = false;
    let cornerEmpty = false;
    let firstCell = false;

    tokens.forEach((token, i) => {
      switch (token.type) {
        case "table_open":
          cornerEmpty = false;
          break;
        case "thead_open":
          inHead = true;
          break;
        case "thead_close":
          inHead = false;
          break;
        case "tr_open":
          firstCell = true;
          break;
        case "th_open":
          if (inHead && firstCell && !tokens[i + 1].content.trim()) {
            cornerEmpty = true;
            token.attrJoin("class", "table-corner");
          } else {
            prependAttr(token, "scope", "col");
          }
          firstCell = false;
          break;
        case "td_open": {
          if (!firstCell) break;
          firstCell = false;
          const inline = tokens[i + 1];
          if (cornerEmpty) {
            makeRowHeading(token, tokens[i + 2]);
          } else {
            const content = withoutBlankEnds(inline.children ?? []);
            if (isWhollyBold(content)) {
              inline.children = content.slice(1, -1);
              makeRowHeading(token, tokens[i + 2]);
            }
          }
          break;
        }
      }
    });
  });
}

function prependAttr(token: Token, name: string, value: string): void {
  token.attrs = [[name, value], ...(token.attrs ?? [])];
}

function makeRowHeading(open: Token, close: Token): void {
  open.tag = close.tag = "th";
  prependAttr(open, "scope", "row");
}

/** Inline tokens without the blank text tokens markdown-it leaves at either end. */
function withoutBlankEnds(children: Token[]): Token[] {
  const blank = (token: Token | undefined) => token?.type === "text" && !token.content.trim();
  let start = 0;
  let end = children.length;
  while (start < end && blank(children[start])) start++;
  while (end > start && blank(children[end - 1])) end--;
  return children.slice(start, end);
}

/** True when one `**…**` wraps all of the content. */
function isWhollyBold(children: Token[]): boolean {
  if (children.length < 2 || children[0].type !== "strong_open" || children.at(-1)!.type !== "strong_close") {
    return false;
  }
  let depth = 0;
  return children.every((child, i) => {
    if (child.type === "strong_open") depth++;
    if (child.type === "strong_close") depth--;
    return depth > 0 || i === children.length - 1;
  });
}
