import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import { homedir } from "node:os";
import { join } from "node:path";

// Each running server leaves a note of its pid and port in
// ~/.md-display/servers/ (MD_DISPLAY_HOME moves it), so `--wipe` can find
// them all. A note is only trusted once the server on its port confirms it.

const IDENTIFY_TIMEOUT_MS = 1000;
const STOP_WAIT_MS = 3000;
const POLL_MS = 50;

export interface ServerNote {
  pid: number;
  port: number;
  /** The folder it's serving. */
  root: string;
}

function notesDir(): string {
  return join(process.env.MD_DISPLAY_HOME ?? join(homedir(), ".md-display"), "servers");
}

export function writeNote(note: ServerNote): void {
  mkdirSync(notesDir(), { recursive: true });
  writeFileSync(join(notesDir(), `${note.pid}.json`), JSON.stringify(note));
}

export function removeNote(pid: number): void {
  rmSync(join(notesDir(), `${pid}.json`), { force: true });
}

function readNotes(): ServerNote[] {
  let names: string[];
  try {
    names = readdirSync(notesDir());
  } catch {
    return [];
  }
  return names.flatMap((name) => {
    try {
      return [JSON.parse(readFileSync(join(notesDir(), name), "utf8")) as ServerNote];
    } catch {
      return [];
    }
  });
}

/** The pid of the md-display serving on `port` (asked over HTTP); null if it's something else or nothing. */
export function serverOn(port: number): Promise<number | null> {
  return new Promise((resolve) => {
    const req = request(
      { host: "127.0.0.1", port, path: "/api/server", timeout: IDENTIFY_TIMEOUT_MS, headers: { host: `127.0.0.1:${port}` } },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => (body += chunk));
        res.on("end", () => {
          try {
            const info = JSON.parse(body) as { app?: string; pid?: number };
            resolve(info.app === "md-display" && isPid(info.pid) ? info.pid : null);
          } catch {
            resolve(null);
          }
        });
      },
    );
    req.on("timeout", () => req.destroy());
    req.on("error", () => resolve(null));
    req.end();
  });
}

/**
 * The pid of the md-display on `port`, only if its own note says it's there:
 * anything can listen on a port and claim any pid, so the answer alone isn't
 * trusted with stopping a process.
 */
export async function notedServerOn(port: number): Promise<number | null> {
  const pid = await serverOn(port);
  return pid !== null && pid !== process.pid && readNotes().some((note) => note.pid === pid && note.port === port) ? pid : null;
}

/** Every md-display running besides this one, confirmed by asking each; stale notes are cleared. */
export async function runningServers(): Promise<number[]> {
  const found: number[] = [];
  for (const note of readNotes()) {
    if (note.pid === process.pid) continue;
    if (!isAlive(note.pid)) {
      removeNote(note.pid);
      continue;
    }
    if ((await serverOn(note.port)) === note.pid) found.push(note.pid);
  }
  return found;
}

/** A single other process: 0 and negative pids signal whole groups, and 1 is init. */
function isPid(pid: unknown): pid is number {
  return Number.isInteger(pid) && (pid as number) > 1;
}

export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** Asks each process to stop, then forces any still running after a few seconds. */
export async function stop(pids: number[]): Promise<void> {
  pids = pids.filter((pid) => isPid(pid) && pid !== process.pid);
  for (const pid of pids) signal(pid, "SIGTERM");
  let left = await waitForExit(pids, STOP_WAIT_MS);
  for (const pid of left) signal(pid, "SIGKILL");
  left = await waitForExit(left, STOP_WAIT_MS);
  for (const pid of pids) if (!left.includes(pid)) removeNote(pid);
}

function signal(pid: number, name: NodeJS.Signals): void {
  try {
    process.kill(pid, name);
  } catch {
    // Already gone.
  }
}

async function waitForExit(pids: number[], ms: number): Promise<number[]> {
  const deadline = Date.now() + ms;
  let left = pids.filter(isAlive);
  while (left.length && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    left = left.filter(isAlive);
  }
  return left;
}
