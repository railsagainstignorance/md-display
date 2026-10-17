// Marp acts on parsed tokens, so a `<!-- directive -->` or `![bg](…)` quoted
// as code is shown as written. This works on the Markdown text instead, so it
// masks code first: fenced blocks, then inline code spans.

export const FENCE_RE = /^\s*(```|~~~)/;

// An inline code span (any backtick-run length, never across a blank line),
// or a whole comment: matched together so a span inside a comment isn't
// mistaken for one and split the comment apart.
const CODE_SPAN_OR_COMMENT_RE = /<!--[\s\S]*?-->|(`+)(?!`)(?:(?!\n[ \t]*\n)[\s\S])*?(?<!`)\1(?!`)/g;
const PLACEHOLDER_RE = /\0(\d+)\0/g;

export type Replacer = (match: string, ...groups: string[]) => string;

/** Runs of lines, each inside a fenced code block or not. */
export function splitOutsideFences(text: string): { fenced: boolean; chunk: string }[] {
  const runs: { fenced: boolean; chunk: string }[] = [];
  let buf: string[] = [];
  let fenced = false;
  for (const line of text.split("\n")) {
    if (FENCE_RE.test(line)) {
      if (!fenced) {
        if (buf.length) runs.push({ fenced: false, chunk: buf.join("\n") });
        buf = [line];
        fenced = true;
      } else {
        buf.push(line);
        runs.push({ fenced: true, chunk: buf.join("\n") });
        buf = [];
        fenced = false;
      }
      continue;
    }
    buf.push(line);
  }
  if (buf.length) runs.push({ fenced, chunk: buf.join("\n") });
  return runs;
}

/** `text.replace(pattern, replacer)`, except inside fenced code blocks and inline code spans. */
export function subOutsideCode(pattern: RegExp, replacer: Replacer, text: string): string {
  return splitOutsideFences(text)
    .map(({ fenced, chunk }) => (fenced ? chunk : subOutsideCodeSpans(pattern, replacer, chunk)))
    .join("\n");
}

function subOutsideCodeSpans(pattern: RegExp, replacer: Replacer, chunk: string): string {
  const spans: string[] = [];
  const masked = chunk.replace(CODE_SPAN_OR_COMMENT_RE, (match, ticks: string | undefined) => {
    if (ticks === undefined) return match;
    spans.push(match);
    return `\0${spans.length - 1}\0`;
  });
  return masked.replace(pattern, replacer).replace(PLACEHOLDER_RE, (_, n: string) => spans[Number(n)]);
}
