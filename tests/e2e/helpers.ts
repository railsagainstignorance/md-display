import type { Page } from "@playwright/test";

// The pickers are stood in for by Chromium's origin private file system,
// whose handles are real FileSystemHandles: reading, watching and
// remembering go through the same code as a user's own files.

/** The folder picker gives the "notes" folder; the file picker gives its a.md. */
export async function stubPickers(page: Page) {
  await page.addInitScript(() => {
    const folder = async () => (await navigator.storage.getDirectory()).getDirectoryHandle("notes", { create: true });
    window.showDirectoryPicker = folder;
    window.showOpenFilePicker = async () => [await (await folder()).getFileHandle("a.md")];
  });
}

export async function clearFiles(page: Page) {
  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    await root.removeEntry("notes", { recursive: true }).catch(() => {});
  });
}

/** Writes files (by path) into the "notes" folder. */
export async function writeFiles(page: Page, files: Record<string, string>) {
  await page.evaluate(async (files) => {
    const root = await (await navigator.storage.getDirectory()).getDirectoryHandle("notes", { create: true });
    for (const [path, text] of Object.entries(files)) {
      const parts = path.split("/");
      const name = parts.pop()!;
      let dir = root;
      for (const part of parts) dir = await dir.getDirectoryHandle(part, { create: true });
      const writable = await (await dir.getFileHandle(name, { create: true })).createWritable();
      await writable.write(text);
      await writable.close();
    }
  }, files);
}
