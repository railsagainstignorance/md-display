// Resolving a doc's relative links and image paths against the doc's own
// location. Paths are '/'-separated and relative to the root of whatever was
// opened (a folder, or a set of files); nothing can resolve outside it.

/** A scheme (https:, data:, mailto:…), a site-absolute path, or an in-page anchor. */
const EXTERNAL_RE = /^(?:[a-zA-Z][a-zA-Z0-9+.-]*:|\/|#)/;

export const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".avif", ".bmp", ".ico"]);
export const MARKDOWN_EXTENSIONS = new Set([".md", ".markdown"]);

export interface ResolvedLink {
  path: string;
  /** The part after `#`, still URL-encoded; empty when there is none. */
  fragment: string;
}

/**
 * Where a relative `href`/`src` in the doc at `fromPath` points, or null for
 * an external URL, an anchor, or a path that climbs out of the root.
 */
export function resolveRelative(fromPath: string, href: string): ResolvedLink | null {
  if (!href || EXTERNAL_RE.test(href)) return null;
  const hashAt = href.indexOf("#");
  const fragment = hashAt === -1 ? "" : href.slice(hashAt + 1);
  const withoutHash = hashAt === -1 ? href : href.slice(0, hashAt);
  const rawPath = withoutHash.split("?")[0];
  let decoded: string;
  try {
    decoded = decodeURIComponent(rawPath);
  } catch {
    return null;
  }
  const parts = fromPath.split("/").slice(0, -1);
  for (const segment of decoded.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      if (!parts.length) return null;
      parts.pop();
    } else {
      parts.push(segment);
    }
  }
  if (!parts.length || decoded.endsWith("/")) return null;
  return { path: parts.join("/"), fragment };
}

export function extension(path: string): string {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot).toLowerCase() : "";
}

export function baseName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}
