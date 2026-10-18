import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname, resolve, sep } from "node:path";
import type { Library } from "./library.ts";

// The local server's requests: the built page (dist/), and under /api/ the
// library's docs, their files and a stream of changes. Requests must name
// this machine as the host (unless serving to the network), so a web page
// can't reach the API by pointing its own domain at 127.0.0.1. And the API
// only answers the page itself: another site can't load a doc's files into
// its own page with an <img> or <script>, even just to see if they exist.

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".md": "text/markdown; charset=utf-8",
  ".markdown": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".pdf": "application/pdf",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".woff2": "font/woff2",
};
/**
 * Types a browser shows without running anything in them. A doc's files can
 * come from anyone (a cloned repo, say), so anything else (HTML, SVG, scripts)
 * is only ever a download if opened directly: md-display reads SVGs through
 * fetch and shows them in an <img>, where their scripts don't run.
 */
const PASSIVE_TYPES = new Set([".md", ".markdown", ".txt", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".ico", ".mp4", ".webm"]);
/**
 * And whatever is opened gets no powers: a sandboxed page has no origin of its
 * own, so it can't read the API or the service worker's cache as md-display.
 */
const FILE_CSP = "sandbox; default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'";
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const KEEPALIVE_MS = 25_000;

export interface AppOptions {
  library: Library;
  /** The built page. */
  pageDir: string;
  /** List the bundled demo docs after the library's. */
  demo: boolean;
  /** Accept any Host header: serving to the network (`--host`). */
  anyHost: boolean;
}

export type Handler = ((req: IncomingMessage, res: ServerResponse) => void) & { close(): void };

export function createApp({ library, pageDir, demo, anyHost }: AppOptions): Handler {
  const streams = new Set<ServerResponse>();
  const stopWatching = library.watch((path) => {
    for (const res of streams) res.write(`data: ${JSON.stringify({ path })}\n\n`);
  });
  const keepalive = setInterval(() => {
    for (const res of streams) res.write(": keepalive\n\n");
  }, KEEPALIVE_MS);

  const handler = (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const hostname = (req.headers.host ?? "").replace(/:\d+$/, "");
    if (!anyHost && !LOOPBACK_HOSTS.has(hostname)) return send(res, 403, "This server only answers to localhost.");
    if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, "Method not allowed");
    if (url.pathname.startsWith("/api/")) {
      // Browsers say where a request came from: "none" is the address typed in.
      const site = req.headers["sec-fetch-site"];
      if (site && site !== "same-origin" && site !== "none") return send(res, 403, "Only md-display's own page can ask for this.");
      res.setHeader("cross-origin-resource-policy", "same-origin");
    }

    switch (url.pathname) {
      case "/api/server":
        return json(res, { app: "md-display", pid: process.pid, label: library.label, startDoc: library.startDoc, demo });
      case "/api/docs":
        return library.listDocs().then(
          (paths) => json(res, paths.map((path) => ({ path }))),
          () => send(res, 500, "Couldn't list the docs."),
        );
      case "/api/file":
        return library.resolve(url.searchParams.get("path") ?? "").then((file) =>
          file ? sendDocFile(req, res, file) : send(res, 404, "Not found"),
        );
      case "/api/events":
        res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store" });
        res.write(": connected\n\n");
        streams.add(res);
        req.on("close", () => streams.delete(res));
        return;
    }
    if (url.pathname.startsWith("/api/")) return send(res, 404, "Not found");
    return servePage(req, res, pageDir, url.pathname);
  };
  return Object.assign(handler, {
    close() {
      stopWatching();
      clearInterval(keepalive);
      for (const res of streams) res.end();
    },
  });
}

async function servePage(req: IncomingMessage, res: ServerResponse, pageDir: string, pathname: string) {
  let path: string;
  try {
    path = decodeURIComponent(pathname);
  } catch {
    return send(res, 400, "Bad path");
  }
  const file = resolve(pageDir, `.${path.endsWith("/") ? `${path}index.html` : path}`);
  if (!file.startsWith(pageDir + sep)) return send(res, 404, "Not found");
  try {
    if (!(await stat(file)).isFile()) return send(res, 404, "Not found");
  } catch {
    return send(res, 404, "Not found");
  }
  // The service worker checks for a new version of itself; the rest is cached by it.
  sendFile(req, res, file, file.endsWith(`${sep}sw.js`) || file.endsWith(".html") ? "no-cache" : undefined);
}

/** A file from the library: sandboxed, and a download unless it's a passive type. */
function sendDocFile(req: IncomingMessage, res: ServerResponse, file: string) {
  res.setHeader("content-security-policy", FILE_CSP);
  if (!PASSIVE_TYPES.has(extname(file).toLowerCase())) res.setHeader("content-disposition", "attachment");
  sendFile(req, res, file);
}

function sendFile(req: IncomingMessage, res: ServerResponse, file: string, cacheControl = "no-store") {
  res.writeHead(200, {
    "content-type": TYPES[extname(file).toLowerCase()] ?? "application/octet-stream",
    "cache-control": cacheControl,
    "x-content-type-options": "nosniff",
  });
  if (req.method === "HEAD") return res.end();
  createReadStream(file)
    .on("error", () => res.destroy())
    .pipe(res);
}

function json(res: ServerResponse, value: unknown) {
  res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(value));
}

function send(res: ServerResponse, status: number, message: string) {
  res.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
  res.end(message);
}
