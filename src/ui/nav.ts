import type { NavItem } from "../render/headings";
import { elementForFragment, USER_ID_PREFIX } from "./fragments";

// How far below the top of the view a heading counts as the one being read:
// just past where a nav click lands it (the headings' scroll-margin-top), so
// clicking a heading with another close below it highlights the one clicked.
const ACTIVE_OFFSET_PX = 24;

/** Lists the doc's headings (or a deck's slides) in the nav and keeps the one being read highlighted. */
export class Nav {
  /** The rendered elements the nav's entries point to. */
  private selector = "h1[id], h2[id], h3[id]";

  constructor(
    private readonly links: HTMLElement,
    private readonly rendered: HTMLElement,
  ) {
    // Scroll events don't bubble, so listen in the capture phase: the page
    // scrolls #mdd-content on wide screens and the window on narrow ones.
    document.addEventListener("scroll", () => this.updateActive(), { capture: true, passive: true });
    links.addEventListener("click", (e) => {
      const link = (e.target as Element).closest<HTMLAnchorElement>("a[data-id]");
      if (!link) return;
      e.preventDefault();
      elementForFragment(link.dataset.id!)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  show(items: NavItem[], selector = "h1[id], h2[id], h3[id]"): void {
    this.selector = selector;
    this.links.replaceChildren(
      ...items.map(({ level, id, text }) => {
        const a = document.createElement("a");
        a.href = `#${id}`;
        if (level) a.className = `h${level}`;
        a.dataset.id = id;
        a.textContent = text;
        return a;
      }),
    );
    this.updateActive();
  }

  /** The id of the entry being read. */
  get activeId(): string | undefined {
    return this.links.querySelector<HTMLAnchorElement>("a.active")?.dataset.id;
  }

  /** Flags (or unflags) the entry for `id`. */
  mark(id: string, className: string, on: boolean): void {
    this.entry(id)?.classList.toggle(className, on);
  }

  private entry(id: string): HTMLAnchorElement | undefined {
    return [...this.links.querySelectorAll<HTMLAnchorElement>("a[data-id]")].find((a) => a.dataset.id === id);
  }

  private updateActive(): void {
    // Presenting stacks every slide at the top of the screen; it keeps its own place.
    if (document.body.classList.contains("presenting")) return;
    const targets = this.rendered.querySelectorAll<HTMLElement>(this.selector);
    let current = targets[0]?.id;
    for (const target of targets) {
      if (target.getBoundingClientRect().top <= ACTIVE_OFFSET_PX) current = target.id;
    }
    current = current?.slice(USER_ID_PREFIX.length);
    for (const a of this.links.querySelectorAll<HTMLAnchorElement>("a[data-id]")) {
      a.classList.toggle("active", a.dataset.id === current);
    }
  }
}
