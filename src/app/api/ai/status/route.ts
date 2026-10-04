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
 */
export async function GET() {
  try {
    const providers = await Promise.all(
      PROVIDER_SPECS.map(async (spec) => {
        const config = await resolveConfigFor(spec.id);
        return { id: spec.id, name: spec.label, configured: !!config.apiKey, model: config.model, source: config.keySource };
      }),
    );

    return NextResponse.json({
      backend: providers.some((p) => p.configured) ? 'configured' : 'missing',
      providers,
    });
  } catch (err) {
    return NextResponse.json({
      backend: 'missing',
      providers: [],
      error: err instanceof Error ? err.message : 'Unknown error',
    });
  }
}
