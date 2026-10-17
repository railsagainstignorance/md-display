import { parseFlatYaml } from "../frontmatter";
import { dedent } from "../text";
import { FENCE_RE, subOutsideCode } from "./code";

// A Marp deck's body as slides: split on `---`, with each slide's directive
// comments resolved and its other comments taken out as speaker notes.

const SLIDE_SEPARATOR_RE = /^---[ \t]*$/;
const COMMENT_RE = /<!--([\s\S]*?)-->/g;

/**
 * Directives that can vary per slide: set globally (front matter), as a
 * persistent local (`<!-- key: v -->`) or a spot one (`<!-- _key: v -->`).
 */
export const LOCAL_DIRECTIVES = new Set([
  "paginate",
  "header",
  "footer",
  "class",
  "backgroundColor",
  "backgroundImage",
  "color",
]);

/**
 * Global-only directives: recognised, so a comment holding one is a directive
 * rather than a speaker note, though most are then ignored.
 */
export const GLOBAL_DIRECTIVES = new Set([
  "marp",
  "theme",
  "size",
  "style",
  "headingDivider",
  "title",
  "description",
  "author",
  "notesPosition",
  "timerPosition",
]);

export interface Slide {
  markdown: string;
  notes: string;
  directives: Record<string, string>;
}

export function isMarp(meta: Record<string, string>): boolean {
  return meta.marp?.trim().toLowerCase() === "true";
}

/** Per-slide Markdown, split on `---` lines that aren't inside a fenced code block. */
export function splitSlides(body: string): string[] {
  const slides: string[][] = [[]];
  let fenced = false;
  for (const line of body.split("\n")) {
    if (FENCE_RE.test(line)) fenced = !fenced;
    if (!fenced && SLIDE_SEPARATOR_RE.test(line)) {
      slides.push([]);
      continue;
    }
    slides.at(-1)!.push(line);
  }
  return slides.map((lines) => trimBlankLines(lines.join("\n")));
}

/**
 * A comment's directives, or null if it's a speaker note instead. As in
 * Marp, a comment is a directive only if every non-blank line is a `key:`
 * naming a known directive; anything else makes the whole comment a note.
 */
export function parseDirectiveComment(comment: string): Record<string, string> | null {
  const lines = comment
    .trim()
    .split(/\r?\n/)
    .filter((line) => line.trim());
  if (!lines.length) return null;
  for (const line of lines) {
    const m = /^\s*_?([A-Za-z]+):/.exec(line);
    if (!m || !(LOCAL_DIRECTIVES.has(m[1]) || GLOBAL_DIRECTIVES.has(m[1]))) return null;
  }
  return parseFlatYaml(lines.map((line) => line.trim()).join("\n"));
}

/**
 * Parses a Marp body into slides, resolving each slide's directives (global →
 * persistent local → spot) and taking out its speaker notes. Comments inside
 * fenced or inline code are left alone.
 */
export function buildSlides(meta: Record<string, string>, body: string): Slide[] {
  const persistent: Record<string, string> = {};
  for (const [key, value] of Object.entries(meta)) if (LOCAL_DIRECTIVES.has(key)) persistent[key] = value;

  return splitSlides(body).map((raw) => {
    const spot: Record<string, string> = {};
    const notes: string[] = [];
    const kept = subOutsideCode(
      COMMENT_RE,
      (_, comment: string) => {
        const directives = parseDirectiveComment(comment);
        if (!directives) {
          if (comment.trim()) notes.push(dedent(comment.split(/\r?\n/)).trim());
          return "";
        }
        for (const [key, value] of Object.entries(directives)) {
          if (key.startsWith("_")) {
            if (LOCAL_DIRECTIVES.has(key.slice(1))) spot[key.slice(1)] = value;
          } else if (LOCAL_DIRECTIVES.has(key)) {
            persistent[key] = value;
          }
        }
        return "";
      },
      raw,
    );
    return { markdown: trimBlankLines(kept), notes: notes.join("\n\n"), directives: { ...persistent, ...spot } };
  });
}

function trimBlankLines(text: string): string {
  return text.replace(/^\n+|\n+$/g, "");
}
