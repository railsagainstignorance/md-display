#!/usr/bin/env -S node --disable-warning=ExperimentalWarning
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { createApp } from "./app.ts";
import { LibraryError, openLibrary } from "./library.ts";
import { DEFAULT_PORT, isPortFree, PortError, resolvePort, type PortMode } from "./ports.ts";
import { removeNote, runningServers, serverOn, stop, writeNote } from "./registry.ts";

// `md-display [files or folders…]`: serves the page and the given Markdown
// from this machine, and opens it in the browser.

const USAGE = `Usage: md-display [options] [file or folder …]

Serves Markdown files and Marp decks to your browser, updating as you edit.
With no files or folders, serves the current folder.

Options:
  --port <n>      Port to serve on (default ${DEFAULT_PORT})
  --next          If the port is taken, use the next free one nearby (the default)
  --replace       If another md-display has the port, stop it and take over
  --wipe          Stop every running md-display, then start
  --host <addr>   Address to listen on (default 127.0.0.1). 0.0.0.0 lets other
                  machines connect; there's no login, so anyone who can reach
                  this machine can read the files served
  --no-demo       Leave the demo docs out of the doc list
  --no-browser    Don't open a browser tab on start
  -h, --help      Show this help
`;

const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1"]);
const pageDir = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");

function fail(message: string): never {
  process.stderr.write(`md-display: ${message}\n`);
  process.exit(1);
}

function options() {
  try {
    return parseArgs({
      allowPositionals: true,
      options: {
        port: { type: "string" },
        next: { type: "boolean" },
        replace: { type: "boolean" },
        wipe: { type: "boolean" },
        host: { type: "string", default: "127.0.0.1" },
        "no-demo": { type: "boolean" },
        "no-browser": { type: "boolean" },
        help: { type: "boolean", short: "h" },
      },
    });
  } catch (e) {
    fail(`${(e as Error).message}\n\n${USAGE}`);
  }
}

function openBrowser(url: string): void {
  const [command, args] =
    process.platform === "darwin"
      ? ["open", [url]]
      : process.platform === "win32"
        ? ["cmd", ["/c", "start", "", url]]
        : ["xdg-open", [url]];
  spawn(command, args, { stdio: "ignore", detached: true })
    .on("error", () => {}) // No browser to open: the address is printed anyway.
    .unref();
}

async function main(): Promise<void> {
  const { values, positionals } = options();
  if (values.help) {
    process.stdout.write(USAGE);
    return;
  }
  const modes = (["next", "replace", "wipe"] as const).filter((mode) => values[mode]);
  if (modes.length > 1) fail("use only one of --next, --replace and --wipe.");
  const mode: PortMode = modes[0] ?? "next";
  const requested = values.port === undefined ? DEFAULT_PORT : Number(values.port);
  if (!Number.isInteger(requested) || requested < 1 || requested > 65535) fail(`--port must be 1–65535, not ${values.port}.`);
  const host = values.host;
  if (!existsSync(join(pageDir, "index.html"))) fail("the page hasn't been built yet: run `npm run build` first.");

  let library;
  try {
    library = await openLibrary(positionals);
  } catch (e) {
    if (e instanceof LibraryError) fail(e.message);
    throw e;
  }

  let port: number;
  try {
    port = await resolvePort(requested, mode, {
      isPortFree: (p) => isPortFree(p, host),
      serverOn,
      runningServers,
      stop,
      step: () => 1 + Math.floor(Math.random() * 3),
    });
  } catch (e) {
    if (e instanceof PortError) fail(e.message);
    throw e;
  }

  const app = createApp({ library, pageDir, demo: !values["no-demo"], anyHost: !LOOPBACK.has(host) });
  const server = createServer(app);
  server.on("error", (e: NodeJS.ErrnoException) =>
    fail(e.code === "EADDRINUSE" ? `port ${port} is in use. Try --next or another --port.` : e.message),
  );
  server.listen(port, host, () => {
    writeNote({ pid: process.pid, port, root: library.root });
    const query = library.startDoc ? `?doc=${encodeURIComponent(`local/${library.startDoc}`)}` : "";
    const url = `http://127.0.0.1:${port}/${query}`;
    process.stdout.write(`md-display is serving ${library.label} at ${url}\nPress Ctrl+C to stop.\n`);
    if (!LOOPBACK.has(host)) {
      process.stdout.write(`⚠️ Listening on ${host}: anyone who can reach this machine can read these files.\n`);
    }
    if (!values["no-browser"]) openBrowser(url);
  });

  let stopping = false;
  const shutdown = () => {
    if (stopping) return;
    stopping = true;
    removeNote(process.pid);
    app.close();
    server.close(() => process.exit(0));
    server.closeAllConnections();
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  process.on("exit", () => removeNote(process.pid));
}

main().catch((e) => fail((e as Error).stack ?? String(e)));
