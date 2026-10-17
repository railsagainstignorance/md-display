import type { DocSource } from "./types";

// The demo folder, bundled: Markdown as text, everything else as asset URLs.
const texts = import.meta.glob<string>("../../demo/**/*.md", { query: "?raw", import: "default", eager: true });
const assets = import.meta.glob<string>(["../../demo/**/*", "!../../demo/**/*.md"], {
  query: "?url",
  import: "default",
  eager: true,
});

const ROOT = "../../demo/";
const byPath = <T>(files: Record<string, T>) =>
  new Map(Object.entries(files).map(([file, value]) => [file.slice(ROOT.length), value]));

const TEXTS = byPath(texts);
const ASSETS = byPath(assets);
const NAMES: Record<string, string> = {
  "md-display-demo.md": "Feature demo",
  "md-display-demo-slides.md": "Slide demo",
};

export const demoSource: DocSource = {
  key: "demo",
  label: "Demo",
  async listDocs() {
    return Object.entries(NAMES).map(([path, name]) => ({ path, name }));
  },
  async read(path) {
    const text = TEXTS.get(path);
    if (text === undefined) throw new Error(`Unknown demo doc: ${path}`);
    return text;
  },
  async readAsset(path) {
    const url = ASSETS.get(path);
    if (!url) return null;
    const response = await fetch(url);
    return response.ok ? response.blob() : null;
  },
};
