/**
 * The held answer for `GET /api/ai/status`.
 *
 * ## Why this is not in the route file
 *
 * Next.js type-checks every export of a `route.ts` against the small set of
 * things a route handler may export, and a function that is not one of them
 * fails the build:
 *
 *   `.next/types/app/api/ai/status/route.ts:12:13`
 *   `Property '__resetAiStatusCache' is incompatible with index signature.`
 *
 * So the cache and the test-only reset live here, the route imports them, and
 * `route.ts` exports nothing but `dynamic` and `GET`. The reset keeps working
 * exactly as before — it is the same module-level record, one import away.
 *
 * ## Why the answer is held at all
 *
 * Resolving the provider list is not a local read: every provider's
 * configuration comes from the WordPress-backed settings store, so the answer
 * costs six network reads per call. Measured on the preview deployment
 * (2026-10-06), a bare `GET /api/ai/status` took 3.5 to 4 s, and 7.4 s when it
 * ran beside `/api/admin/ai-keys` on the same screen. The AI Hub was not usable
 * until that finished, and every visit to it paid the same cost again.
 *
 * So the answer is held for {@link AI_STATUS_TTL_MS} and a read inside that
 * window is answered from it. Sixty seconds is the window the storefront
 * catalogue read already owns (`STOREFRONT_READ_TTL_SECONDS` in
 * `lib/backend/serverCatalog.ts`) and the one the settings store caches for
 * (`lib/settings/serverSettings.ts`): the same number for the same reason, so a
 * badge here can never be fresher than the values the screen would read anyway.
 *
 * What is held is exactly that response — a boolean presence map, the
 * provider's configured model and where that key came from. No key, no secret
 * and no user input is stored, and the store is the only writer of the values
 * themselves.
 *
 * What is deliberately **not** cached:
 *
 *  - **A failure.** The route answers `backend: 'missing'` from its `catch`, and
 *    holding that for a minute would turn a momentary store error into a minute
 *    of "no providers connected" on the very screen the owner uses to fix it. A
 *    failed read is never handed to {@link holdAiStatus}, so the next call reads
 *    again.
 *
 * The cache is **per Worker isolate** and nothing durable: one module-level
 * record with an expiry, no KV, no binding, no new dependency. A cold isolate
 * does the real read, which is the behaviour the route had before this existed.
 */

/**
 * How long one answer may be reused, in milliseconds.
 *
 * Exported so a test can move past the window instead of waiting for it.
 */
export const AI_STATUS_TTL_MS = 60_000;

/** The one record held per isolate. `unknown` body: the route owns its shape. */
type HeldAnswer = { body: unknown; expiresAt: number };

let held: HeldAnswer | null = null;

/**
 * The held answer, or `null` when there is none or its window has passed.
 *
 * A stale record is left in place rather than dropped — it costs one overwrite
 * on the next successful read and keeps the read path free of writes.
 */
export function readHeldAiStatus<T>(): T | null {
  if (held && held.expiresAt > Date.now()) {
    return held.body as T;
  }
  return null;
}

/**
 * Hold an answer for one window.
 *
 * Called after the read finishes, so the window measures the answer's life
 * rather than the time the settings store took to produce it.
 */
export function holdAiStatus(body: unknown): void {
  held = { body, expiresAt: Date.now() + AI_STATUS_TTL_MS };
}

/**
 * Drop the held answer.
 *
 * Exists for tests, so the window can be exercised without waiting it out.
 * Production code never calls it.
 */
export function __resetAiStatusCacheForTests(): void {
  held = null;
}
