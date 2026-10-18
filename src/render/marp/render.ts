import type { NavItem } from "../headings";
import { escapeHtml, renderMarkdown, renderNotes, renderSlideInline, type RenderEnv } from "../markdown";
import { extractMarpImages, type SlideBackground } from "./images";
import { buildSlides, type Slide } from "./slides";

const SLIDE_SIZES: Record<string, [number, number]> = { "16:9": [1280, 720], "4:3": [960, 720] };
const SLIDE_BASE_FONT_PX = 29; // Marp's default theme body size on a 1280px-wide slide

// Where the notes and timer overlays sit while presenting: md-display's own
// front matter keys (`notesPosition`, `timerPosition`), not Marp's.
const OVERLAY_CORNERS = new Set(["top-left", "top-right", "bottom-left", "bottom-right"]);
const OVERLAY_DEFAULTS = { notes: "bottom-right", timer: "top-right" };
const OVERLAY_INSET_PX = 16;

export interface RenderedDeck {
  html: string;
  nav: NavItem[];
  /** Sizing for this deck's slide shape, and its overlay corners. */
  deckCss: string;
  /** The print page for slides alone (one slide per page). */
  pageCss: string;
  /** The front matter's `style:`, as written (ui/docCss.ts scopes it); empty when there is none. */
  userCss: string;
  hasMermaid: boolean;
  /** The front matter's `title:`, if any. */
  title?: string;
}

/** A corner name from front matter (`top-left`, `Top Right`, `lower left`, `bottom_left`…), normalised; null if it isn't one. */
export function overlayCorner(value: string): string | null {
  const words = value.trim().toLowerCase().split(/[\s_-]+/).filter(Boolean);
  const corner = words.map((w) => (w === "upper" ? "top" : w === "lower" ? "bottom" : w)).join("-");
  return OVERLAY_CORNERS.has(corner) ? corner : null;
}

function overlayCss(meta: Record<string, string>): string {
  const rules: string[] = [];
  for (const [which, fallback] of Object.entries(OVERLAY_DEFAULTS)) {
    const corner = overlayCorner(meta[`${which}Position`] ?? "") ?? fallback;
    const [vertical, horizontal] = corner.split("-");
    rules.push(`#mdd-present-${which} { ${vertical}: ${OVERLAY_INSET_PX}px; ${horizontal}: ${OVERLAY_INSET_PX}px; }`);
    // A left-hand overlay moves right of the thumbnail strip when that's showing.
    if (horizontal === "left") {
      rules.push(`body.show-thumbs #mdd-present-${which} { left: calc(var(--thumb-w) + ${OVERLAY_INSET_PX}px); }`);
    }
  }
  return rules.join("\n");
}

function deckCss(width: number, height: number, meta: Record<string, string>): string {
  const ratio = `${width} / ${height}`;
  return [
    `.slide-frame { aspect-ratio: ${ratio}; }`,
    `body.presenting .slide-frame { width: min(100vw, calc(100vh * ${ratio})); }`,
    `body.presenting.show-thumbs .slide-wrapper .slide-frame { width: min(calc(100vw - var(--thumb-w)), calc(100vh * ${ratio})); }`,
    `#mdd-rendered section.slide { font-size: calc(${SLIDE_BASE_FONT_PX} / ${width} * 100cqw); }`,
    `#mdd-thumb-strip .thumb-view { aspect-ratio: ${ratio}; }`,
    `body.presenting #mdd-thumb-strip .slide-frame { width: ${width}px; }`,
    overlayCss(meta),
  ].join("\n");
}

function attr(name: string, value: string): string {
  return ` ${name}="${escapeHtml(value)}"`;
}

function background(bg: SlideBackground, slideStyles: string[]): string {
  const styles = [`background-size: ${bg.size}`];
  let className = "slide-bg";
  if (bg.split) {
    className += ` slide-bg-${bg.split}`;
    // A share of the space beside the presenting contents column (the whole
    // slide when it isn't showing), so the split keeps its shape.
    const fraction = Number.parseFloat(bg.splitWidth) / 100;
    const share = `(100% - var(--toc-shift, 0px)) * ${fraction}`;
    styles.push(`width: calc(${share})`);
    const shift = bg.split === "left" ? "var(--toc-shift, 0px) + " : "";
    slideStyles.push(`padding-${bg.split}: calc(${shift}${share} + 2.7em)`);
  }
  return `<div${attr("class", className)}${attr("data-mdd-bg", bg.url)}${attr("style", styles.join("; "))}></div>`;
}

