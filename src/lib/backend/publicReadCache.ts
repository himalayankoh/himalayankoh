/**
 * A short-lived cache for **public** commerce reads, to keep repeat browsing off
 * the WordPress origin.
 *
 * ## The problem this solves
 *
 * The storefront's catalogue data comes from a shared WordPress host that answers
 * one read in about 0.9 s and degrades to 2.5-3 s at eight concurrent reads
 * (measured 2026-10-06 on the staging origin). Anything that reduces how many
 * times that host is asked is worth more than any amount of frontend tuning.
 *
 * Rendered *pages* are already cached by Cloudflare's edge, through the framework's
 * CDN adapter. The **data route is not**: `/api/catalog` reads its own query string,
 * and the framework routes any handler that reads the request to its bypass
 * entrypoint, so that response can never be stored at the edge. Measured on the
 * preview deployment, a URL nobody had asked for yet cost the full origin read
 * (1.2-2.0 s, and 8.3 s on a cold isolate) while the same URL minutes later
 * answered in 0.11 s. The second number is the one this module makes reliable
 * rather than lucky.
 *
 * ## What it does
 *
 * A read is stored under a key built only from the parameters that change the
 * public answer, with a **fresh** window and a **stale** window:
 *
 *  - inside the fresh window, the stored answer is returned with no origin call;
 *  - inside the stale window, the stored answer is returned immediately and a
 *    refresh runs in the background, so a shopper never waits for a revalidation;
 *  - past both windows, the read happens synchronously.
 *
 * Concurrent identical reads are coalesced into one origin call per isolate, which
 * is the thundering-herd guard for a page that renders a grid of products at once.
 *
 * ## What it must never do
 *
 * It caches **only** the public projection of the catalogue, which is derived with
 * no reference to any visitor: the routes that use it read no cookie, no session
 * and no identity, so the stored body is the same bytes for everyone and cannot be
 * a personalized answer. The things it refuses to store are just as deliberate:
 *
 *  - **A failed or degraded read.** Caching a moment of origin trouble would turn
 *    it into a window of missing prices, so a load that reports a problem is
 *    returned and dropped.
 *  - **A free-text search.** Every distinct search is a distinct key, and a key
 *    space driven by user input is one an anonymous caller can fill.
 *
 * Cart, checkout, account, orders, wholesale and every admin read keep their own
 * `no-store` and never come near this module.
 *
 * ## How a saved product reaches it
 *
 * A stored read has to be droppable, or a price the owner has just saved would sit
 * behind it for the length of the window. The purge rides the purge the shop
 * already runs (`lib/backend/publicCache.ts`, called after every catalogue write)
 * rather than standing up a second invalidation system: it bumps a generation
 * number, and every key carries that generation, so one increment makes every
 * stored read unreachable at once. The superseded entries are left to expire on
 * their short TTL rather than enumerated and deleted, which is what keeps this to
 * one small entry instead of a key registry that two isolates could disagree about.
 *
 * ## Which stores it uses, and why both
 *
 * Two layers, read in order: Cloudflare's Workers Cache (`caches.default`), which
 * is shared by every request that reaches the same data centre, and a small
 * per-isolate map under it.
 *
 * The second layer is not a test fixture. Measured on the preview deployment
 * (2026-10-06), the shared layer alone was not dependable: of three never-before
 * requested catalogue URLs, one served its repeat in 0.38 s while another paid the
 * full origin read (1.29 s) on the second call and only sped up on the third. Two
 * requests seconds apart can be answered by different isolates, and a write to the
 * shared layer can be refused outright in a Worker whose cache is only enabled for
 * another entrypoint. A read that had already been computed on this isolate is
 * therefore kept here too, so a repeat on the same isolate is always answered
 * locally, and the shared layer is what makes it fast elsewhere.
 *
 * A failure to store is reported rather than swallowed: an origin shield that is
 * silently not shielding is worse than one that says so in the log, and a read that
 * could not be stored is still a correct read either way.
 */

import { SITE_ORIGIN } from '../site/origin';

/** How long one stored read is served without asking the origin. */
export const DEFAULT_FRESH_SECONDS = 60;

/**
 * How long past the fresh window a stored read may still be served while a refresh
 * runs behind it.
 *
 * Five minutes is chosen against the purge path rather than for its own sake: the
 * admin console purges the affected public pages and this catalogue cache when a
 * product is saved, so the stale window is what covers an origin that is slow to
 * answer, not what delays a price that the owner has just changed.
 */
