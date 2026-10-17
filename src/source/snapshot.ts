import { extension, IMAGE_EXTENSIONS, MARKDOWN_EXTENSIONS } from "../render/links";
import { byFolderThenName } from "./fsAccess";
import type { DocEntry, DocSource } from "./types";

// Firefox and Safari: a file input or drag-drop gives a one-off copy of the
// files, with no way to see later changes, so there's no watch(); the page
// offers Reload instead.

const SKIP_DIRS = new Set(["node_modules", ".git"]);

export class SnapshotSource implements DocSource {
  readonly key = "local";

  constructor(
    readonly label: string,
    private readonly files: Map<string, File>,
  ) {}

  async listDocs(): Promise<DocEntry[]> {
    return [...this.files.keys()]
      .filter((path) => MARKDOWN_EXTENSIONS.has(extension(path)))
      .sort(byFolderThenName)
      .map((path) => ({ path }));
  }

  async read(path: string): Promise<string> {
    const file = this.files.get(path);
    if (!file) throw new Error(`${path} can't be found`);
    return file.text();
  }

  async readAsset(path: string): Promise<Blob | null> {
    return this.files.get(path) ?? null;
  }
}

function keep(path: string): boolean {
  const ext = extension(path);
  if (!MARKDOWN_EXTENSIONS.has(ext) && !IMAGE_EXTENSIONS.has(ext)) return false;
  return !path.split("/").some((part) => part.startsWith(".") || SKIP_DIRS.has(part));
}

/**
 * From a file input or dropped files. A folder pick (`webkitdirectory`) gives
 * paths like "folder/sub/a.md"; the folder's own name is dropped so paths
 * start inside it.
 */
export function snapshotFromFiles(list: ArrayLike<File>): SnapshotSource | null {
  const files = Array.from(list);
  if (!files.length) return null;
  const folder = files[0].webkitRelativePath.split("/")[0];
  const map = new Map<string, File>();
  for (const file of files) {
    const path = folder ? file.webkitRelativePath.slice(folder.length + 1) : file.name;
    if (keep(path)) map.set(path, file);
  }
  return map.size ? new SnapshotSource(folder ? `📁 ${folder}` : "Opened files", map) : null;
}

/** From drag-drop entries: one folder, or loose files. */
export async function snapshotFromEntries(entries: FileSystemEntry[]): Promise<SnapshotSource | null> {
  const folder = entries.find((e): e is FileSystemDirectoryEntry => e.isDirectory);
  const map = new Map<string, File>();
  if (folder) {
    await collectEntries(folder, "", map);
    return new SnapshotSource(`📁 ${folder.name}`, map);
  }
  for (const entry of entries) {
    if (entry.isFile && keep(entry.name)) map.set(entry.name, await entryFile(entry as FileSystemFileEntry));
  }
  return map.size ? new SnapshotSource("Opened files", map) : null;
}

async function collectEntries(dir: FileSystemDirectoryEntry, prefix: string, out: Map<string, File>) {
  for (const entry of await readAllEntries(dir)) {
    const path = prefix + entry.name;
    if (entry.isDirectory) {
      if (!entry.name.startsWith(".") && !SKIP_DIRS.has(entry.name)) {
        await collectEntries(entry as FileSystemDirectoryEntry, `${path}/`, out);
      }
    } else if (keep(path)) {
      out.set(path, await entryFile(entry as FileSystemFileEntry));
    }
  }
}

/** readEntries returns entries in batches; keep asking until it returns none. */
async function readAllEntries(dir: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> {
  const reader = dir.createReader();
  const all: FileSystemEntry[] = [];
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
    if (!batch.length) return all;
    all.push(...batch);
  }
}

function entryFile(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}
