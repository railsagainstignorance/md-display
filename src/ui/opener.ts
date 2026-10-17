import { HandleSource, readPermission, rootName, type HandleRoot } from "../source/fsAccess";
import { rememberedRoot, rememberRoot } from "../source/remembered";
import { snapshotFromEntries, snapshotFromFiles } from "../source/snapshot";
import type { DocSource } from "../source/types";

// Opening local files: Chromium's pickers and drag-drop give handles the page
// can keep reading (live updates, remembered across reloads); elsewhere a
// file input or drag-drop gives a one-off copy.

export const canWatchFiles =
  typeof window.showOpenFilePicker === "function" && typeof window.showDirectoryPicker === "function";

const MARKDOWN_TYPES: FilePickerAcceptType[] = [
  { description: "Markdown", accept: { "text/markdown": [".md", ".markdown"] } },
];

export type PickKind = "files" | "folder";

export async function pick(kind: PickKind): Promise<DocSource | null> {
  if (!canWatchFiles) return pickWithInput(kind);
  try {
    const root: HandleRoot =
      kind === "folder"
        ? { kind, handle: await window.showDirectoryPicker!({ id: "mddisplay" }) }
        : { kind, handles: await window.showOpenFilePicker!({ id: "mddisplay", multiple: true, types: MARKDOWN_TYPES }) };
    return handleSource(root);
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return null; // picker cancelled
    throw e;
  }
}

function handleSource(root: HandleRoot): DocSource {
  rememberRoot(root);
  return new HandleSource(root);
}

function pickWithInput(kind: PickKind): Promise<DocSource | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    if (kind === "folder") input.webkitdirectory = true;
    else {
      input.multiple = true;
      input.accept = ".md,.markdown,text/markdown";
    }
    input.addEventListener("change", () => resolve(snapshotFromFiles(input.files ?? [])));
    input.addEventListener("cancel", () => resolve(null));
    input.click();
  });
}

/**
 * The files or folder dropped on the page. Must be called during the drop
 * event itself: the browser empties the dropped items once it returns. Takes
 * the best the browser offers: handles (Chromium, live updates), then
 * entries (folders elsewhere), then plain files.
 */
export function sourceFromDrop(transfer: DataTransfer): Promise<DocSource | null> {
  const items = [...transfer.items].filter((item) => item.kind === "file");
  const files = [...transfer.files];
  const handles = canWatchFiles ? items.map((item) => item.getAsFileSystemHandle?.() ?? Promise.resolve(null)) : [];
  const entries = items.map((item) => item.webkitGetAsEntry()).filter((e): e is FileSystemEntry => !!e);
  return (async () => {
    const all = await Promise.all(handles);
    const folder = all.find((h): h is FileSystemDirectoryHandle => h?.kind === "directory");
    if (folder) return handleSource({ kind: "folder", handle: folder });
    const fileHandles = all.filter((h): h is FileSystemFileHandle => h?.kind === "file");
    if (fileHandles.length) return handleSource({ kind: "files", handles: fileHandles });
    return (entries.length && (await snapshotFromEntries(entries))) || snapshotFromFiles(files);
  })();
}

/** Calls `open` with the Markdown files the installed app is launched with (opening a `.md` file with it). */
export function onLaunchFiles(open: (source: DocSource) => void): void {
  window.launchQueue?.setConsumer(({ files }) => {
    const handles = files.filter((h): h is FileSystemFileHandle => h.kind === "file");
    if (handles.length) open(handleSource({ kind: "files", handles }));
  });
}

export type Remembered =
  | { state: "ready"; source: DocSource }
  | { state: "needs-permission"; name: string; reopen(): Promise<DocSource | null> }
  | { state: "none" };

/** Whatever was open last time, if the browser still has it. */
export async function remembered(): Promise<Remembered> {
  if (!canWatchFiles) return { state: "none" };
  const root = await rememberedRoot();
  if (!root) return { state: "none" };
  const permission = await readPermission(root).catch(() => "denied" as const);
  if (permission === "granted") return { state: "ready", source: new HandleSource(root) };
  if (permission === "denied") return { state: "none" };
  return {
    state: "needs-permission",
    name: rootName(root),
    async reopen() {
      return (await readPermission(root, { ask: true })) === "granted" ? new HandleSource(root) : null;
    },
  };
}
