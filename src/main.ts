import DOMPurify from "dompurify";
import "./styles/app.css";
import "./styles/slides.css";
import { listDocRefs, type DocRef } from "./docs";
import { renderDocument } from "./render/document";
import { parseFrontMatter } from "./render/frontmatter";
import { renderMarp } from "./render/marp/render";
import { isMarp } from "./render/marp/slides";
import { demoSource } from "./source/demo";
import type { DocSource } from "./source/types";
import { fillDocSelect } from "./ui/docSelect";
import { copyForSlack, downloadText } from "./ui/exports";
import { loadImages, rewriteLinks, type LinkTargets } from "./ui/links";
import { elementForFragment } from "./ui/fragments";
import { drawDiagrams } from "./ui/mermaid";
import { Nav } from "./ui/nav";
import { onLaunchFiles, pick, remembered, sourceFromDrop, type PickKind } from "./ui/opener";
import { SlidesController } from "./ui/slides/controller";
import { storedFlag, storeFlag, storedValue, storeValue } from "./ui/storage";
import { Toolbar } from "./ui/toolbar";

const RAW_STORAGE_KEY = "mddisplay-show-raw";
/** A Marp doc shows as slides unless switched to the document view, remembered per doc for the tab. */
const viewKey = (doc: DocRef) => `mddisplay-view:${doc.id}`;

const content = document.getElementById("mdd-content")!;
const rendered = document.getElementById("mdd-rendered")!;
const rawSource = document.getElementById("mdd-raw-source")!;
const docSelect = document.getElementById("mdd-doc-select") as HTMLSelectElement;
const status = document.getElementById("mdd-status")!;
/** A deck's sizing and its front matter's `style:`. */
const deckStyle = document.head.appendChild(document.createElement("style"));
/** Print page size: a deck's slide size, or A4 with its notes. */
const pageStyle = document.head.appendChild(document.createElement("style"));

/** The user's files or folder, listed above the demo docs. */
let localSource: DocSource | null = null;
let reopenLocal: (() => Promise<DocSource | null>) | null = null;
/** The doc the page was loaded with (`?doc=`), reopened once a remembered folder is allowed again. */
const requestedAtStart = new URLSearchParams(location.search).get("doc");
let lastPick: PickKind = "files";
/** Files the installed app was opened with take the place of whatever was open last time. */
let launched = false;
let docs: DocRef[] = [];
let active: DocRef | null = null;
let text = "";
/** The active doc is a Marp deck, and whether it's showing as slides. */
let isDeck = false;
let asSlides = false;
let stopWatching: (() => void) | null = null;
/** Object URLs for images, by `<source key>/<path>`. */
const imageUrls = new Map<string, Promise<string | null>>();

const nav = new Nav(document.getElementById("mdd-nav-links")!, rendered);
const toolbar = new Toolbar(document.getElementById("mdd-toolbar")!, {
  openFiles: () => openPicked("files"),
  openFolder: () => openPicked("folder"),
  reopen: async () => {
    const source = await reopenLocal?.();
    if (source) await useLocalSource(source, requestedAtStart);
  },
  reload: () => openPicked(lastPick, active?.id),
  toggleRaw: () => setRawShown(!document.body.classList.contains("show-raw")),
  toggleView: () => {
    if (!active || !isDeck) return;
    storeValue("session", viewKey(active), asSlides ? "document" : "slides");
    show(active, false);
  },
  toggleNotes: () => slides.toggleNotes(),
  present: () => slides.startPresenting(),
  copyForSlack: () => copyForSlack(text),
  print: () => window.print(),
  download: () => active && downloadText(text, active.fileName),
});

const slides = new SlidesController({
  rendered,
  nav,
  pageStyle,
  hideRaw: () => setRawShown(false),
  onNotesShown: (shown) => toolbar.setNotesShown(shown),
});

