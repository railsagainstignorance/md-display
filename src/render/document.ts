import { parseFrontMatter } from "./frontmatter";
import type { Heading } from "./headings";
import { escapeHtml, renderMarkdown, type RenderEnv } from "./markdown";

export interface RenderedDocument {
  html: string;
  headings: Heading[];
  hasMermaid: boolean;
}

/**
 * A doc rendered as a document (not slides). Front matter shows as a YAML
 * code block, as GitLab shows it; otherwise its closing `---` would turn the
 * line above into a heading.
 */
export function renderDocument(text: string): RenderedDocument {
  const { body, block } = parseFrontMatter(text);
  const env: RenderEnv = {};
  const frontMatter =
    block === null ? "" : `<pre class="front-matter"><code class="language-yaml">${escapeHtml(block)}\n</code></pre>\n`;
  const html = frontMatter + renderMarkdown(body, {}, env);
  return { html, headings: env.headings ?? [], hasMermaid: env.hasMermaid ?? false };
}
