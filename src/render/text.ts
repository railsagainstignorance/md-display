/** Removes the leading whitespace every non-blank line shares; blank lines become empty. */
export function dedent(lines: string[]): string {
  const indents = lines.filter((line) => line.trim()).map((line) => /^[ \t]*/.exec(line)![0].length);
  const common = indents.length ? Math.min(...indents) : 0;
  return lines.map((line) => (line.trim() ? line.slice(common) : "")).join("\n");
}
