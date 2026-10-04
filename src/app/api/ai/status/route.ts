import { NextResponse } from 'next/server';
import { getSetting } from '@/lib/settings/serverSettings';
import { DEFAULT_OPENROUTER_MODEL, DEFAULT_GEMINI_MODEL } from '@/lib/ai/gemini';

export const dynamic = 'force-dynamic';

/**
 * Which AI providers actually have a key on the server.
 *
 * This used to report a single provider — whichever `resolveAiSeoConfig()`
 * picked — so the AI Hub showed "1 of 6 providers connected" and marked every
 * other provider "No key yet" even when a key was stored for it. The screen
 * keys its badges off `providers[].id`, so it needs one honest row per
 * provider the server can call, not one row total.
 *
 * Booleans only — a configured key is never returned, only that it exists.
 */
export async function GET() {
  try {
    const [orDbKey, orDbModel, geminiDbKey, geminiDbModel] = await Promise.all([
      getSetting('openrouter', 'api_key'),
      getSetting('openrouter', 'model'),
      getSetting('gemini', 'api_key'),
      getSetting('gemini', 'model'),
    ]);

    const orKey = (orDbKey || process.env.OPENROUTER_API_KEY || process.env.OPEN_ROUTER_API_KEY || '').trim();
    const geminiKey = (geminiDbKey || process.env.GEMINI_API_KEY || '').trim();

    const orModel = (orDbModel || process.env.OPENROUTER_MODEL || DEFAULT_OPENROUTER_MODEL).trim();
    const geminiModel = (geminiDbModel || process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL).trim();

    const providers = [
      { id: 'openrouter', name: 'OpenRouter', configured: !!orKey, model: orModel },
      { id: 'gemini', name: 'Google AI Studio (Gemini)', configured: !!geminiKey, model: geminiModel },
    ];

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
