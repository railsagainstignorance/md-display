// Markdown → Slack's mrkdwn. Lossy by design where Slack has no equivalent:
// headings become bold lines, tables an aligned code block, rules a plain
// divider. Fenced code blocks pass through untouched.

const FENCE_RE = /^\s*```/;
const TABLE_SEPARATOR_RE = /^\s*\|[\s:|-]+\|\s*$/;
const RULE_RE = /^\s*([-*_])\1{2,}\s*$/;
const HEADING_RE = /^#{1,6}\s+(.*)$/;
const DIVIDER = "—".repeat(20);

export function markdownToSlack(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (FENCE_RE.test(line)) {
      out.push(lines[i++]);
      while (i < lines.length && !FENCE_RE.test(lines[i])) out.push(lines[i++]);
      if (i < lines.length) out.push(lines[i++]);
      continue;
    }

    if (line.trim().startsWith("|") && i + 1 < lines.length && TABLE_SEPARATOR_RE.test(lines[i + 1])) {
      const tableLines = [line, lines[i + 1]];
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith("|")) tableLines.push(lines[i++]);
      out.push(tableAsText(tableLines));
      continue;
    }

    if (RULE_RE.test(line)) {
      out.push(DIVIDER);
      i++;
      continue;
    }

    const heading = HEADING_RE.exec(line);
    out.push(heading ? `*${inlineSlack(heading[1])}*` : inlineSlack(line));
    i++;
  }
  return out.join("\n");
}

/**
 * Bold, strikethrough and links within one line. Single-asterisk italics are
 * left alone (too easily confused with a `* ` bullet); `_italics_` already
 * match Slack's syntax.
 */
function inlineSlack(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "*$1*")
    .replace(/__(.+?)__/g, "*$1*")
    .replace(/~~(.+?)~~/g, "~$1~")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, "<$2|$1>");
}

/** Slack has no tables, so a padded monospace code block is the closest that still reads as one. */
function tableAsText(tableLines: string[]): string {
  const rows = tableLines
    .filter((_, i) => i !== 1) // the |---| separator row
    .map((line) =>
      line
        .trim()
        .replace(/^\||\|$/g, "")
        .split("|")
        .map((cell) => cell.trim()),
    );
  const width = Math.max(...rows.map((row) => row.length));
  const colWidths = Array.from({ length: width }, (_, c) => Math.max(...rows.map((row) => (row[c] ?? "").length)));
  const body = rows.map((row) => colWidths.map((w, c) => (row[c] ?? "").padEnd(w)).join("  "));
  return "```\n" + body.join("\n") + "\n```";
}