interface RenderedSlide {
  html: string;
  line: number;
  /** Level and text of its first heading, if it has one. */
  heading?: { level: number; text: string };
  hasMermaid: boolean;
}

function renderSlide(slide: Slide, number: number, width: number, idCounts: Map<string, number>): RenderedSlide {
  const d = slide.directives;
  const { text, backgrounds } = extractMarpImages(slide.markdown, width);
  const classes = ["slide", ...(d.class ?? "").split(/\s+/).filter(Boolean)].join(" ");
  const styles: string[] = [];
  if (d.backgroundColor) styles.push(`background-color: ${d.backgroundColor}`);
  if (d.color) styles.push(`color: ${d.color}`);

  const parts: string[] = [];
  if (backgrounds.length) parts.push(background(backgrounds[0], styles)); // Only the first is used.
  if (d.header) parts.push(`<header>${renderSlideInline(d.header)}</header>`);
  const env: RenderEnv = { idCounts };
  parts.push(renderMarkdown(text, { slides: true }, env));
  if (d.footer) parts.push(`<footer>${renderSlideInline(d.footer)}</footer>`);
  if (d.paginate?.trim().toLowerCase() === "true") parts.push(`<span class="slide-number">${number}</span>`);

  const notes = slide.notes ? renderNotes(slide.notes) : '<p class="slide-notes-empty">No speaker notes.</p>';
  const sectionAttrs =
    attr("class", classes) +
    (styles.length ? attr("style", styles.join("; ")) : "") +
    (d.backgroundImage ? attr("data-mdd-bg-image", d.backgroundImage) : "");
  const html =
    `<div class="slide-wrapper" id="slide-${number}">\n<div class="slide-frame">\n` +
    `<section${sectionAttrs}>\n${parts.join("\n")}\n</section>\n</div>\n` +
    `<aside class="slide-notes"><div class="slide-notes-label">Speaker notes</div>\n${notes}\n</aside>\n</div>`;
  return { html, line: slide.line, heading: env.firstHeading, hasMermaid: env.hasMermaid ?? false };
}

/**
 * Each slide's nav indent from its first heading's level relative to the
 * deck's shallowest. All at one level, or none with a heading: a flat list.
 * A slide with no heading sits at the deepest level, with content slides.
 */
export function slideNavLevels(levels: (number | undefined)[]): (NavItem["level"] | undefined)[] {
  const present = [...new Set(levels.filter((lv) => lv !== undefined))].sort((a, b) => a - b);
  if (present.length < 2) return levels.map(() => undefined);
  return levels.map((lv) => (Math.min(present.indexOf(lv ?? present.at(-1)!), 2) + 1) as NavItem["level"]);
}

/**
 * A Marp deck: its slides, nav entries and the CSS its size and front matter
 * call for. `bodyLine` is the line the body starts on in the whole file.
 */
export function renderMarp(meta: Record<string, string>, body: string, bodyLine = 0): RenderedDeck {
  const size = meta.size?.trim() ?? "16:9";
  const [width, height] = Object.hasOwn(SLIDE_SIZES, size) ? SLIDE_SIZES[size] : SLIDE_SIZES["16:9"];
  const idCounts = new Map<string, number>();
  const slides = buildSlides(meta, body).map((slide, i) => renderSlide(slide, i + 1, width, idCounts));
  const levels = slideNavLevels(slides.map((s) => s.heading?.level));
  const nav = slides.map((s, i) => ({
    id: `slide-${i + 1}`,
    text: `${i + 1}. ${s.heading?.text || `Slide ${i + 1}`}`,
    level: levels[i],
    line: s.line + bodyLine,
  }));
  return {
    html: slides.map((s) => s.html).join("\n"),
    nav,
    deckCss: deckCss(width, height, meta),
    pageCss: `@page { size: ${width}px ${height}px; margin: 0; }`,
    userCss: meta.style ?? "",
    hasMermaid: slides.some((s) => s.hasMermaid),
    title: meta.title || undefined,
  };
}
