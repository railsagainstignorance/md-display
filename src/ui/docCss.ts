// A doc's own CSS (a Marp deck's `style:`, or a <style> in the Markdown) can
// come from anyone, so it only styles the doc: it's read with the browser's
// own parser and rebuilt inside an @scope, which no `}` in it can close, and
// keeps nothing that loads from a URL. Otherwise a doc could restyle
// md-display's controls, or tell a server elsewhere which docs are in the
// folder (with `:has()` selectors on the doc list and a background-image URL).

const SCOPE = "#mdd-rendered";
/** Anything that fetches, and escapes, which could spell `url(` unseen. */
const LOADS_RE = /url\(|image-set\(|image\(|src\(|\\/i;

/** `css` confined to the rendered doc; rules that can't be are dropped. */
export function scopedDocCss(css: string): string {
  if (!css.trim()) return "";
  const sheet = new CSSStyleSheet();
  try {
    sheet.replaceSync(css); // Leaves out any @import.
  } catch {
    return "";
  }
  const rules = [...sheet.cssRules].map(keep).filter(Boolean);
  // Doubled id: the doc's CSS outranks the page's own doc and slide styles,
  // as a Marp `style:` overrides its theme.
  return rules.length ? `@scope (${SCOPE}) {\n:scope${SCOPE}${SCOPE} {\n${rules.join("\n")}\n}\n}` : "";
}

/** A rule's CSS with its loading declarations removed; "" if it can't be nested. */
function keep(rule: CSSRule): string {
  if (rule instanceof CSSStyleRule) {
    for (const name of [...rule.style]) {
      if (LOADS_RE.test(rule.style.getPropertyValue(name))) rule.style.removeProperty(name);
    }
  } else if (!(rule instanceof CSSMediaRule || rule instanceof CSSSupportsRule || rule instanceof CSSContainerRule)) {
    return ""; // @font-face, @keyframes, @page and the like: global, or nothing to scope.
  }
  // Nested rules, last first so deleting one leaves the rest's indexes alone.
  for (let i = rule.cssRules.length - 1; i >= 0; i--) if (!keep(rule.cssRules[i])) rule.deleteRule(i);
  return rule.cssText;
}
