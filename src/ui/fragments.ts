// Ids in a rendered doc are prefixed, as on GitHub, so a doc's own ids (a
// heading called "Title", say) can't clash with the page's elements or
// shadow built-in browser properties. Links keep the plain id: #title finds
// user-content-title.

export const USER_ID_PREFIX = "user-content-";

/** The element a `#fragment` (without the `#`, possibly URL-encoded) points to in the rendered doc. */
export function elementForFragment(fragment: string): HTMLElement | null {
  let id = fragment;
  try {
    id = decodeURIComponent(fragment);
  } catch {
    // Not encoded after all.
  }
  return document.getElementById(USER_ID_PREFIX + id);
}
