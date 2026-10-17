// Where documents come from: the bundled demo, files or a folder opened
// through the File System Access API, or a one-off file input / drag-drop.
// The renderer never reads files itself; it works from text a DocSource
// supplies. Paths are '/'-separated and relative to the source's root.

export interface DocEntry {
  path: string;
  /** Shown in the dropdown; defaults to the path. */
  name?: string;
}

export interface DocSource {
  /** Prefix for this source's doc ids in the URL, e.g. "demo". */
  readonly key: string;
  /** Heading for this source's docs in the dropdown. */
  readonly label: string;
  listDocs(): Promise<DocEntry[]>;
  read(path: string): Promise<string>;
  /** A file beside the docs (an image, say); null if it isn't there or can't be reached. */
  readAsset(path: string): Promise<Blob | null>;
  /**
   * Calls onChange when the file at `path` changes; returns a function that
   * stops watching. Absent when the source can't see changes (then the page
   * offers a Reload button instead).
   */
  watch?(path: string, onChange: () => void): () => void;
}
