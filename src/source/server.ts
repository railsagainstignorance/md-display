import type { DocEntry, DocSource } from "./types";

// Docs from md-display's local server (`md-display <folder>`, see server/):
// it reads any file under the folder it was started on and pushes changes,
// so there's nothing to pick and live updates work in every browser.

export interface ServerInfo {
  label: string;
  /** The doc to open first, when the server was started on one file. */
  startDoc: string | null;
  /** List the bundled demo docs too. */
  demo: boolean;
}

/**
 * The local server's details if it served this page; null otherwise. The
 * hosted page is served over https, so it never asks.
 */
export async function connectToServer(): Promise<ServerInfo | null> {
  if (location.protocol !== "http:") return null;
  try {
    const res = await fetch("./api/server", { cache: "no-store" });
    const info = res.ok ? await res.json() : null;
    return info?.app === "md-display" ? info : null;
  } catch {
    return null; // Not a local server, or it's stopped and the page came from the offline copy.
  }
}

export class ServerSource implements DocSource {
  readonly key = "local";
  readonly label: string;
  private events: EventSource | null = null;
  private readonly listeners = new Map<string, Set<() => void>>();

  constructor(info: ServerInfo) {
    this.label = `📁 ${info.label}`;
  }

  async listDocs(): Promise<DocEntry[]> {
    const res = await fetch("./api/docs", { cache: "no-store" });
    if (!res.ok) throw new Error("the md-display server couldn't list the docs");
    return res.json();
  }

  async read(path: string): Promise<string> {
    const res = await this.file(path);
    if (!res.ok) throw new Error(`${path} can't be found`);
    return res.text();
  }

  async readAsset(path: string): Promise<Blob | null> {
    try {
      const res = await this.file(path);
      return res.ok ? await res.blob() : null;
    } catch {
      return null;
    }
  }

  watch(path: string, onChange: () => void): () => void {
    let set = this.listeners.get(path);
    if (!set) this.listeners.set(path, (set = new Set()));
    set.add(onChange);
    this.listen();
    return () => {
      set.delete(onChange);
      if (!set.size) this.listeners.delete(path);
      if (!this.listeners.size) {
        this.events?.close();
        this.events = null;
      }
    };
  }

  /** One stream of changes for every doc watched. Reconnecting (the server restarted), every doc may have changed. */
  private listen(): void {
    if (this.events) return;
    const events = (this.events = new EventSource("./api/events"));
    let dropped = false;
    events.addEventListener("error", () => (dropped = true));
    events.addEventListener("open", () => {
      if (!dropped) return;
      dropped = false;
      for (const set of this.listeners.values()) for (const listener of set) listener();
    });
    events.addEventListener("message", (e) => {
      const { path } = JSON.parse(e.data) as { path: string };
      for (const listener of this.listeners.get(path) ?? []) listener();
    });
  }

  private file(path: string): Promise<Response> {
    return fetch(`./api/file?path=${encodeURIComponent(path)}`, { cache: "no-store" });
  }
}
