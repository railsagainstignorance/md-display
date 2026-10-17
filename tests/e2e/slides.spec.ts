import { expect, test, type Page } from "@playwright/test";
import { clearFiles, stubPickers, writeFiles } from "./helpers";

// Decks are opened from the origin private file system (see helpers.ts), so
// live updates go through the same watching as a user's own files.

test.use({ viewport: { width: 1280, height: 800 } });

let pageErrors: string[] = [];
test.beforeEach(({ page }) => {
  pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
});
test.afterEach(() => expect(pageErrors).toEqual([]));

const DECK = `---
marp: true
---
# One

---

# Two

---

# Three

---

# Four

---

# Five
`;

const DOT_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><circle cx="10" cy="10" r="8"/></svg>';

async function openDeck(page: Page, deck: string, files: Record<string, string> = {}) {
  await stubPickers(page);
  await page.goto("/");
  await clearFiles(page);
  await writeFiles(page, { "deck.md": deck, ...files });
  await page.getByRole("button", { name: "📁 Open folder…" }).click();
  await expect(page.locator("#mdd-rendered .slide-wrapper").first()).toBeVisible();
}

const current = (page: Page) =>
  page.evaluate(() => document.querySelector(".slide-wrapper.current")?.id.replace("user-content-", ""));
const presenting = (page: Page) => page.evaluate(() => document.body.classList.contains("presenting"));

/** Each matching element's `overflowing` flag. */
const flagged = (page: Page, selector: string) =>
  page.locator(selector).evaluateAll((els) => els.map((el) => el.classList.contains("overflowing")));

test.describe("slides view", () => {
  test("lists slides in the nav and scrolls to one", async ({ page }) => {
    await openDeck(page, DECK);
    await expect(page.locator("#mdd-nav-links a")).toHaveText(["1. One", "2. Two", "3. Three", "4. Four", "5. Five"]);
    await page.locator('#mdd-nav-links a[data-id="slide-3"]').click();
    await expect
      .poll(() => page.locator("#user-content-slide-3").evaluate((el) => Math.abs(el.getBoundingClientRect().top)))
      .toBeLessThan(40);
    await expect(page.locator('#mdd-nav-links a[data-id="slide-3"]')).toHaveClass(/active/);
  });

  test("s switches a deck to its document view and back, remembered for the doc", async ({ page }) => {
    await openDeck(page, DECK);
    await expect(page.getByRole("button", { name: "▶️ Present (f)" })).toBeVisible();
    await page.keyboard.press("s");
    await expect(page.locator("#mdd-rendered pre.front-matter")).toContainText("marp: true");
    await expect(page.locator("#mdd-rendered hr")).toHaveCount(4); // slide breaks are plain rules, as on GitLab
    await expect(page.locator("#mdd-nav-links a")).toHaveText(["One", "Two", "Three", "Four", "Five"]);
    await expect(page.getByRole("button", { name: /Present/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "🖨️ Print / Save as PDF" })).toBeVisible();

    await page.reload();
    await expect(page.locator("#mdd-rendered pre.front-matter")).toBeVisible();
    await page.getByRole("button", { name: "🎞️ Show as slides" }).click();
    await expect(page.locator("#mdd-rendered .slide-wrapper")).toHaveCount(5);
  });

  test("n shows each slide's speaker notes, and printing then includes them", async ({ page }) => {
    await openDeck(page, "---\nmarp: true\n---\n# One\n\n<!-- Say hello. -->\n\n---\n\n# Two\n");
    const notes = page.locator(".slide-notes");
    await expect(notes.first()).toBeHidden();
    await expect(page.getByRole("button", { name: "🖨️ Save slides as PDF" })).toBeVisible();
    await page.keyboard.press("n");
    await expect(notes).toHaveText([/Say hello\./, /No speaker notes\./]);
    await expect(page.getByRole("button", { name: "🖨️ Save slides + notes as PDF" })).toBeVisible();
    await page.reload();
    await expect(notes.first()).toBeVisible();
    await page.getByRole("button", { name: "🗒️ Hide speaker notes" }).click();
    await expect(notes.first()).toBeHidden();
  });

  test("prints one slide per page, at the slide's size", async ({ page }) => {
    // The demo deck has Mermaid diagrams: their hidden tooltip once added a blank last page.
    await page.goto("/?doc=demo/md-display-demo-slides.md");
    await expect(page.locator("#mdd-rendered pre.mermaid svg").first()).toBeVisible({ timeout: 15_000 });
    const slides = await page.locator(".slide-wrapper").count();
    const pdf = (await page.pdf({ preferCSSPageSize: true, printBackground: true })).toString("latin1");
    expect(pdf.match(/\/Type\s*\/Page[^s]/g)).toHaveLength(slides);
    expect(pdf).toMatch(/\/MediaBox\s*\[0 0 960 540\]/); // 1280 × 720 px, in points
  });

  test("Download raw Markdown saves the deck's source", async ({ page }) => {
    await openDeck(page, DECK);
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "⬇️ Download raw Markdown" }).click(),
    ]);
    expect(download.suggestedFilename()).toBe("deck.md");
  });

  test("shows backgrounds and sized images from the folder", async ({ page }) => {
    await openDeck(page, "---\nmarp: true\n---\n![bg right:40%](img/dot.svg)\n\n# Split\n\n![w:200](img/dot.svg)\n", {
      "img/dot.svg": DOT_SVG,
    });
    await expect(page.locator(".slide-bg")).toHaveCSS("background-image", /^url\("blob:/);
    await expect(page.locator("section.slide img")).toHaveAttribute("src", /^blob:/);
  });

  test("a link to a heading on a slide brings the whole slide into view", async ({ page }) => {
    await page.goto("/?doc=demo/md-display-demo.md");
    await page.locator('#mdd-rendered a[href*="two-columns"]').first().click();
    const wrapper = page.locator(".slide-wrapper", { has: page.locator("#user-content-two-columns") });
    await expect.poll(() => wrapper.evaluate((el) => Math.abs(el.getBoundingClientRect().top))).toBeLessThan(40);
  });

  test("updates live when the deck changes", async ({ page }) => {
    await openDeck(page, DECK);
    await writeFiles(page, { "deck.md": DECK.replace("# Two", "# Two edited") });
    await expect(page.locator('#mdd-nav-links a[data-id="slide-2"]')).toHaveText("2. Two edited", { timeout: 5000 });
  });

  test("the present button names every key and never splits one from its name", async ({ page }) => {
    await openDeck(page, DECK);
    const present = page.getByRole("button", { name: /Present/ });
    const lineHeight = await present.evaluate((b) => parseFloat(getComputedStyle(b).lineHeight) || 20);
    expect((await present.boundingBox())!.height).toBeGreaterThan(1.5 * lineHeight); // the nav is narrow enough to wrap it
    const parts = await present
      .locator(".keep")
      .evaluateAll((spans) => spans.map((s) => [s.textContent, s.getClientRects().length]));
    expect(parts).toEqual([
      ["▶️ Present (f)", 1],
      ["t thumbnails", 1],
      ["n notes", 1],
      ["c timer", 1],
      ["i contents", 1],
    ]);
  });
});

