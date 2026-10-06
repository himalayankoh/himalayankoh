import { NextResponse } from 'next/server';
import { PROVIDER_SPECS, resolveConfigFor } from '@/lib/ai/gemini';

export const dynamic = 'force-dynamic';

/**
 * Which AI providers actually have a key on the server.
 *
 * This used to report a single provider — whichever `resolveAiSeoConfig()`
 * picked — so the AI Hub marked every other provider "No key yet" even when a key
 * was stored for it; later it reported two. It now walks the one provider list
 * the server can call, so the screen's badges and "N of 6 connected" count are
 * both derived from the same facts.
 *
 * Booleans only — a configured key is never returned, only that it exists.
 *
 * ## Why one answer is reused for a minute
 *
 * Resolving this list is not a local read: every provider's configuration comes
 * from the WordPress-backed settings store, so the answer costs six network reads
 * per call. Measured on the preview deployment (2026-10-06), a bare
 * `GET /api/ai/status` took 3.5 to 4 s, and 7.4 s when it ran beside
 * `/api/admin/ai-keys` on the same screen. The AI Hub was not usable until that
 * finished, and every visit to it paid the same cost again.
 *
 * So the answer is held for {@link AI_STATUS_TTL_MS} and a read inside that window
 * is answered from it. Sixty seconds is the window the storefront catalogue read
 * already owns (`STOREFRONT_READ_TTL_SECONDS` in `lib/backend/serverCatalog.ts`)
 * and the one the settings store caches for (`lib/settings/serverSettings.ts`):
 * the same number for the same reason, so a badge here can never be fresher than
 * the values the screen would read anyway.
 *
 * What is held is exactly this response — a boolean presence map, the provider's
 * configured model and where that key came from. No key, no secret and no user
 * input is stored, and the store is the only writer of the values themselves.
 *
 * What is deliberately **not** cached:
 *
 *  - **A failure.** The `catch` below answers `backend: 'missing'`, and holding
 *    that for a minute would turn a momentary store error into a minute of "no
 *    providers connected" on the very screen the owner uses to fix it. A failed
 *    read answers exactly as it did before and the next call reads again.
 *
 * The cache is **per Worker isolate** and nothing durable: one module-level record
 * with an expiry, no KV, no binding, no new dependency. A cold isolate does the
 * real read, which is the behaviour this route had before it existed.
 */

/**
 * How long one answer may be reused, in milliseconds.
 *
 * Exported so a test can move past the window instead of waiting for it.
 */
export const AI_STATUS_TTL_MS = 60_000;

/** The provider list, as the settings store reports it. */
async function resolveProviderRows() {
  return Promise.all(
    PROVIDER_SPECS.map(async (spec) => {
      const config = await resolveConfigFor(spec.id);
      return { id: spec.id, name: spec.label, configured: !!config.apiKey, model: config.model, source: config.keySource };
    }),
  );
}

type ProviderStatusRow = Awaited<ReturnType<typeof resolveProviderRows>>[number];

/** The exact body this route answers with, held for one window. */
type AiStatusBody = {
  backend: 'configured' | 'missing';
  providers: ProviderStatusRow[];
};

let cachedStatus: { body: AiStatusBody; expiresAt: number } | null = null;

/**
 * Drop the held answer.
 *
 * Exists for tests, so the window can be exercised without waiting it out.
 * Production code never calls it.
 */
export function __resetAiStatusCache(): void {
  cachedStatus = null;
}

export async function GET() {
  const held = cachedStatus;
  if (held && held.expiresAt > Date.now()) {
    return NextResponse.json(held.body);
  }

  try {
    const providers = await resolveProviderRows();
    const body: AiStatusBody = {
      backend: providers.some((p) => p.configured) ? 'configured' : 'missing',
      providers,
    };

    // Stamped after the read finishes, so the window measures the answer's life
    // rather than the time the store took to produce it.
    cachedStatus = { body, expiresAt: Date.now() + AI_STATUS_TTL_MS };
    return NextResponse.json(body);
  } catch (err) {
    // Answered as before and never remembered: see the note above on failures.
    return NextResponse.json({
      backend: 'missing',
      providers: [],
      error: err instanceof Error ? err.message : 'Unknown error',
    });
  }
}
