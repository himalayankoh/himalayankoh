import { NextResponse } from 'next/server';
import { PROVIDER_SPECS, resolveConfigFor } from '@/lib/ai/gemini';
import { holdAiStatus, readHeldAiStatus } from '@/lib/ai/statusCache';

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
 * ## One answer is reused for a minute
 *
 * Resolving this list is six network reads against the WordPress-backed settings
 * store, measured at 3.5 to 4 s per call (7.4 s beside `/api/admin/ai-keys`), so
 * the answer is held for a minute and a read inside that window is answered from
 * it. The window, what is held, and why a failure is never remembered are all
 * documented in `lib/ai/statusCache.ts` — the cache lives there rather than here
 * because Next.js type-checks a route file's exports against the set of things a
 * route may export, and a test-only helper exported from this file fails the
 * build.
 */

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

export async function GET() {
  const held = readHeldAiStatus<AiStatusBody>();
  if (held) {
    return NextResponse.json(held);
  }

  try {
    const providers = await resolveProviderRows();
    const body: AiStatusBody = {
      backend: providers.some((p) => p.configured) ? 'configured' : 'missing',
      providers,
    };

    holdAiStatus(body);
    return NextResponse.json(body);
  } catch (err) {
    // Answered as before and never remembered: see the note in statusCache.ts on
    // failures.
    return NextResponse.json({
      backend: 'missing',
      providers: [],
      error: err instanceof Error ? err.message : 'Unknown error',
    });
  }
}
