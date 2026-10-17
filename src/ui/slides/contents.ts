import type { NavItem } from "../../render/headings";

// The contents column while presenting (i): the nav's entries, inside the
// live slide, its row highlighted. Too tall to fit, it's cropped with the
// live row third, except near either end, which stays uncropped.

export class Contents {
  private readonly element = document.createElement("nav");
  private readonly list = document.createElement("div");

  constructor(onPick: (index: number) => void) {
    this.element.className = "slide-toc";
    this.element.setAttribute("aria-label", "Slides");
    this.list.className = "slide-toc-list";
    this.element.append(this.list);
    this.list.addEventListener("click", (e) => {
      const row = (e.target as Element).closest("a");
      if (!row) return;
      e.preventDefault();
      onPick([...this.list.children].indexOf(row));
    });
  }

  build(items: NavItem[]): void {
    this.list.replaceChildren(
      ...items.map(({ id, text, level }) => {
        const row = document.createElement("a");
        row.href = `#${id}`;
        if (level) row.className = `h${level}`;
        row.textContent = text;
        return row;
      }),
    );
  }

  /** Moves the column into `section` (the live slide) and scrolls it to the live row. */
  place(section: HTMLElement | null, current: number): void {
    if (!section) return;
    if (this.element.parentNode !== section) section.append(this.element);
    const rows = [...this.list.children] as HTMLElement[];
    rows.forEach((r, n) => r.classList.toggle("active", n === current));
    if (!rows[current] || !this.list.clientHeight) return; // hidden
    const max = this.list.scrollHeight - this.list.clientHeight;
    this.list.scrollTop = Math.min(current >= 2 ? rows[current - 2].offsetTop : 0, max);
    this.element.classList.toggle("cropped-top", this.list.scrollTop > 0);
    this.element.classList.toggle("cropped-bottom", this.list.scrollTop < max - 1);
  }
}
