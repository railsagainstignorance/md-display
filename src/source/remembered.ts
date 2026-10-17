import type { HandleRoot } from "./fsAccess";

// The last opened file or folder handles, kept in IndexedDB so a reopened tab
// can pick up where it left off (after the browser re-confirms permission).

const DB_NAME = "mddisplay";
const STORE = "handles";
const KEY = "last";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = action(db.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

export async function rememberRoot(root: HandleRoot): Promise<void> {
  try {
    await run("readwrite", (store) => store.put(root, KEY));
  } catch {
    // Not remembered (storage blocked): the user just reopens it next time.
  }
}

export async function rememberedRoot(): Promise<HandleRoot | null> {
  try {
    return ((await run("readonly", (store) => store.get(KEY))) as HandleRoot | undefined) ?? null;
  } catch {
    return null;
  }
}