export const DEFAULT_STALE_SECONDS = 300;

/**
 * One stored read.
 *
 * Lives in a Worker, but the key it is found by is built on the site's own origin
 * because Cloudflare scopes the Workers Cache to the zone the Worker runs in.
 */
export interface HeldReadEntry<T = unknown> {
  /** Milliseconds since the epoch, as the storing isolate saw it. */
  storedAt: number;
  value: T;
}

/**
 * Where a stored read lives.
 *
 * Injected rather than reached for directly, so the windows can be exercised
 * against a fake clock and a fake store without a Worker runtime.
 */
export interface HeldReadStore {
  /**
   * `origin` is the origin a shared store keys on, so entries cannot be written
   * outside the zone the Worker serves. A layer that has no such scope ignores it.
   */
  get(key: string, origin: string): Promise<HeldReadEntry | null>;
  put(key: string, entry: HeldReadEntry, ttlSeconds: number, origin: string): Promise<void>;
}

/**
 * The path every stored read is keyed under, on an origin inside the zone.
 *
 * Deliberately not a synthetic host. Cloudflare's Workers Cache is scoped to the
 * zone it runs in, and a `put()` whose URL belongs to no zone is accepted and then
 * not stored: measured on the preview deployment (2026-10-06), three never-before
 * requested catalogue URLs all missed on the second request and hit on the third,
 * which is the isolate's own copy answering rather than the shared one. Keys are
 * therefore built on the incoming request's own origin.
 */
const KEY_PATH = '/__public-read-cache/';

/**
 * The origin a stored read is keyed on when the caller names none.
 *
 * A purge has no request to take an origin from (it runs inside a write helper,
 * deep below the route), so it uses this site's own configured origin. A read
 * passes the origin it was actually served on. The two are the same host in a
 * normal deployment, which is what makes a purge reach the reads it is meant to;
 * if they ever disagree, the shared layer simply keeps serving its own entries
 * until their short TTL expires while the isolate's copy is purged, so the worst
 * case is a window of staleness rather than a wrong answer.
 */
const DEFAULT_KEY_ORIGIN = SITE_ORIGIN;

/** Every stored read for one origin, keyed by the encoded cache key. */
function keyRequest(key: string, origin: string): Request {
  return new Request(`${origin}${KEY_PATH}${encodeURIComponent(key)}`, { method: 'GET' });
}

/**
 * Workers Cache, when the runtime has it.
 *
 * `caches.default` honours the response's `Cache-Control: max-age`, so the entry
 * is stored for both windows combined and the freshness decision is ours: the
 * stored `storedAt` is what separates "serve it" from "refresh it".
 */
/**
 * The Workers Cache API's default cache.
 *
 * Reached through `globalThis` with a narrow local type rather than the DOM's
 * `CacheStorage`, which describes the browser's named caches and has no `default`.
 */
interface WorkersCache {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
}

function defaultWorkersCache(): WorkersCache | null {
  const holder = globalThis as { caches?: { default?: WorkersCache } };
  return holder.caches?.default ?? null;
}

function workersCacheStore(): HeldReadStore | null {
  const cache = defaultWorkersCache();
  if (!cache) return null;

  return {
    async get(key, origin) {
      const hit = await cache.match(keyRequest(key, origin));
      if (!hit) return null;
      try {
        return (await hit.json()) as HeldReadEntry;
      } catch {
        // An unreadable entry is treated as a miss rather than as a failure.
        return null;
      }
    },
    async put(key, entry, ttlSeconds, origin) {
      const stored = new Response(JSON.stringify(entry), {
        headers: {
          'Content-Type': 'application/json',
          // Browsers never see this response; it exists only for the Workers Cache
          // TTL, which reads `max-age` and ignores `s-maxage`.
          'Cache-Control': `public, max-age=${ttlSeconds}`,
        },
      });
      await cache.put(keyRequest(key, origin), stored);
    },
  };
}

/**
 * The shared layer over the isolate's own, read in that order.
 *
 * A write goes to both, and each is attempted even when the other fails, so one
 * layer refusing a write cannot take the other down with it. Both writes are
 * awaited: the isolate copy has to be in place before the response is sent, which
 * is the copy the next request on this isolate will read.
 */
