/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import { offline } from "./build/offline";

export default defineConfig({
  // Relative asset paths, so the build works from any URL prefix (GitHub Pages
  // project sites, a subfolder, or a saved copy).
  base: "./",
  plugins: [offline()],
  build: {
    // Mermaid's diagram renderers are large lazy chunks, loaded only for a doc with a diagram.
    chunkSizeWarningLimit: 1600,
  },
  test: {
    include: ["tests/unit/**/*.test.ts"],
  },
});
