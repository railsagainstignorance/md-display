import { escapeHtml } from "../markdown";
import { subOutsideCode } from "./code";

// Marp's image alt keywords: `![bg …](u)` makes a slide background and
// `![w:400 alt](u)` a sized image. Any other image is left as it is.

const IMAGE_MD_RE = /!\[([^\]]*)\]\(\s*([^)\s]+)(?:\s+"[^"]*")?\s*\)/g;
const BG_SIZE_KEYWORDS: Record<string, string> = { cover: "cover", contain: "contain", fit: "contain", auto: "auto" };

export interface SlideBackground {
  url: string;
  size: string;
  split?: "left" | "right";
  /** The split's share of the slide, as a percentage. */
  splitWidth: string;
}

/** A Marp image size in slide pixels, scaled with the rendered slide; other units pass through. */
function slideLength(value: string, slideWidth: number): string {
  const m = /^(\d+(?:\.\d+)?)(?:px)?$/.exec(value);
  return m ? `calc(${m[1]} / ${slideWidth} * 100cqw)` : value;
}

/**
 * Applies the alt keywords in one slide's Markdown (outside code): `bg`
 * images are taken out as backgrounds, `w:`/`h:` images become sized `<img>`
 * tags.
 */
export function extractMarpImages(text: string, slideWidth: number): { text: string; backgrounds: SlideBackground[] } {
  const backgrounds: SlideBackground[] = [];
  const replaced = subOutsideCode(
    IMAGE_MD_RE,
    (match, alt: string, url: string) => {
      const tokens = alt.split(/\s+/).filter(Boolean);
      if (tokens.includes("bg")) {
        const bg: SlideBackground = { url, size: "cover", splitWidth: "50%" };
        for (const token of tokens) {
          const split = /^(left|right)(?::(\d+(?:\.\d+)?%))?$/.exec(token);
          if (Object.hasOwn(BG_SIZE_KEYWORDS, token)) bg.size = BG_SIZE_KEYWORDS[token];
          else if (/^\d+(?:\.\d+)?%$/.test(token)) bg.size = token;
          else if (split) {
            bg.split = split[1] as "left" | "right";
            bg.splitWidth = split[2] ?? "50%";
          }
        }
        backgrounds.push(bg);
        return "";
      }
      const styles: string[] = [];
      const altWords: string[] = [];
      for (const token of tokens) {
        const size = /^(w|width|h|height):(\S+)$/.exec(token);
        if (size) styles.push(`${size[1].startsWith("w") ? "width" : "height"}: ${slideLength(size[2], slideWidth)}`);
        else altWords.push(token);
      }
      if (!styles.length) return match;
      return `<img src="${escapeHtml(url)}" alt="${escapeHtml(altWords.join(" "))}" style="${escapeHtml(styles.join("; "))}">`;
    },
    text,
  );
  return { text: replaced, backgrounds };
}