function layeredStore(): HeldReadStore | null {
  const shared = workersCacheStore();
  if (!shared) return memoryStore;

  return {
    async get(key, origin) {
      // A shared layer that throws must not take the isolate's own copy with it,
      // which is why the fall-through is guarded rather than direct.
      const fromShared = await safely(() => shared.get(key, origin), null, 'the shared edge cache read');
      if (fromShared) return fromShared;
      return memoryStore.get(key, origin);
    },
    async put(key, entry, ttlSeconds, origin) {
      // The isolate copy first, because it is the one that cannot be refused, and
      // a failure of the shared copy must not cost it.
      await safely(
        () => memoryStore.put(key, entry, ttlSeconds, origin),
        undefined,
        "the isolate's own cache write"
      );
      await safely(() => shared.put(key, entry, ttlSeconds, origin), undefined, 'the shared edge cache write');
    },
  };
}

/**
 * The per-isolate fallback.
 *
 * Bounded, because an unbounded map in a long-lived isolate is a leak: the oldest
 * entries are dropped once it is full. It is a fallback rather than the main store
 * on purpose, since it only helps requests that land on the same isolate.
 */
const MEMORY_LIMIT = 200;
const memoryEntries = new Map<string, HeldReadEntry>();
const memoryStore: HeldReadStore = {
  async get(key) {
    return memoryEntries.get(key) ?? null;
  },
  async put(key, entry) {
    if (memoryEntries.size >= MEMORY_LIMIT) {
      const oldest = memoryEntries.keys().next();
      if (!oldest.done) memoryEntries.delete(oldest.value);
    }
    memoryEntries.set(key, entry);
  },
};

/**
 * Guarded so a refused store operation can never fail a read that already
 * succeeded, and reported once per isolate so a layer that is quietly not
 * working is visible without turning a broken cache into a flood of logs.
 */
const reportedFailures = new Set<string>();

