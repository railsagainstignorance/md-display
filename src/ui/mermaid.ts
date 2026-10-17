type Mermaid = typeof import("mermaid").default;

let loading: Promise<Mermaid> | null = null;
let theme: string | null = null;

function loadMermaid(): Promise<Mermaid> {
  loading ??= import("mermaid").then(({ default: mermaid }) => mermaid);
  return loading;
}

/**
 * Draws the diagrams under `root` that aren't drawn yet. Mermaid is only
 * loaded once a doc has a diagram. Diagrams drawn while hidden come out
 * mis-sized, so this does nothing while the raw view is showing; showing
 * the rendered view again calls it. Slides stay light in dark mode, so their
 * diagrams do too.
 */
export async function drawDiagrams(root: HTMLElement, { slides = false } = {}): Promise<void> {
  if (document.body.classList.contains("show-raw")) return;
  // Thumbnails are copies of the slides; they're copied again once these are drawn.
  const pending = [...root.querySelectorAll<HTMLElement>("pre.mermaid:not([data-processed])")].filter(
    (pre) => !pre.closest("#mdd-thumb-strip"),
  );
  if (!pending.length) return;
  let mermaid: Mermaid;
  try {
    mermaid = await loadMermaid();
  } catch {
    loading = null;
    for (const pre of pending) {
      if (pre.nextElementSibling?.classList.contains("mermaid-load-error")) continue;
      const note = document.createElement("p");
      note.className = "mermaid-load-error";
      note.textContent = "⚠️ Mermaid couldn't be loaded, so this diagram is shown as source.";
      pre.after(note);
    }
    return;
  }
  const wanted = !slides && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "default";
  if (theme !== wanted) {
    // startOnLoad off, or Mermaid draws diagrams itself, including hidden ones.
    mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: wanted });
    theme = wanted;
  }
  const nodes = pending.filter((pre) => pre.isConnected);
  // A diagram with a syntax error shows Mermaid's own error graphic in its place.
  await mermaid.run({ nodes, suppressErrors: true });
  if (slides) scaleSlideDiagrams(nodes);
}

/**
 * Mermaid caps each diagram at its drawn size in px, so on a slide it would
 * stay that size while the slide grows (full screen, a wider window).
 * Re-express the cap as a share of the slide's width, as slide text is.
 */
function scaleSlideDiagrams(pres: HTMLElement[]): void {
  for (const pre of pres) {
    const svg = pre.querySelector("svg");
    const frame = pre.closest(".slide-frame")?.getBoundingClientRect().width;
    const drawn = Number.parseFloat(svg?.style.maxWidth ?? "");
    if (svg && drawn && frame) svg.style.maxWidth = `calc(${drawn} / ${frame} * 100cqw)`;
  }
}
