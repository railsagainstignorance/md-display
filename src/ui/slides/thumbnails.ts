// The thumbnail strip while presenting (t): a copy of each slide's frame,
// laid out at the slide's full size and shrunk as a whole, so it's an exact
// miniature. It sits inside #mdd-rendered so the slide styles reach it.

export class ThumbStrip {
  readonly element: HTMLElement;

  constructor(onPick: (index: number) => void) {
    this.element = document.createElement("div");
    this.element.id = "mdd-thumb-strip";
    this.element.addEventListener("click", (e) => {
      const thumb = (e.target as Element).closest(".thumb");
      if (thumb) onPick([...this.element.children].indexOf(thumb));
    });
  }

  build(wrappers: HTMLElement[]): void {
    this.element.replaceChildren(
      ...wrappers.map((wrapper, n) => {
        const thumb = document.createElement("button");
        thumb.type = "button";
        thumb.className = "thumb";
        thumb.classList.toggle("overflowing", wrapper.classList.contains("overflowing"));
        const title = wrapper.querySelector("h1, h2, h3, h4, h5, h6")?.textContent?.trim();
        thumb.setAttribute("aria-label", `Slide ${n + 1}${title ? `: ${title}` : ""}`);
        const num = document.createElement("span");
        num.className = "thumb-num";
        num.textContent = String(n + 1);
        const frame = wrapper.querySelector(".slide-frame")!.cloneNode(true) as HTMLElement;
        frame.inert = true;
        frame.querySelectorAll(".slide-toc").forEach((el) => el.remove());
        // Copies mustn't reuse the slides' ids. Ids inside a Mermaid SVG stay:
        // its own styles and arrowheads refer to them.
        frame.querySelectorAll("[id]").forEach((el) => el.closest("svg") || el.removeAttribute("id"));
        const view = document.createElement("div");
        view.className = "thumb-view";
        view.append(frame);
        thumb.append(num, view);
        return thumb;
      }),
    );
  }

  /** Shrinks each full-size copy to its thumbnail's width. Only measurable while the strip shows. */
  scale(): void {
    const view = this.element.querySelector<HTMLElement>(".thumb-view");
    const frame = view?.firstElementChild as HTMLElement | null | undefined;
    if (view?.clientWidth && frame?.offsetWidth) {
      this.element.style.setProperty("--thumb-scale", String(view.clientWidth / frame.offsetWidth));
    }
  }

  highlight(current: number): void {
    const thumbs = [...this.element.children] as HTMLElement[];
    thumbs.forEach((t, n) => t.classList.toggle("current", n === current));
    const t = thumbs[current];
    if (!t || !this.element.clientHeight) return;
    // Scroll the strip only (scrollIntoView would also move the page).
    const strip = this.element;
    if (t.offsetTop < strip.scrollTop) strip.scrollTop = t.offsetTop - 12;
    else if (t.offsetTop + t.offsetHeight > strip.scrollTop + strip.clientHeight) {
      strip.scrollTop = t.offsetTop + t.offsetHeight - strip.clientHeight + 12;
    }
  }

  markOverflow(index: number, on: boolean): void {
    this.element.children[index]?.classList.toggle("overflowing", on);
  }
}