async function safely<T>(run: () => Promise<T>, fallback: T, label = 'the store'): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (!reportedFailures.has(label)) {
      reportedFailures.add(label);
      console.warn(
        `[public-read-cache] ${label} failed, so public reads will not be reused: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
    return fallback;
  }
}

/**
 * A stable cache key from the parameters that change the public answer.
 *
 * Undefined values are written as a literal `-` so a key cannot shift when a
 * caller omits an argument it would otherwise pass, and the result is sorted so
 * two callers naming the same facts in a different order share one entry.
 */
export function publicReadKey(namespace: string, parts: Record<string, string | number | boolean | undefined | null>): string {
  const normalized = Object.keys(parts)
    .sort()
    .map((name) => `${name}=${parts[name] === undefined || parts[name] === null || parts[name] === '' ? '-' : String(parts[name])}`)
    .join('&');
  return `${namespace}?${normalized}`;
}

/**
 * The key the current generation is stored under.
 *
 * One entry, read at most once every {@link GENERATION_RECHECK_MS} per isolate,
 * which is what makes a purge take effect without a lookup per request.
 */
const GENERATION_KEY = 'catalog-generation';

/** How long an isolate may reuse its last-known generation before re-reading it. */
const GENERATION_RECHECK_MS = 10_000;

/** The generation entry is kept slightly longer than the longest stored read. */
const GENERATION_TTL_SECONDS = 3600;

let generationMemo: { value: number; checkedAt: number } | null = null;

/**
 * In-flight loads, so two identical reads in one isolate share a single origin call.
 *
 * This is the herd guard: a page that renders a grid asks for the same catalogue
 * once per component, and without this each of those would start its own read.
 */
const inFlight = new Map<string, Promise<unknown>>();

/** The store this process should use: Workers Cache where it exists, memory otherwise. */
function activeStore(): HeldReadStore {
  return layeredStore() ?? memoryStore;
}

/**
 * The generation every key is scoped to.
 *
 * Reading it is a cache lookup, so the answer is remembered briefly; a purge is
 * therefore visible within {@link GENERATION_RECHECK_MS} rather than instantly,
 * which is well inside the one-minute window the storefront already documents.
 */
async function currentGeneration(store: HeldReadStore, now: () => number, origin: string): Promise<number> {
  const memo = generationMemo;
  if (memo && now() - memo.checkedAt < GENERATION_RECHECK_MS) return memo.value;

  const held = await safely(() => store.get(GENERATION_KEY, origin), null);
  const value = typeof held?.value === 'number' && Number.isFinite(held.value) ? held.value : 0;
  generationMemo = { value, checkedAt: now() };
  return value;
}

/**
 * Drop every stored public read.
 *
 * Called after a catalogue mutation, from the purge the shop already runs, so a
 * saved price cannot hide behind a stored read. It does not delete entries: it
 * increments the generation every key is scoped to, and the entries left behind
 * expire on their own. A bump that could not be stored is not an error the caller
 * should see, since the mutation itself has already succeeded.
 */
export async function purgePublicReadCache(
  store: HeldReadStore = activeStore(),
  origin: string = DEFAULT_KEY_ORIGIN
): Promise<void> {
  inFlight.clear();
  memoryEntries.clear();
  generationMemo = null;

  const held = await safely(() => store.get(GENERATION_KEY, origin), null);
  const next = (typeof held?.value === 'number' && Number.isFinite(held.value) ? held.value : 0) + 1;

  await safely(
    () => store.put(GENERATION_KEY, { storedAt: Date.now(), value: next }, GENERATION_TTL_SECONDS, origin),
    undefined
  );
}

export interface PublicReadOptions<T> {
  /** The cache key, normally from {@link publicReadKey}. */
  key: string;
  /** The read to make when nothing usable is stored. */
  load: () => Promise<T>;
  /**
   * Whether this answer may be stored.
   *
   * A read that reports a failure, a degraded source, or a free-text query must
   * answer `false`, so a moment of origin trouble is never pinned for a window.
   */
  cacheable: (value: T) => boolean;
  freshSeconds?: number;
  staleSeconds?: number;
  /**
   * The origin a shared store keys on. Routes pass their own request origin, so a
   * stored read is always written inside the zone the Worker serves; tests and the
   * isolate-only fallback may leave it at the default.
   */
  keyOrigin?: string;
  /** Overridden by tests; the Workers Cache or the isolate map otherwise. */
  store?: HeldReadStore | null;
  /** Overridden by tests, so a window can be crossed without waiting. */
  now?: () => number;
  /**
   * How a background refresh is handed off.
   *
   * The Worker's `waitUntil` where there is a request context, so a refresh cannot
   * be cancelled when the response has already been sent.
   */
  background?: (work: Promise<unknown>) => void;
}

/** Run a load once per isolate per key, whatever the answer turns out to be. */
function loadOnce<T>(key: string, load: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const started = load().finally(() => {
    inFlight.delete(key);
  });
  inFlight.set(key, started);
  return started;
}

/**
 * Drop the in-flight markers and the fallback store.
 *
 * Exists for tests, so a window can be exercised without waiting it out and one
 * test's stored read cannot satisfy the next one's. Production never calls it.
 */
export function __resetPublicReadCache(): void {
  inFlight.clear();
  memoryEntries.clear();
  generationMemo = null;
}

/**
 * Read through the cache: the stored answer when it is good, the origin when it is
 * not, and a background refresh when it is merely old.
 */
export async function readThroughPublicCache<T>(options: PublicReadOptions<T>): Promise<T> {
  const freshSeconds = options.freshSeconds ?? DEFAULT_FRESH_SECONDS;
  const staleSeconds = options.staleSeconds ?? DEFAULT_STALE_SECONDS;
  const now = options.now ?? (() => Date.now());
  const store = options.store ?? activeStore();
  const keyOrigin = options.keyOrigin ?? DEFAULT_KEY_ORIGIN;
  const background = options.background ?? ((work: Promise<unknown>) => { void work.catch(() => {}); });

  // Every key carries the generation, so one increment makes every stored read
  // unreachable without enumerating them.
  const key = `${await currentGeneration(store, now, keyOrigin)}:${options.key}`;

  const held = await safely(() => store.get(key, keyOrigin), null);

  if (held && typeof held.storedAt === 'number') {
    const ageSeconds = (now() - held.storedAt) / 1000;

    if (ageSeconds <= freshSeconds) return held.value as T;

    if (ageSeconds <= freshSeconds + staleSeconds) {
      // Serve the recent answer now and refresh behind it. The refresh is
      // coalesced, so a burst of stale hits still makes one origin call.
      const refresh = loadOnce(key, options.load).then(async (value) => {
        if (!options.cacheable(value)) return value;
        await safely(
          () => store.put(key, { storedAt: now(), value }, freshSeconds + staleSeconds, keyOrigin),
          undefined
        );
        return value;
      });
      background(refresh.catch(() => {}));
      return held.value as T;
    }
  }

  const value = await loadOnce(key, options.load);
  if (options.cacheable(value)) {
    await safely(
      () => store.put(key, { storedAt: now(), value }, freshSeconds + staleSeconds, keyOrigin),
      undefined
    );
  }
  return value;
}