function setStatus(message: string): void {
  status.textContent = message;
  status.hidden = !message;
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function setRawShown(shown: boolean): void {
  const wasShown = document.body.classList.contains("show-raw");
  document.body.classList.toggle("show-raw", shown);
  toolbar.setRawShown(shown);
  storeFlag("local", RAW_STORAGE_KEY, shown);
  if (shown || !wasShown) return;
  slides.contentChanged();
  draw();
}

/** Draws the doc's Mermaid diagrams; on slides, then re-checks what fits. */
function draw(): void {
  const onSlides = asSlides;
  drawDiagrams(rendered, { slides: onSlides }).then(() => onSlides && slides.contentChanged());
}

async function openPicked(kind: PickKind, preferredId?: string): Promise<void> {
  lastPick = kind;
  try {
    const source = await pick(kind);
    if (source) await useLocalSource(source, preferredId);
  } catch (e) {
    setStatus(`⚠️ Couldn't open that: ${errorMessage(e)}`);
  }
}

/** Shows `source`'s docs above the demo's and opens one: `preferredId` if it's there, else the first. */
async function useLocalSource(source: DocSource, preferredId?: string | null): Promise<void> {
  for (const url of imageUrls.values()) url.then((u) => u && URL.revokeObjectURL(u));
  imageUrls.clear();
  localSource = source;
  reopenLocal = null;
  toolbar.setOpenState({ canReload: !source.watch });
  await refreshDocs();
  const own = docs.filter((d) => d.source === source);
  if (!own.length) {
    setStatus(`⚠️ There are no Markdown files in ${source.label}.`);
    return;
  }
  setStatus("");
  await openDoc(own.find((d) => d.id === preferredId) ?? own[0]);
}

async function refreshDocs(): Promise<void> {
  docs = [...(localSource ? await listDocRefs(localSource) : []), ...(await listDocRefs(demoSource))];
  fillDocSelect(docSelect, docs, active?.id ?? "");
}

function linkTargets(doc: DocRef): LinkTargets {
  return {
    docPath: doc.path,
    docIdFor: (path) => docs.find((d) => d.source === doc.source && d.path === path)?.id ?? null,
    imageUrl: (path) => {
      const key = `${doc.source.key}/${path}`;
      let url = imageUrls.get(key);
      if (!url) {
        url = doc.source.readAsset(path).then((blob) => (blob ? URL.createObjectURL(blob) : null));
        imageUrls.set(key, url);
      }
      return url;
    },
  };
}

/** Renders the current text. `keepScroll` holds the reading position, for re-renders of the same doc. */
function show(doc: DocRef, keepScroll: boolean): void {
  const scroll = { content: content.scrollTop, window: window.scrollY };
  const restoreScroll = () => {
    content.scrollTop = keepScroll ? scroll.content : 0;
    window.scrollTo(0, keepScroll ? scroll.window : 0);
  };
  const { meta, body } = parseFrontMatter(text);
  isDeck = isMarp(meta);
  asSlides = isDeck && storedValue("session", viewKey(doc)) !== "document";
  const deck = asSlides ? renderMarp(meta, body) : null;
  const plain = deck ? null : renderDocument(text);
  const { html, hasMermaid } = deck ?? plain!;
  if (!deck) slides.detach();
  deckStyle.textContent = deck ? `${deck.deckCss}\n${deck.userCss}` : "";
  document.body.classList.toggle("slides-mode", asSlides);
  toolbar.setMode(asSlides ? "slides" : isDeck ? "deck-document" : "document");

  // SANITIZE_NAMED_PROPS prefixes the doc's ids (see ui/fragments.ts).
  const fragment = DOMPurify.sanitize(html, { RETURN_DOM_FRAGMENT: true, SANITIZE_NAMED_PROPS: true });
  const targets = linkTargets(doc);
  rewriteLinks(fragment, targets);
  rendered.replaceChildren(fragment);
  rawSource.textContent = text;
  document.title = `${(isDeck && meta.title) || doc.name} · md-display`;
  restoreScroll();
  if (deck) {
    nav.show(deck.nav, ".slide-wrapper[id]");
    slides.attach(deck.nav, deck.pageCss);
  } else {
    nav.show(plain!.headings);
  }
  if (hasMermaid) draw();
  // Images arriving can push the text down; put the reader back where they were.
  loadImages(rendered, targets).then(() => {
    if (active !== doc) return;
    if (keepScroll) restoreScroll();
    slides.contentChanged();
  });
}

/** Scrolls to the fragment's element; for one on a slide, the whole slide. */
function scrollToFragment(fragment: string): void {
  const target = fragment ? elementForFragment(fragment) : null;
  (target?.closest<HTMLElement>(".slide-wrapper") ?? target)?.scrollIntoView();
}

async function openDoc(doc: DocRef, fragment = ""): Promise<void> {
  stopWatching?.();
  stopWatching = null;
  active = doc;
  let newText: string;
  try {
    newText = await doc.source.read(doc.path);
  } catch (e) {
    setStatus(`⚠️ Couldn't read ${doc.name}: ${errorMessage(e)}`);
    return;
  }
  if (active !== doc) return; // another doc was chosen while this one was loading
  text = newText;
  docSelect.value = doc.id;
  const url = new URL(location.href);
  url.searchParams.set("doc", doc.id);
  url.hash = fragment;
  history.replaceState(null, "", url);
  show(doc, false);
  scrollToFragment(fragment);
  stopWatching = doc.source.watch?.(doc.path, () => reread(doc)) ?? null;
}

/** Live update: re-renders `doc` in place if its text changed. */
async function reread(doc: DocRef): Promise<void> {
  try {
    const newText = await doc.source.read(doc.path);
    if (active !== doc || newText === text) return;
    text = newText;
    setStatus("");
    show(doc, true);
  } catch (e) {
    if (active === doc) setStatus(`⚠️ Couldn't read ${doc.name}: ${errorMessage(e)}`);
  }
}

docSelect.addEventListener("change", () => {
  const doc = docs.find((d) => d.id === docSelect.value);
  if (doc) openDoc(doc);
});

// Links within the doc scroll to their (prefixed) target; a link to another
// open doc switches to it here. A modified click still opens a new tab.
rendered.addEventListener("click", (e) => {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const link = (e.target as Element).closest<HTMLAnchorElement>("a[href]");
  const href = link?.getAttribute("href") ?? "";
  if (href.startsWith("#")) {
    e.preventDefault();
    history.replaceState(null, "", href);
    scrollToFragment(href.slice(1));
    return;
  }
  const doc = docs.find((d) => d.id === link?.dataset.mddDoc);
  if (!doc) return;
  e.preventDefault();
  openDoc(doc, link!.dataset.mddFragment);
});

document.addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName ?? "")) return;
  if (slides.handleKey(e)) return;
  if (e.key === "r") toolbar.rawButton.click();
  if (e.key === "s" && isDeck) toolbar.viewButton.click();
  if (e.key === "l" && !toolbar.reloadButton.hidden) toolbar.reloadButton.click();
});

