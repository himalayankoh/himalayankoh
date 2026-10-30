/**
 * One shared catalog read per query, for the browser.
 *
 * Every catalog-reading surface used to mount its own read of the whole
 * catalogue (`/products?per_page=100&page=1`). On a product grid that meant the
 * server read the catalogue for the page *and* for its metadata, and then the
 * client read it again on mount — and again whenever a realtime event coalesced
 * into a refetch. The measured cost was one failed upstream request per screen
 * plus avoidable latency on every navigation.
 *
 * This module is the single place that de-duplicates those reads:
 *
 * 1. **In-flight sharing** — two components asking for the same query at the
 *    same time await one promise, so a route change cannot start a second
 *    request while the first is still open.
 * 2. **A short TTL** — the result is reused for `ttlMs`, so navigating between
 *    catalogue surfaces in one session does not re-read the catalogue each time.
 *    The window is deliberately short: stock and prices are the point of the
 *    catalogue, so an answer that is minutes old is worse than a second request.
 * 3. **Explicit invalidation** — a realtime catalog change clears the cache, so
 *    the "short TTL" is an upper bound, not the freshness rule.
 *
 * Reads that carry a signal are never cached, because a caller that can abort a
 * read is a caller that expects its own request.
 */

type Entry<T> = { at: number; promise: Promise<T> };

const entries = new Map<string, Entry<unknown>>();

/** How long a completed catalog read may be reused in the browser. */
export const CATALOG_TTL_MS = 30_000;

export interface SharedReadOptions {
  /** Read once and never cache — used when the caller passes an AbortSignal. */
  noStore?: boolean;
  ttlMs?: number;
}

/**
 * Run `read` at most once per `key` within the TTL window.
 *
 * A rejected read is evicted immediately so a transient failure cannot pin an
 * error in the cache for the rest of the window.
 */
export async function readShared<T>(
  key: string,
  read: () => Promise<T>,
  options: SharedReadOptions = {}
): Promise<T> {
  if (options.noStore) return read();

  const ttlMs = options.ttlMs ?? CATALOG_TTL_MS;
  const now = Date.now();
  const hit = entries.get(key) as Entry<T> | undefined;

  if (hit && now - hit.at < ttlMs) return hit.promise;

  const promise = read().catch((error) => {
    entries.delete(key);
    throw error;
  });

  entries.set(key, { at: now, promise });
  return promise;
}

/** Drop every cached read. Called when the catalog is known to have changed. */
export function invalidateSharedReads(): void {
  entries.clear();
}

/** Test-only view of what is currently cached. */
export function sharedReadKeys(): string[] {
  return Array.from(entries.keys());
}
