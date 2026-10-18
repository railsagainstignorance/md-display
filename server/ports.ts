import { createServer } from "node:net";

// Choosing the port when the one asked for is taken: `--next` (the default)
// moves up to a free one nearby, `--replace` stops the md-display holding it,
// `--wipe` stops every md-display first. Only ever stops md-display servers:
// one is recognised by asking it, over HTTP, who it is, and finding the note
// it left when it started (see registry.ts).

export const DEFAULT_PORT = 8765;
export const MAX_NEXT_PORT_ATTEMPTS = 50;

export type PortMode = "next" | "replace" | "wipe";

export class PortError extends Error {}

/** What choosing a port needs from the system; tests pass fakes. */
export interface PortSystem {
  isPortFree(port: number): Promise<boolean>;
  /** The pid of the md-display serving on `port`, as its note confirms; null if it's something else or nothing. */
  serverOn(port: number): Promise<number | null>;
  /** Every other md-display running. */
  runningServers(): Promise<number[]>;
  /** Stops the given processes, waiting until they've gone. */
  stop(pids: number[]): Promise<void>;
  /** A whole number from 1 to 3. */
  step(): number;
}

/** The port to serve on, after applying the `mode` policy if `requested` is taken. */
export async function resolvePort(requested: number, mode: PortMode, system: PortSystem): Promise<number> {
  if (mode === "wipe") {
    const servers = await system.runningServers();
    if (servers.length) await system.stop(servers);
    return requested;
  }

  if (mode === "replace") {
    if (await system.isPortFree(requested)) return requested;
    const owner = await system.serverOn(requested);
    if (owner !== null) {
      await system.stop([owner]);
      return requested;
    }
    // Whatever had it may have just exited: check again before giving up.
    if (await system.isPortFree(requested)) return requested;
    throw new PortError(
      `Port ${requested} is in use by something that isn't md-display, so it won't be stopped. ` +
        `Pick a different --port, or free it yourself (see what has it with \`lsof -i :${requested}\`).`,
    );
  }

  let port = requested;
  if (await system.isPortFree(port)) return port;
  for (let i = 0; i < MAX_NEXT_PORT_ATTEMPTS; i++) {
    port += system.step();
    if (port > 65535) break;
    if (await system.isPortFree(port)) return port;
  }
  throw new PortError(`Couldn't find a free port near ${requested}.`);
}

/** Whether a server could listen on `port` at `host` right now. */
export function isPortFree(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = createServer();
    probe.once("error", () => resolve(false));
    probe.listen({ port, host, exclusive: true }, () => probe.close(() => resolve(true)));
  });
}
