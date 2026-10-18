import { watch as watchFs, type FSWatcher } from "node:fs";
import { readdir, realpath, stat } from "node:fs/promises";
import { basename, dirname, relative, resolve, sep } from "node:path";

// The files the server was started on: folders (searched for Markdown, as the
// page searches an opened folder) and single files. Paths the page asks for
// are '/'-separated and relative to the library's root, the folder holding
// them all, and can't reach outside it.

const MARKDOWN_RE = /\.(md|markdown)$/i;
const SKIP_DIRS = new Set(["node_modules", ".git"]);
const MAX_DEPTH = 8;
const MAX_DOCS = 1000;
/** Editors often write a file in several steps; one change event per save. */
const SETTLE_MS = 50;

export class LibraryError extends Error {}

export interface Library {
  /** The folder holding everything served, as a real path. */
  root: string;
  /** Shown in the page's doc list, and in the terminal. */
  label: string;
  /** The doc to open first: the file given, when started on one file. */
  startDoc: string | null;
  listDocs(): Promise<string[]>;
  /** The file at `path` under the root, as a real path; null if it's outside the root, hidden or missing. */
  resolve(path: string): Promise<string | null>;
  /** Calls `onChange` with each changed file's path; returns a function that stops watching. */
  watch(onChange: (path: string) => void): () => void;
}

export function isMarkdown(path: string): boolean {
  return MARKDOWN_RE.test(path);
}

/** A library of the given files and folders (the current folder when none are given). */
export async function openLibrary(args: string[]): Promise<Library> {
  const entries: { path: string; isDir: boolean }[] = [];
  for (const arg of args.length ? args : ["."]) {
    let path: string;
    try {
      path = await realpath(resolve(arg));
    } catch {
      throw new LibraryError(`${arg} doesn't exist.`);
    }
    const isDir = (await stat(path)).isDirectory();
    if (!isDir && !isMarkdown(path)) throw new LibraryError(`${arg} isn't a Markdown file (.md or .markdown).`);
    entries.push({ path, isDir });
  }
  const root = commonFolder(entries.map((e) => (e.isDir ? e.path : dirname(e.path))));
  const toDocPath = (path: string) => relative(root, path).split(sep).join("/");
  const only = entries.length === 1 ? entries[0] : null;

  return {
    root,
    label: only && !only.isDir ? basename(only.path) : basename(root) || root,
    startDoc: only && !only.isDir ? toDocPath(only.path) : null,

    async listDocs() {
      const found = new Set<string>();
      for (const entry of entries) {
        if (entry.isDir) await collectDocs(entry.path, 0, found);
        else found.add(entry.path);
      }
      return [...found].map(toDocPath).sort(byFolderThenName);
    },

    async resolve(path) {
      const parts = path.split("/");
      if (parts.some((part) => !part || part === "." || part === ".." || part.startsWith("."))) return null;
      try {
        // The real path, so a link inside the folder can't lead out of it.
        const real = await realpath(resolve(root, ...parts));
        if (!real.startsWith(root.endsWith(sep) ? root : root + sep) || !(await stat(real)).isFile()) return null;
        return real;
      } catch {
        return null;
      }
    },

    watch(onChange) {
      const timers = new Map<string, NodeJS.Timeout>();
      const changed = (path: string) => {
        clearTimeout(timers.get(path));
        timers.set(
          path,
          setTimeout(() => {
            timers.delete(path);
            onChange(toDocPath(path));
          }, SETTLE_MS),
        );
      };
      const watchers: FSWatcher[] = entries.map((entry) => {
        // A single file is watched through its folder: editors that save by
        // replacing the file would otherwise leave the watcher on the old one.
        const folder = entry.isDir ? entry.path : dirname(entry.path);
        const watcher = watchFs(folder, { recursive: entry.isDir }, (_, name) => {
          if (!name) return;
          const path = resolve(folder, name.toString());
          if (entry.isDir || path === entry.path) changed(path);
        });
        watcher.on("error", () => {}); // A watched folder removed: nothing more to report.
        return watcher;
      });
      return () => {
        for (const watcher of watchers) watcher.close();
        for (const timer of timers.values()) clearTimeout(timer);
      };
    },
  };
}

function commonFolder(folders: string[]): string {
  let common = folders[0];
  for (const folder of folders.slice(1)) {
    while (folder !== common && !folder.startsWith(common.endsWith(sep) ? common : common + sep)) {
      common = dirname(common);
    }
  }
  return common;
}

async function collectDocs(dir: string, depth: number, out: Set<string>): Promise<void> {
  let names;
  try {
    names = await readdir(dir, { withFileTypes: true });
  } catch {
    return; // Unreadable: skipped, as the page skips what it can't open.
  }
  for (const entry of names) {
    if (out.size >= MAX_DOCS) return;
    if (entry.name.startsWith(".")) continue;
    const path = resolve(dir, entry.name);
    if (entry.isFile() && isMarkdown(entry.name)) out.add(path);
    else if (entry.isDirectory() && depth < MAX_DEPTH && !SKIP_DIRS.has(entry.name)) await collectDocs(path, depth + 1, out);
  }
}

/** Top-level docs first, then each folder's, alphabetically (as the page lists an opened folder). */
function byFolderThenName(a: string, b: string): number {
  const depth = (p: string) => p.split("/").length;
  return depth(a) - depth(b) || a.localeCompare(b);
}
