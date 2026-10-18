import { dedent } from "./text";

// A leading `---`-fenced block at the very start of the file.
const FRONT_MATTER_RE = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;
const KEY_VALUE_RE = /^(_?[A-Za-z][\w-]*):\s*(.*?)\s*$/;
const BLOCK_SCALAR_MARKERS = new Set(["|", "|-", ">", ">-"]);

export interface FrontMatter {
  meta: Record<string, string>;
  /** The text after the front matter (all of it when there is none). */
  body: string;
  /** The front matter's own lines, without its `---` fences; null when there is none. */
  block: string | null;
  /** The line (from 0) the body starts on in the whole text. */
  bodyLine: number;
}

export function parseFrontMatter(text: string): FrontMatter {
  const m = FRONT_MATTER_RE.exec(text);
  if (!m) return { meta: {}, body: text, block: null, bodyLine: 0 };
  const bodyLine = m[0].split("\n").length - 1;
  return { meta: parseFlatYaml(m[1]), body: text.slice(m[0].length), block: m[1], bodyLine };
}

/**
 * A flat `key: value` mapping: the subset of YAML that Marp front matter and
 * directive comments use. `key: |` block scalars read the following indented
 * lines. Lines that aren't `key: value` are skipped.
 */
export function parseFlatYaml(block: string): Record<string, string> {
  const data: Record<string, string> = {};
  const lines = block.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const m = KEY_VALUE_RE.exec(lines[i++]);
    if (!m) continue;
    const [, key, value] = m;
    if (BLOCK_SCALAR_MARKERS.has(value)) {
      const blockLines: string[] = [];
      while (i < lines.length && (/^[ \t]/.test(lines[i]) || !lines[i].trim())) {
        blockLines.push(lines[i++]);
      }
      data[key] = dedent(blockLines).replace(/^\n+|\n+$/g, "");
    } else {
      data[key] = unquote(value);
    }
  }
  return data;
}

function unquote(value: string): string {
  const quote = value[0];
  if (value.length >= 2 && (quote === '"' || quote === "'") && value.at(-1) === quote) {
    return value.slice(1, -1);
  }
  return value;
}
