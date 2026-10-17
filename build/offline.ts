import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import type { Plugin, ResolvedConfig } from "vite";

/** Every file under `dir`, as '/'-separated paths relative to it. */
function filesIn(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)).split(sep).join("/"));
}

/**
 * Writes `sw.js` into the build: the service worker from build/sw.js, given
 * the build's own file list, and a version that changes whenever any file does.
 */
export function offline(): Plugin {
  let config: ResolvedConfig;
  return {
    name: "md-display-offline",
    apply: "build",
    configResolved(resolved) {
      config = resolved;
    },
    closeBundle() {
      const outDir = config.build.outDir;
      const files = filesIn(outDir)
        .filter((file) => file !== "sw.js")
        .sort();
      const hash = createHash("sha256");
      for (const file of files) hash.update(file).update(readFileSync(join(outDir, file)));
      const template = readFileSync(new URL("./sw.js", import.meta.url), "utf8");
      const sw = template
        .replace("__VERSION__", hash.digest("hex").slice(0, 12))
        .replace("__FILES__", JSON.stringify(files.filter((file) => file !== "index.html")));
      writeFileSync(join(outDir, "sw.js"), sw);
    },
  };
}