// Drag and drop files or a folder anywhere on the page.
const carriesFiles = (e: DragEvent) => !!e.dataTransfer?.types.includes("Files");
let dragDepth = 0;
document.addEventListener("dragenter", (e) => {
  if (!carriesFiles(e)) return;
  dragDepth++;
  document.body.classList.add("mdd-dragging");
});
document.addEventListener("dragleave", (e) => {
  if (carriesFiles(e) && --dragDepth <= 0) document.body.classList.remove("mdd-dragging");
});
document.addEventListener("dragover", (e) => {
  if (!carriesFiles(e)) return;
  e.preventDefault();
  e.dataTransfer!.dropEffect = "copy";
});
document.addEventListener("drop", (e) => {
  if (!carriesFiles(e)) return;
  e.preventDefault();
  dragDepth = 0;
  document.body.classList.remove("mdd-dragging");
  lastPick = "files";
  sourceFromDrop(e.dataTransfer!)
    .then((source) => (source ? useLocalSource(source) : setStatus("⚠️ Drop Markdown files or a folder.")))
    .catch((err) => setStatus(`⚠️ Couldn't open that: ${errorMessage(err)}`));
});

async function start(): Promise<void> {
  setRawShown(storedFlag("local", RAW_STORAGE_KEY));
  onLaunchFiles((source) => {
    launched = true;
    lastPick = "files";
    useLocalSource(source).catch((e) => setStatus(`⚠️ Couldn't open that: ${errorMessage(e)}`));
  });
  const fragment = location.hash.slice(1);
  const last = await remembered();
  if (launched) return;
  if (last.state === "ready") {
    localSource = last.source;
  } else if (last.state === "needs-permission") {
    reopenLocal = last.reopen;
    toolbar.setOpenState({ reopenName: last.name, canReload: false });
  }
  await refreshDocs();
  if (launched) return;
  const first = docs.find((d) => d.id === requestedAtStart) ?? docs[0];
  await openDoc(first, first.id === requestedAtStart ? fragment : "");
}

start();

// Works offline: the service worker caches the whole app (see build/sw.js).
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(() => {
    // Not served over https or localhost, or blocked: it just won't work offline.
  });
}
