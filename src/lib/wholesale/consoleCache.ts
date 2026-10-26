/**
 * In-memory cache for the wholesale console snapshot.
 *
 * Keeps the console fast across tab switches and coalesces concurrent reads,
 * while automatically bypassing in tests so unit mocks stay isolated.
 */

let cachedConsole: { data: unknown; timestamp: number } | null = null;
let pendingPromise: Promise<unknown> | null = null;

export function getConsoleCache<T>(ttlMs = 60_000, forceFresh = false): T | null {
  if (process.env.NODE_ENV === 'test') return null;
  const now = Date.now();
  if (!forceFresh && cachedConsole && now - cachedConsole.timestamp < ttlMs) {
    return cachedConsole.data as T;
  }
  return null;
}

export function getPendingConsolePromise<T>(): Promise<T> | null {
  if (process.env.NODE_ENV === 'test') return null;
  return pendingPromise as Promise<T> | null;
}

export function setPendingConsolePromise(p: Promise<unknown> | null): void {
  pendingPromise = p;
}

export function setConsoleCache(data: unknown): void {
  if (process.env.NODE_ENV === 'test') return;
  cachedConsole = { data, timestamp: Date.now() };
}

export function invalidateConsoleCache(): void {
  cachedConsole = null;
  pendingPromise = null;
}
