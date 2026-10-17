import type { NavItem } from "../../render/headings";
import { elementForFragment, USER_ID_PREFIX } from "../fragments";
import type { Nav } from "../nav";
import { storedFlag, storeFlag } from "../storage";
import { Contents } from "./contents";
import { Overlays } from "./overlays";
import { ThumbStrip } from "./thumbnails";

const NOTES_PAGE_CSS = "@page { size: A4 portrait; margin: 12mm; }";
const NEXT_KEYS = new Set(["ArrowRight", "ArrowDown", "PageDown", " ", "Enter"]);
const PREV_KEYS = new Set(["ArrowLeft", "ArrowUp", "PageUp", "Backspace"]);

export interface SlidesHost {
  rendered: HTMLElement;
  nav: Nav;
  /** The print page rules, swapped when speaker notes are shown. */
  pageStyle: HTMLStyleElement;
  /** Presenting shows the slides, so it closes the raw view. */
  hideRaw(): void;
  onNotesShown(shown: boolean): void;
}

/**
 * Slides view: speaker notes under the slides, overflow flags, and
 * presenting one slide at a time with thumbnails, contents and overlays.
 * The page re-renders the deck in place on every edit; `attach()` then
 * picks the presentation up again on the new slides.
 */
export class SlidesController {
  private active = false;
  private current = 0;
  private pageCss = "";
  private readonly strip = new ThumbStrip((n) => this.show(n));
  private readonly contents = new Contents((n) => this.show(n));
  private readonly overlays = new Overlays();

  constructor(private readonly host: SlidesHost) {
    document.body.classList.toggle("show-notes", storedFlag("local", "mddisplay-show-notes"));
    document.body.classList.toggle("show-thumbs", storedFlag("local", "mddisplay-show-thumbs"));
    document.body.classList.toggle("show-toc", storedFlag("local", "mddisplay-show-toc"));
    host.onNotesShown(this.notesShown);

    window.addEventListener("resize", () => this.checkOverflow());
    // Image load events don't bubble, but they can be caught on the way down.
    host.rendered.addEventListener("load", () => this.checkOverflow(), true);
    document.addEventListener("fullscreenchange", () => document.fullscreenElement || this.stopPresenting());
    document.addEventListener("click", (e) => {
      if (this.presenting && !(e.target as Element).closest("a, button, .present-overlay")) this.show(this.current + 1);
    });
  }

  get presenting(): boolean {
    return document.body.classList.contains("presenting");
  }

  private get notesShown(): boolean {
    return document.body.classList.contains("show-notes");
  }

  private wrappers(): HTMLElement[] {
    return [...this.host.rendered.querySelectorAll<HTMLElement>(":scope > .slide-wrapper")];
  }

  /** Called after each render of a deck: takes up the new slides, keeping the current one. */
  attach(items: NavItem[], pageCss: string): void {
    this.active = true;
    this.pageCss = pageCss;
    this.applyPageStyle();
    this.contents.build(items);
    this.host.rendered.prepend(this.strip.element);
    this.checkOverflow();
    if (this.presenting) this.show(this.current);
    this.refreshThumbs();
  }

  /** Leaving slides view (another doc, or the document view). */
  detach(): void {
    this.stopPresenting();
    this.active = false;
    this.host.pageStyle.textContent = "";
  }

  /** Slide content changed size (images loaded, diagrams drawn, the raw view closed). */
  contentChanged(): void {
    if (!this.active) return;
    this.checkOverflow();
    this.refreshThumbs();
  }

  toggleNotes(): void {
    const shown = document.body.classList.toggle("show-notes");
    storeFlag("local", "mddisplay-show-notes", shown);
    this.applyPageStyle();
    this.host.onNotesShown(shown);
  }

  private applyPageStyle(): void {
    if (this.active) this.host.pageStyle.textContent = this.notesShown ? NOTES_PAGE_CSS : this.pageCss;
  }

