import { extension, MARKDOWN_EXTENSIONS } from "../render/links";
import type { DocEntry, DocSource } from "./types";

// Chromium's File System Access API: handles stay pointed at the picked file
// or folder, so the page can re-read a doc whenever it changes on disk.

const POLL_MS = 1000;
const SKIP_DIRS = new Set(["node_modules", ".git"]);
const MAX_DEPTH = 8;
const MAX_DOCS = 1000;

export type HandleRoot =
  | { kind: "folder"; handle: FileSystemDirectoryHandle }
  | { kind: "files"; handles: FileSystemFileHandle[] };

export function rootName(root: HandleRoot): string {
  if (root.kind === "folder") return root.handle.name;
  return root.handles.length === 1 ? root.handles[0].name : `${root.handles.length} files`;
}

function rootHandles(root: HandleRoot): FileSystemHandle[] {
  return root.kind === "folder" ? [root.handle] : root.handles;
}

/** "granted" only when every handle can be read without asking. */
export async function readPermission(root: HandleRoot, { ask = false } = {}): Promise<PermissionState> {
  for (const handle of rootHandles(root)) {
    const check = ask ? handle.requestPermission : handle.queryPermission;
    const state = check ? await check.call(handle, { mode: "read" }) : "granted";
    if (state !== "granted") return state;
  }
  return "granted";
}

export class HandleSource implements DocSource {
  readonly key = "local";
  readonly label: string;

  constructor(readonly root: HandleRoot) {
    this.label = root.kind === "folder" ? `📁 ${root.handle.name}` : "Opened files";
  }

  async listDocs(): Promise<DocEntry[]> {
    if (this.root.kind === "files") {
      return this.root.handles.filter((h) => MARKDOWN_EXTENSIONS.has(extension(h.name))).map((h) => ({ path: h.name }));
    }
    const paths: string[] = [];
    await collectDocs(this.root.handle, "", 0, paths);
    return paths.sort(byFolderThenName).map((path) => ({ path }));
  }

  async read(path: string): Promise<string> {
    const handle = await this.fileHandle(path);
    if (!handle) throw new Error(`${path} can't be found`);
    return (await handle.getFile()).text();
  }

  async readAsset(path: string): Promise<Blob | null> {
    try {
      return (await (await this.fileHandle(path))?.getFile()) ?? null;
    } catch {
      return null;
    }
  }

  // Polls rather than using FileSystemObserver: looking the file up afresh
  // each time also follows editors that save by replacing the file.
  watch(path: string, onChange: () => void): () => void {
    let last: string | undefined;
    const check = async () => {
      try {
        const file = await (await this.fileHandle(path))?.getFile();
        if (!file) return;
        const stamp = `${file.lastModified}:${file.size}`;
        if (last !== undefined && stamp !== last) onChange();
        last = stamp;
      } catch {
        // Mid-save, or gone: check again next time.
      }
    };
    check();
    const timer = setInterval(check, POLL_MS);
    return () => clearInterval(timer);
  }

  private async fileHandle(path: string): Promise<FileSystemFileHandle | null> {
    if (this.root.kind === "files") return this.root.handles.find((h) => h.name === path) ?? null;
    const parts = path.split("/");
    const name = parts.pop()!;
    try {
      let dir = this.root.handle;
      for (const part of parts) dir = await dir.getDirectoryHandle(part);
      return await dir.getFileHandle(name);
    } catch {
      return null;
    }
  }
}

async function collectDocs(dir: FileSystemDirectoryHandle, prefix: string, depth: number, out: string[]) {
  for await (const entry of dir.values()) {
    if (out.length >= MAX_DOCS) return;
    const path = prefix + entry.name;
    if (entry.kind === "file") {
      if (MARKDOWN_EXTENSIONS.has(extension(entry.name))) out.push(path);
    } else if (depth < MAX_DEPTH && !entry.name.startsWith(".") && !SKIP_DIRS.has(entry.name)) {
      await collectDocs(entry, `${path}/`, depth + 1, out);
    }
  }
}

/** Top-level docs first, then each folder's, alphabetically. */
export function byFolderThenName(a: string, b: string): number {
  const depth = (p: string) => p.split("/").length;
  return depth(a) - depth(b) || a.localeCompare(b);
}