test.describe("presenting", () => {
  test("starts on the slide in view and steps through", async ({ page }) => {
    await openDeck(page, DECK);
    await page.locator('#mdd-nav-links a[data-id="slide-2"]').click();
    await expect(page.locator('#mdd-nav-links a[data-id="slide-2"]')).toHaveClass(/active/);
    await page.getByRole("button", { name: /Present/ }).click();
    expect(await presenting(page)).toBe(true);
    expect(await current(page)).toBe("slide-2");
    await page.keyboard.press("ArrowRight");
    expect(await current(page)).toBe("slide-3");
    await page.keyboard.press("End");
    await page.keyboard.press("ArrowRight"); // already at the end
    expect(await current(page)).toBe("slide-5");
    await page.keyboard.press("Home");
    expect(await current(page)).toBe("slide-1");
    await page.mouse.click(600, 400);
    expect(await current(page)).toBe("slide-2");
    await expect(page).toHaveURL(/#slide-2$/);
  });

  test("fills the screen at the deck's aspect ratio", async ({ page }) => {
    await openDeck(page, DECK);
    await page.keyboard.press("f");
    const box = await page.locator(".slide-wrapper.current .slide-frame").boundingBox();
    expect([box!.width, box!.height]).toEqual([1280, 720]);
  });

  test("other shortcuts do nothing while presenting", async ({ page }) => {
    await openDeck(page, DECK);
    await page.keyboard.press("f");
    await page.keyboard.press("s");
    await page.keyboard.press("r");
    expect(await page.evaluate(() => document.body.className)).toMatch(/^(?=.*slides-mode)(?=.*presenting)(?!.*show-raw)/);
    await expect(page.locator("#mdd-rendered .slide-wrapper")).toHaveCount(5);
  });

  test("f toggles presenting off again, leaving the page on that slide", async ({ page }) => {
    await openDeck(page, DECK);
    await page.keyboard.press("f");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("f");
    expect(await presenting(page)).toBe(false);
    await expect(page).toHaveURL(/#slide-2$/);
    await expect(page.locator('#mdd-nav-links a[data-id="slide-2"]')).toHaveClass(/active/);
  });

  test("an edit while presenting updates in place, on the same slide", async ({ page }) => {
    await openDeck(page, DECK);
    await page.keyboard.press("f");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await writeFiles(page, { "deck.md": DECK.replace("# Two", "# Two edited") });
    await expect(page.locator("#mdd-rendered")).toContainText("Two edited", { timeout: 5000 });
    expect(await presenting(page)).toBe(true);
    expect(await current(page)).toBe("slide-3");
    await page.keyboard.press("Escape");
    expect(await presenting(page)).toBe(false);
    await expect(page.locator('#mdd-nav-links a[data-id="slide-2"]')).toHaveText("2. Two edited");
    await expect
      .poll(() => page.locator("#user-content-slide-3").evaluate((el) => Math.abs(el.getBoundingClientRect().top)))
      .toBeLessThan(40);
  });

  test("keeps a split background beside the contents column", async ({ page }) => {
    await openDeck(page, "---\nmarp: true\n---\n![bg left:40%](x.png)\n\n# Split\n\nText\n");
    await page.keyboard.press("f");
    await page.keyboard.press("i");
    const [tocRight, bgLeft, bgWidth, bgRight, headingLeft, slideRight] = await page.evaluate(() => {
      const sec = document.querySelector(".slide-wrapper.current section.slide")!;
      const r = (s: string) => sec.querySelector(s)!.getBoundingClientRect();
      return [r(".slide-toc").right, r(".slide-bg").left, r(".slide-bg").width, r(".slide-bg").right, r("h1").left, sec.getBoundingClientRect().right];
    });
    expect(Math.abs(bgLeft - tocRight)).toBeLessThanOrEqual(1);
    expect(Math.abs(bgWidth - 0.4 * (slideRight - tocRight))).toBeLessThanOrEqual(1);
    expect(headingLeft).toBeGreaterThan(bgRight);
  });
});

test.describe("thumbnails", () => {
  const thumbs = (page: Page) =>
    page.evaluate(() => {
      const t = [...document.querySelectorAll("#mdd-thumb-strip .thumb")];
      return [t.map((b) => b.querySelector(".thumb-num")!.textContent), t.findIndex((b) => b.classList.contains("current"))];
    });
  const strip = (page: Page) => page.locator("#mdd-thumb-strip");

  test("follow and jump to slides", async ({ page }) => {
    await openDeck(page, DECK);
    await page.keyboard.press("f");
    await expect(strip(page)).toBeHidden(); // off by default
    await page.keyboard.press("t");
    await expect(strip(page)).toBeVisible();
    expect(await thumbs(page)).toEqual([["1", "2", "3", "4", "5"], 0]);
    await page.keyboard.press("ArrowRight");
    expect((await thumbs(page))[1]).toBe(1);
    await page.locator("#mdd-thumb-strip .thumb").nth(3).click();
    expect(await current(page)).toBe("slide-4");
    expect((await thumbs(page))[1]).toBe(3);
    await page.keyboard.press("t");
    await expect(strip(page)).toBeHidden();
  });

  test("are copies without the slides' ids", async ({ page }) => {
    await openDeck(page, DECK);
    await page.keyboard.press("f");
    await page.keyboard.press("t");
    await expect(page.locator("#mdd-thumb-strip [id]")).toHaveCount(0);
    await expect(page.locator("#user-content-slide-1")).toHaveCount(1);
    await expect(page.locator("#mdd-thumb-strip .thumb").nth(1)).toHaveAttribute("aria-label", "Slide 2: Two");
  });

  test("leave the slide its aspect ratio beside the strip", async ({ page }) => {
    await openDeck(page, DECK);
    await page.keyboard.press("f");
    await page.keyboard.press("t");
    const box = await page.locator(".slide-wrapper.current .slide-frame").boundingBox();
    expect([box!.x, box!.width, box!.height]).toEqual([200, 1080, 607.5]); // 1280 wide less the 200px strip, at 16:9
  });

  test("show only while presenting, and are remembered", async ({ page }) => {
    await openDeck(page, DECK);
    await page.keyboard.press("t"); // not presenting: does nothing
    expect(await page.evaluate(() => localStorage.getItem("mddisplay-show-thumbs"))).toBeNull();
    await page.keyboard.press("f");
    await page.keyboard.press("t");
    await page.reload();
    await expect(page.locator(".slide-wrapper").first()).toBeVisible();
    await page.keyboard.press("f");
    await expect(strip(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(strip(page)).toBeHidden();
  });

  test("are rebuilt after an edit", async ({ page }) => {
    await openDeck(page, DECK);
    await page.keyboard.press("f");
    await page.keyboard.press("t");
    await writeFiles(page, { "deck.md": DECK.replace("# Two", "# Two edited") });
    await expect(page.locator("#mdd-thumb-strip .thumb").nth(1)).toHaveAttribute("aria-label", "Slide 2: Two edited", {
      timeout: 5000,
    });
    await expect(strip(page)).toBeVisible();
  });
});

const OVERFULL =
  "---\nmarp: true\n---\n# Fits\n\n---\n\n# Too tall\n\n" +
  Array.from({ length: 30 }, (_, i) => `- Bullet ${i + 1}`).join("\n") +
  "\n\n---\n\n# Too wide\n\n| " +
  Array.from({ length: 8 }, (_, i) => `a-long-unbreakable-cell-value-${i}`).join(" | ") +
  " |\n|" +
  "---|".repeat(8) +
  "\n";

test.describe("overflow", () => {
  test("an overfull slide keeps its title visible", async ({ page }) => {
    await openDeck(page, OVERFULL);
    const gap = await page.evaluate(() => {
      const s = document.querySelector("#user-content-slide-2 section.slide")!;
      return s.querySelector("h1")!.getBoundingClientRect().top - s.getBoundingClientRect().top;
    });
    expect(gap).toBeGreaterThanOrEqual(0);
  });

  test("is flagged on the slide and in the nav", async ({ page }) => {
    await openDeck(page, OVERFULL);
    await expect.poll(() => flagged(page, "#mdd-rendered .slide-wrapper")).toEqual([false, true, true]);
    expect(await flagged(page, "#mdd-nav-links a")).toEqual([false, true, true]);
    const badge = await page
      .locator("#user-content-slide-2")
      .evaluate((el) => getComputedStyle(el, "::before").content);
    expect(badge).toContain("cut off");
  });

  test("is flagged in thumbnails but not on the presented slide", async ({ page }) => {
    await openDeck(page, OVERFULL);
    await page.keyboard.press("f");
    await page.keyboard.press("t");
    await page.keyboard.press("ArrowRight");
    expect(await flagged(page, "#mdd-thumb-strip .thumb")).toEqual([false, true, true]);
    const badge = await page
      .locator("#user-content-slide-2")
      .evaluate((el) => getComputedStyle(el, "::before").display);
    expect(badge).toBe("none"); // the audience never sees the warning
  });

  test("a code block too tall for its slide is flagged, not shrunk", async ({ page }) => {
    const lines = Array.from({ length: 30 }, (_, i) => `line ${i}`).join("\n");
    await openDeck(
      page,
      `---\nmarp: true\n---\n# Fits\n\n\`\`\`text\none\ntwo\n\`\`\`\n\n---\n\n# Too long\n\nSome text above the code.\n\n\`\`\`text\n${lines}\n\`\`\`\n\nSome text below.\n`,
    );
    await expect.poll(() => flagged(page, "#mdd-rendered .slide-wrapper")).toEqual([false, true]);
    const clipped = await page
      .locator("section.slide pre")
      .evaluateAll((pres) => pres.map((p) => p.scrollHeight > p.clientHeight + 1));
    expect(clipped).toEqual([false, false]);
  });
});

const MIXED = `---
marp: true
---
# Mixed

Some \`inline code\` here.

| Option | Value |
|---|---|
| Pages | 16 |

\`\`\`
code block
\`\`\`

> A quote
`;

/** Each element's height as a share of its slide frame's height. */
const proportions = (page: Page, frame: string) =>
  page.locator(frame).first().evaluate((f) => {
    const h = f.getBoundingClientRect().height;
    return ["h1", "p", "table", "pre", "blockquote"].map((s) => f.querySelector(s)!.getBoundingClientRect().height / h);
  });

test.describe("slides are one picture at every size", () => {
  test("in the page, full screen and as a thumbnail", async ({ page }) => {
    await openDeck(page, MIXED);
    const normal = await proportions(page, "#user-content-slide-1 .slide-frame");
    await page.keyboard.press("f");
    const full = await proportions(page, "#user-content-slide-1 .slide-frame");
    await page.keyboard.press("t");
    const thumb = await proportions(page, "#mdd-thumb-strip .thumb .slide-frame");
    for (const other of [full, thumb]) {
      other.forEach((value, i) => expect(Math.abs(value - normal[i]) / normal[i]).toBeLessThan(0.03));
    }
  });

  test("a thumbnail's text is a scaled copy, not laid out again", async ({ page }) => {
    await openDeck(page, MIXED);
    await page.keyboard.press("f");
    await page.keyboard.press("t");
    const [real, thumb] = await page.evaluate(() => {
      const w = (frame: Element) => {
        const range = document.createRange();
        range.selectNodeContents(frame.querySelector("h1")!);
        return range.getBoundingClientRect().width / frame.getBoundingClientRect().width;
      };
      return [
        w(document.querySelector("#user-content-slide-1 .slide-frame")!),
        w(document.querySelector("#mdd-thumb-strip .thumb .slide-frame")!),
      ];
    });
    expect(Math.abs(thumb - real) / real).toBeLessThan(0.01);
  });

  test("a thumbnail matches the slide's text styling", async ({ page }) => {
    await openDeck(page, OVERFULL);
    await page.keyboard.press("f");
    await page.keyboard.press("t");
    const style = (el: Element) => {
      const c = getComputedStyle(el);
      return [c.textAlign, c.fontFamily, c.lineHeight.endsWith("px")];
    };
    const real = await page.locator("#user-content-slide-2 li").first().evaluate(style);
    const thumb = await page.locator("#mdd-thumb-strip .thumb").nth(1).locator("li").first().evaluate(style);
    expect(thumb).toEqual(real);
  });
});

const notesDeck = (extra = "") => `---
marp: true
${extra}---
# One

<!-- First slide's note. -->

---

# Two

<!-- Second slide's note. -->

---

# Three
`;

/** Whether the overlay shows, its text, and its distance from each edge of the window. */
const overlay = (page: Page, which: "notes" | "timer") =>
  page.evaluate((id) => {
    const el = document.getElementById(id);
    if (!el || getComputedStyle(el).display === "none") return { shown: false, text: null, edges: null };
    const r = el.getBoundingClientRect();
    return {
      shown: true,
      text: el.textContent!.trim(),
      edges: { left: r.left, top: r.top, right: innerWidth - r.right, bottom: innerHeight - r.bottom },
    };
  }, `mdd-present-${which}`);

test.describe("overlays", () => {
  test("n toggles the current slide's notes while presenting", async ({ page }) => {
    await openDeck(page, notesDeck());
    await page.keyboard.press("f");
    expect((await overlay(page, "notes")).shown).toBe(false); // off by default
    await page.keyboard.press("n");
    expect(await overlay(page, "notes")).toMatchObject({ shown: true, text: "First slide's note." });
    await page.keyboard.press("ArrowRight");
    expect((await overlay(page, "notes")).text).toBe("Second slide's note.");
    await page.keyboard.press("ArrowRight");
    expect((await overlay(page, "notes")).text).toBe("No speaker notes.");
    await page.keyboard.press("n");
    expect((await overlay(page, "notes")).shown).toBe(false);
    // The notes under the slides stay as they were.
    expect(await page.evaluate(() => document.body.classList.contains("show-notes"))).toBe(false);
  });

  test("c toggles a running timer while presenting", async ({ page }) => {
    await openDeck(page, notesDeck());
    await page.keyboard.press("f");
    expect((await overlay(page, "timer")).shown).toBe(false); // off by default
    await page.keyboard.press("c");
    expect((await overlay(page, "timer")).text).toMatch(/^0:0\d$/);
    await expect(page.locator("#mdd-present-timer")).toHaveText(/^0:0[2-9]$/, { timeout: 4000 });
    await page.keyboard.press("c");
    expect((await overlay(page, "timer")).shown).toBe(false);
  });

  test("the timer restarts each time presenting starts", async ({ page }) => {
    await openDeck(page, notesDeck());
    await page.keyboard.press("f");
    await page.keyboard.press("c");
    await expect(page.locator("#mdd-present-timer")).toHaveText(/^0:0[2-9]$/, { timeout: 4000 });
    await page.keyboard.press("f");
    await page.keyboard.press("f");
    expect((await overlay(page, "timer")).text).toMatch(/^0:0[01]$/);
  });

  test("default to notes lower right and timer upper right", async ({ page }) => {
    await openDeck(page, notesDeck());
    await page.keyboard.press("f");
    await page.keyboard.press("n");
    await page.keyboard.press("c");
    const notes = (await overlay(page, "notes")).edges!;
    expect(notes.right < 40 && notes.bottom < 40 && notes.left > 400).toBe(true);
    const timer = (await overlay(page, "timer")).edges!;
    expect(timer.right < 40 && timer.top < 40 && timer.left > 400).toBe(true);
  });

  test("go in the corners the front matter names", async ({ page }) => {
    await openDeck(page, notesDeck("notesPosition: top-left\ntimerPosition: lower left\n"));
    await page.keyboard.press("f");
    await page.keyboard.press("n");
    await page.keyboard.press("c");
    const notes = (await overlay(page, "notes")).edges!;
    expect(notes.left < 40 && notes.top < 40).toBe(true);
    const timer = (await overlay(page, "timer")).edges!;
    expect(timer.left < 40 && timer.bottom < 40).toBe(true);
  });

  test("on the left, clear the thumbnail strip", async ({ page }) => {
    await openDeck(page, notesDeck("notesPosition: bottom-left\n"));
    await page.keyboard.press("f");
    await page.keyboard.press("t");
    await page.keyboard.press("n");
    expect((await overlay(page, "notes")).edges!.left).toBeGreaterThanOrEqual(200);
  });

  test("show only while presenting, and are remembered for the tab", async ({ page, context }) => {
    await openDeck(page, notesDeck());
    await page.keyboard.press("c"); // not presenting: does nothing
    await page.keyboard.press("f");
    expect((await overlay(page, "timer")).shown).toBe(false);
    await page.keyboard.press("n");
    await page.keyboard.press("c");
    await page.keyboard.press("f"); // leave
    expect((await overlay(page, "notes")).shown).toBe(false);
    expect((await overlay(page, "timer")).shown).toBe(false);
    await page.reload();
    await expect(page.locator(".slide-wrapper").first()).toBeVisible();
    await page.keyboard.press("f");
    expect((await overlay(page, "notes")).shown).toBe(true);
    expect((await overlay(page, "timer")).shown).toBe(true);
    // A new tab (a new talk) starts with both off again.
    const other = await context.newPage();
    await other.goto("/");
    await expect(other.locator(".slide-wrapper").first()).toBeVisible();
    await other.keyboard.press("f");
    expect((await overlay(other, "notes")).shown).toBe(false);
  });

  test("clicking the notes doesn't advance", async ({ page }) => {
    await openDeck(page, notesDeck());
    await page.keyboard.press("f");
    await page.keyboard.press("n");
    await page.locator("#mdd-present-notes").click();
    expect(await current(page)).toBe("slide-1");
  });
});

/** A title slide, then topic slides with a section slide every fifth. */
const tocDeck = (n: number) => {
  const parts = ["---\nmarp: true\nfooter: Foot\n---\n# Title"];
  for (let k = 2; k <= n; k++) parts.push(k % 5 === 0 ? `# Section ${k}` : `## Topic ${k}`);
  return parts.join("\n\n---\n\n") + "\n";
};

const tocState = (page: Page) =>
  page.evaluate(() => {
    const sec = document.querySelector<HTMLElement>("#mdd-rendered .slide-wrapper.current section.slide");
    const toc = sec?.querySelector<HTMLElement>(".slide-toc");
    if (!sec || !toc || getComputedStyle(toc).display === "none") return null;
    const list = toc.querySelector<HTMLElement>(".slide-toc-list")!;
    const rows = [...list.children];
    const cur = rows.findIndex((r) => r.classList.contains("active"));
    const lb = list.getBoundingClientRect();
    return {
      inside: toc.closest("section.slide") === sec,
      tocLeft: toc.getBoundingClientRect().left,
      tocRight: toc.getBoundingClientRect().right,
      secLeft: sec.getBoundingClientRect().left,
      headingLeft: sec.querySelector("h1, h2")!.getBoundingClientRect().left,
      footerLeft: sec.querySelector("footer")?.getBoundingClientRect().left ?? 0,
      rows: rows.map((r) => [r.textContent, r.className.replace("active", "").trim()]),
      current: cur,
      firstVisible: rows.findIndex((r) => r.getBoundingClientRect().bottom > lb.top + 1),
      curBottom: rows[cur].getBoundingClientRect().bottom - lb.top,
      height: lb.height,
      scrollTop: list.scrollTop,
      maxScroll: list.scrollHeight - list.clientHeight,
    };
  });

const headingLeft = (page: Page) =>
  page.locator(".slide-wrapper.current h1").evaluate((el) => el.getBoundingClientRect().left);

test.describe("contents column", () => {
  test("i toggles it inside the slide, moving the content right", async ({ page }) => {
    await openDeck(page, tocDeck(6));
    await page.keyboard.press("f");
    expect(await tocState(page)).toBeNull(); // off by default
    const before = await headingLeft(page);
    await page.keyboard.press("i");
    const state = (await tocState(page))!;
    expect(state.inside).toBe(true);
    expect(Math.abs(state.tocLeft - state.secLeft)).toBeLessThan(1);
    expect(state.headingLeft).toBeGreaterThan(state.tocRight);
    expect(state.tocRight).toBeGreaterThan(before);
    expect(state.footerLeft).toBeGreaterThan(state.tocRight);
    const navRows = await page
      .locator("#mdd-nav-links a")
      .evaluateAll((links) => links.map((a) => [a.textContent, a.className.replace("active", "").trim()]));
    expect(state.rows).toEqual(navRows); // mirrors the nav, indents included
    await page.keyboard.press("i");
    expect(await tocState(page)).toBeNull();
    expect(Math.abs((await headingLeft(page)) - before)).toBeLessThan(1);
  });

  test("highlights the live slide", async ({ page }) => {
    await openDeck(page, tocDeck(6));
    await page.keyboard.press("f");
    await page.keyboard.press("i");
    expect((await tocState(page))!.current).toBe(0);
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    const state = (await tocState(page))!;
    expect(state.current).toBe(2);
    expect(state.inside).toBe(true); // moved onto the new slide
    expect(state.scrollTop).toBe(0); // a short list is never cropped
  });

  test("too tall, keeps the live row third", async ({ page }) => {
    await openDeck(page, tocDeck(60));
    await page.keyboard.press("f");
    await page.keyboard.press("i");
    const start = (await tocState(page))!;
    expect(start.maxScroll).toBeGreaterThan(0);
    expect([start.scrollTop, start.current]).toEqual([0, 0]);
    for (let i = 0; i < 29; i++) await page.keyboard.press("ArrowRight");
    const mid = (await tocState(page))!;
    expect([mid.current, mid.firstVisible]).toEqual([29, 27]);
    expect(mid.scrollTop).toBeGreaterThan(0);
    expect(mid.scrollTop).toBeLessThan(mid.maxScroll);
    await page.keyboard.press("End");
    const end = (await tocState(page))!;
    expect(end.current).toBe(59);
    expect(end.scrollTop).toBe(end.maxScroll);
    expect(end.curBottom).toBeLessThanOrEqual(end.height + 1);
  });

  test("clicking a row jumps to its slide", async ({ page }) => {
    await openDeck(page, tocDeck(6));
    await page.keyboard.press("f");
    await page.keyboard.press("i");
    await page.locator(".slide-wrapper.current .slide-toc-list > :nth-child(4)").click();
    expect(await current(page)).toBe("slide-4");
    expect((await tocState(page))!.current).toBe(3);
  });

  test("shows only while presenting, is remembered, and isn't copied into thumbnails", async ({ page }) => {
    await openDeck(page, tocDeck(6));
    await page.keyboard.press("i"); // not presenting: does nothing
    await page.keyboard.press("f");
    expect(await tocState(page)).toBeNull();
    await page.keyboard.press("i");
    await page.keyboard.press("t");
    await expect(page.locator("#mdd-thumb-strip .slide-toc")).toHaveCount(0);
    await page.keyboard.press("f"); // leave
    await expect(page.locator(".slide-toc")).toBeHidden();
    await page.reload();
    await expect(page.locator(".slide-wrapper").first()).toBeVisible();
    await page.keyboard.press("f");
    expect(await tocState(page)).not.toBeNull();
  });
});