  startPresenting(): void {
    if (!this.active || this.presenting) return;
    this.host.hideRaw();
    const start = this.startSlide();
    document.body.classList.add("presenting");
    (document.activeElement as HTMLElement | null)?.blur(); // else Space/Enter would also press the button
    this.show(start);
    this.refreshThumbs();
    this.overlays.startTimer();
    // Without full screen (refused, or unsupported) it still fills the window.
    document.documentElement.requestFullscreen?.().catch(() => {});
  }

  stopPresenting(): void {
    if (!this.presenting) return;
    this.overlays.stopTimer();
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    document.body.classList.remove("presenting");
    const wrappers = this.wrappers();
    wrappers.forEach((w) => w.classList.remove("current"));
    this.checkOverflow();
    wrappers[this.current]?.scrollIntoView({ block: "start" });
  }

  /** The slide in view, or the one the URL names. */
  private startSlide(): number {
    const id = this.host.nav.activeId ?? location.hash.slice(1);
    const target = elementForFragment(id);
    return Math.max(0, this.wrappers().findIndex((w) => w === target));
  }

  private show(index: number): void {
    const wrappers = this.wrappers();
    this.current = Math.max(0, Math.min(index, wrappers.length - 1));
    if (!this.presenting) return;
    wrappers.forEach((w, n) => w.classList.toggle("current", n === this.current));
    const wrapper = wrappers[this.current];
    if (wrapper) history.replaceState(null, "", `#${wrapper.id.slice(USER_ID_PREFIX.length)}`);
    this.strip.highlight(this.current);
    this.overlays.fillNotes(wrapper);
    this.contents.place(wrapper?.querySelector("section.slide") ?? null, this.current);
  }

  private get thumbsShown(): boolean {
    return document.body.classList.contains("show-thumbs");
  }

  /** Copies the slides into the strip again, if it's showing. */
  private refreshThumbs(): void {
    if (!this.presenting || !this.thumbsShown) return;
    this.strip.build(this.wrappers());
    this.strip.scale();
    this.strip.highlight(this.current);
  }

  private toggle(className: string, key: string): void {
    storeFlag("local", key, document.body.classList.toggle(className));
  }

  /**
   * Flags slides whose content doesn't fit, so is cut off: on the slide, its
   * nav entry and its thumbnail.
   */
  private checkOverflow(): void {
    if (!this.active) return;
    this.wrappers().forEach((wrapper, n) => {
      const section = wrapper.querySelector<HTMLElement>("section.slide");
      if (!section?.clientHeight) return; // not laid out (raw view showing)
      const over = section.scrollHeight > section.clientHeight + 1 || section.scrollWidth > section.clientWidth + 1;
      wrapper.classList.toggle("overflowing", over);
      this.host.nav.mark(wrapper.id.slice(USER_ID_PREFIX.length), "overflowing", over);
      this.strip.markOverflow(n, over);
    });
  }

  /** Handles a slides shortcut; true if it was one. Other shortcuts do nothing while presenting. */
  handleKey(e: KeyboardEvent): boolean {
    if (!this.active) return false;
    if (!this.presenting) {
      if (e.key === "f") this.startPresenting();
      else if (e.key === "n") this.toggleNotes();
      else return false;
      return true;
    }
    if (e.key === " " && e.shiftKey) this.show(this.current - 1);
    else if (NEXT_KEYS.has(e.key)) this.show(this.current + 1);
    else if (PREV_KEYS.has(e.key)) this.show(this.current - 1);
    else if (e.key === "Home") this.show(0);
    else if (e.key === "End") this.show(this.wrappers().length - 1);
    else if (e.key === "Escape" || e.key === "f") this.stopPresenting(); // Escape only reaches here without full screen
    else if (e.key === "t") {
      this.toggle("show-thumbs", "mddisplay-show-thumbs");
      this.refreshThumbs();
    } else if (e.key === "n") this.overlays.toggle("notes");
    else if (e.key === "c") this.overlays.toggle("timer");
    else if (e.key === "i") {
      this.toggle("show-toc", "mddisplay-show-toc");
      this.show(this.current);
    } else return true;
    e.preventDefault();
    return true;
  }
}
