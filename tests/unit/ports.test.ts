import { describe, expect, it, vi } from "vitest";
import { PortError, resolvePort, type PortSystem } from "../../server/ports.ts";

// The port policy against a fake system: these tests never touch real ports or processes.

function system({ taken = [] as number[], servers = {} as Record<number, number>, ...overrides }: Partial<PortSystem> & {
  taken?: number[];
  servers?: Record<number, number>;
} = {}): PortSystem & { stop: ReturnType<typeof vi.fn> } {
  return {
    isPortFree: async (port) => !taken.includes(port),
    serverOn: async (port) => servers[port] ?? null,
    runningServers: async () => Object.values(servers),
    step: () => 1,
    ...overrides,
    stop: vi.fn(async () => {}),
  };
}

describe("--next", () => {
  it("returns the port asked for when it's free", async () => {
    expect(await resolvePort(8765, "next", system())).toBe(8765);
  });

  it("steps up until a port is free", async () => {
    const steps = [2, 1, 3];
    const fake = system({ taken: [8765, 8767, 8768], step: () => steps.shift()! });
    expect(await resolvePort(8765, "next", fake)).toBe(8771);
  });

  it("gives up after 50 tries", async () => {
    const fake = system({ isPortFree: async () => false });
    await expect(resolvePort(8765, "next", fake)).rejects.toThrow(PortError);
  });

  it("never stops anything", async () => {
    const fake = system({ taken: [8765], servers: { 8765: 42 } });
    expect(await resolvePort(8765, "next", fake)).toBe(8766);
    expect(fake.stop).not.toHaveBeenCalled();
  });
});

describe("--replace", () => {
  it("returns the port asked for when it's free", async () => {
    const fake = system();
    expect(await resolvePort(8765, "replace", fake)).toBe(8765);
    expect(fake.stop).not.toHaveBeenCalled();
  });

  it("stops the md-display holding the port and takes it", async () => {
    const fake = system({ taken: [8765], servers: { 8765: 42 } });
    expect(await resolvePort(8765, "replace", fake)).toBe(8765);
    expect(fake.stop).toHaveBeenCalledWith([42]);
  });

  it("refuses to stop something that isn't md-display", async () => {
    const fake = system({ taken: [8765] });
    await expect(resolvePort(8765, "replace", fake)).rejects.toThrow(/isn't md-display/);
    expect(fake.stop).not.toHaveBeenCalled();
  });

  it("takes the port if whatever had it exits before the second check", async () => {
    const free = [false, true];
    const fake = system({ isPortFree: async () => free.shift()! });
    expect(await resolvePort(8765, "replace", fake)).toBe(8765);
    expect(fake.stop).not.toHaveBeenCalled();
  });
});

describe("--wipe", () => {
  it("stops every md-display, then returns the port asked for", async () => {
    const fake = system({ servers: { 8765: 42, 9000: 43 } });
    expect(await resolvePort(8765, "wipe", fake)).toBe(8765);
    expect(fake.stop).toHaveBeenCalledWith([42, 43]);
  });

  it("does nothing when none are running", async () => {
    const fake = system();
    expect(await resolvePort(8765, "wipe", fake)).toBe(8765);
    expect(fake.stop).not.toHaveBeenCalled();
  });
});
