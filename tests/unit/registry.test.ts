import { mkdtempSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { notedServerOn, removeNote, stop, writeNote } from "../../server/registry.ts";

// Which processes md-display will stop. A fake server stands in for whatever
// holds the port, and process.kill is mocked: nothing is ever signalled.

const PID = 424242;
let home: string;
let server: Server;
let claim: unknown;
let port: number;

beforeAll(async () => {
  home = mkdtempSync(join(tmpdir(), "md-display-registry-"));
  vi.stubEnv("MD_DISPLAY_HOME", home);
  server = createServer((_, res) => res.end(JSON.stringify({ app: "md-display", pid: claim })));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as { port: number }).port;
});

afterEach(() => {
  removeNote(PID);
  vi.restoreAllMocks();
});

afterAll(() => {
  server.close();
  vi.unstubAllEnvs();
  rmSync(home, { recursive: true, force: true });
});

describe("notedServerOn", () => {
  it("trusts a pid only when its note puts it on that port", async () => {
    claim = PID;
    expect(await notedServerOn(port)).toBeNull();
    writeNote({ pid: PID, port: port + 1, root: home });
    expect(await notedServerOn(port)).toBeNull();
    writeNote({ pid: PID, port, root: home });
    expect(await notedServerOn(port)).toBe(PID);
  });

  it("never takes a pid that would signal a whole group, init or itself", async () => {
    for (const pid of [-1, 0, 1, process.pid, "42", 4.2]) {
      claim = pid;
      if (typeof pid === "number") writeNote({ pid, port, root: home });
      expect(await notedServerOn(port)).toBeNull();
      if (typeof pid === "number") removeNote(pid);
    }
  });
});

describe("stop", () => {
  it("signals no group, init or itself, whatever it's given", async () => {
    const kill = vi.spyOn(process, "kill").mockImplementation(() => true);
    await stop([-1, 0, 1, process.pid]);
    expect(kill).not.toHaveBeenCalled();
  });
});
