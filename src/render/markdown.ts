import MarkdownIt, { type Env, type MarkdownIt as Md } from "markdown-it";
import { headingIds, type FirstHeading, type Heading } from "./headings";
import { tableHeadings } from "./tables";

export interface RenderEnv extends Env {
  headings?: Heading[];
  firstHeading?: FirstHeading;
  /** Shared across renders whose heading ids must stay unique together. */
  idCounts?: Map<string, number>;
  hasMermaid?: boolean;
}

/** A ```mermaid block becomes `<pre class="mermaid">` for Mermaid to draw, as on GitLab. */
function mermaidFences(md: Md): void {
  const fence = md.renderer.rules.fence!;
  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    if (token.info.trim().split(/\s+/)[0] !== "mermaid") return fence(tokens, idx, options, env, self);
    (env as RenderEnv).hasMermaid = true;
    return `<pre class="mermaid">${md.utils.escapeHtml(token.content)}</pre>\n`;
  };
}

// CommonMark/GFM as GitLab renders it: tables, strikethrough, bare URLs
// linked, raw HTML allowed, no typographic substitutions. Documents treat a
// single newline as a soft break; slides treat it as a hard break, as Marp does.
function createMarkdown(breaks: boolean): Md {
  const md = new MarkdownIt({ html: true, linkify: true, typographer: false, breaks });
  md.use(tableHeadings).use(mermaidFences);
  return md;
}

const documentMd = createMarkdown(false).use(headingIds);
const slideMd = createMarkdown(true).use(headingIds);
// Speaker notes: slide rendering, but their headings aren't the deck's.
const notesMd = createMarkdown(true);

export function renderMarkdown(text: string, { slides = false } = {}, env: RenderEnv = {}): string {
  return (slides ? slideMd : documentMd).render(text, env);
}

export function renderNotes(text: string): string {
  return notesMd.render(text, {});
}

/** One line of slide Markdown (a header or footer), without a wrapping `<p>`. */
export function renderSlideInline(text: string): string {
  return notesMd.renderInline(text, {});
}

export const escapeHtml = documentMd.utils.escapeHtml;
