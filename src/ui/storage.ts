// Remembered choices. Storage can be unavailable (a private window, blocked
// site data) or throw; then a choice just isn't remembered.

type Area = "local" | "session";

function area(which: Area): Storage {
  return which === "local" ? localStorage : sessionStorage;
}

export function storedFlag(which: Area, key: string): boolean {
  return storedValue(which, key) === "1";
}

export function storeFlag(which: Area, key: string, on: boolean): void {
  storeValue(which, key, on ? "1" : "0");
}

export function storedValue(which: Area, key: string): string | null {
  try {
    return area(which).getItem(key);
  } catch {
    return null;
  }
}

export function storeValue(which: Area, key: string, value: string): void {
  try {
    area(which).setItem(key, value);
  } catch {
    // Not remembered.
  }
}
