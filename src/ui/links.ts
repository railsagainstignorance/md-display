import { extension, IMAGE_EXTENSIONS, resolveRelative } from "../render/links";

export interface LinkTargets {
  /** Path of the doc being shown, which relative links are resolved from. */
  docPath: string;
  /** The id of the doc at `path` in the same source, if it's one that's open. */
  docIdFor(path: string): string | null;
  /** A URL the page can show the image at `path` from; null if it can't be reached. */
  imageUrl(path: string): Promise<string | null>;
}

/**
 * Before the rendered doc is shown: relative links to other open docs switch
 * to them inside md-display; other relative links (files that aren't open)
 * become inert, since they'd lead nowhere on this site, as do links into
 * md-display's own address (its local server's files, say: a doc can't send
 * the reader to a file of its choosing on this site); relative image paths
 * are parked in `data-mdd-src` until loadImages() fills them in. Slide
 * backgrounds (`data-mdd-bg`, and the `backgroundImage` directive in
 * `data-mdd-bg-image`) are shown straight away when external, else loaded too.
 */
export function rewriteLinks(root: ParentNode, targets: LinkTargets): void {
  for (const img of root.querySelectorAll<HTMLImageElement>("img[src]")) {
    const target = resolveRelative(targets.docPath, img.getAttribute("src")!);
    if (!target) continue;
    img.removeAttribute("src");
    img.dataset.mddSrc = target.path;
  }
  for (const el of root.querySelectorAll<HTMLElement>("[data-mdd-bg]")) {
    const url = el.dataset.mddBg!;
    if (!resolveRelative(targets.docPath, url)) el.style.backgroundImage = cssUrl(url);
  }
  for (const el of root.querySelectorAll<HTMLElement>("[data-mdd-bg-image]")) {
    const value = el.dataset.mddBgImage!;
    if (![...value.matchAll(CSS_URL_RE)].some((m) => resolveRelative(targets.docPath, m[2]))) {
      el.style.backgroundImage = value;
    }
  }
  for (const a of root.querySelectorAll<HTMLAnchorElement>("a[href]")) {
    const href = a.getAttribute("href")!;
    const target = resolveRelative(targets.docPath, href);
    if (!target) {
      if (intoThisSite(href)) {
        a.removeAttribute("href");
        a.classList.add("mdd-unavailable");
        a.title = "Links into md-display's own address are turned off";
      }
      continue;
    }
    const id = targets.docIdFor(target.path);
    if (id) {
      a.href = `?${new URLSearchParams({ doc: id })}${target.fragment ? `#${target.fragment}` : ""}`;
      a.dataset.mddDoc = id;
      a.dataset.mddFragment = target.fragment;
    } else {
      a.removeAttribute("href");
      a.classList.add("mdd-unavailable");
      a.title = `${target.path} isn't open in md-display`;
    }
  }
}

/** Whether `href` (not an in-page anchor) leads somewhere under the page's own address. */
function intoThisSite(href: string): boolean {
  if (href.startsWith("#")) return false;
  try {
    return new URL(href, location.href).href.startsWith(new URL("./", location.href).href);
  } catch {
    return false;
  }
}

const CSS_URL_RE = /url\((['"]?)([^'")]+)\1\)/g;

function cssUrl(url: string): string {
  return `url("${url.replace(/["\\\n]/g, encodeURIComponent)}")`;
}

/** A URL the page can show the image at `src` (relative to the doc) from; null if it can't be reached. */
async function imageUrl(src: string, targets: LinkTargets): Promise<string | null> {
  const target = resolveRelative(targets.docPath, src);
  if (!target) return src;
  return IMAGE_EXTENSIONS.has(extension(target.path)) ? targets.imageUrl(target.path) : null;
}

export async function loadImages(root: ParentNode, targets: LinkTargets): Promise<void> {
  const images = [...root.querySelectorAll<HTMLImageElement>("img[data-mdd-src]")];
  const backgrounds = [...root.querySelectorAll<HTMLElement>("[data-mdd-bg]")].filter((el) => !el.style.backgroundImage);
  const directives = [...root.querySelectorAll<HTMLElement>("[data-mdd-bg-image]")].filter(
    (el) => !el.style.backgroundImage,
  );
  await Promise.all([
    ...backgrounds.map(async (el) => {
      const url = await imageUrl(el.dataset.mddBg!, targets);
      el.style.backgroundImage = url ? cssUrl(url) : "none";
    }),
    // Each url() in the directive's value is loaded; if any can't be, there's no background.
    ...directives.map(async (el) => {
      const value = el.dataset.mddBgImage!;
      const urls = await Promise.all([...value.matchAll(CSS_URL_RE)].map((m) => imageUrl(m[2], targets)));
      if (urls.some((url) => !url)) {
        el.style.backgroundImage = "none";
        return;
      }
      let i = 0;
      el.style.backgroundImage = value.replace(CSS_URL_RE, () => cssUrl(urls[i++]!));
    }),
    ...images.map(async (img) => {
      const path = img.dataset.mddSrc!;
      const url = IMAGE_EXTENSIONS.has(extension(path)) ? await targets.imageUrl(path) : null;
      if (url) {
        img.src = url;
      } else {
        img.classList.add("mdd-missing");
        img.title = `${path} can't be shown. Open the folder that contains it to see its images.`;
      }
    }),
  ]);
}
