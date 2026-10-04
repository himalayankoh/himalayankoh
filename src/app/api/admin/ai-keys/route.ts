/**
 * AI provider keys, as the AI Hub edits them.
 *
 * The AI Hub screen was built against this endpoint, but the route was never
 * added — so "Attach Key" posted to a URL that did not exist and every save
 * failed. This is that route.
 *
 * A key is not new state: it lives in the same WordPress option the settings
 * screen writes, one category per provider (`openrouter`, `gemini`), which is
 * also what `resolveAiSeoConfig()` reads. So attaching a key here and saving it
 * on the Settings screen are the same write, and a provider the store cannot
 * answer for reports `none` rather than pretending to be configured.
 *
 * Only the providers the server can actually call are attachable. The others
 * on the screen (DeepSeek, OpenAI, Anthropic, Codex) have no server-side
 * handler in this app, so a key pasted for them could never be used — this
 * route says so instead of storing a secret nothing reads.
 *
 * Secrets never leave the server: reads return a mask, never the value.
 */

import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import { getSettingsForCategoryWithStatus, upsertSettings, deleteSetting } from '@/lib/settings/serverSettings';

const MASKED = '••••••••';

/** Providers with a server-side key store, mapped to their settings category + env fallback. */
const ATTACHABLE_PROVIDERS: Record<string, { category: string; env: string }> = {
  openrouter: { category: 'openrouter', env: 'OPENROUTER_API_KEY' },
  gemini: { category: 'gemini', env: 'GEMINI_API_KEY' },
};

function maskKey(value: string): string {
  if (value.length <= 8) return MASKED;
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

export async function GET(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const providers = await Promise.all(
    Object.entries(ATTACHABLE_PROVIDERS).map(async ([id, { category, env }]) => {
      const read = await getSettingsForCategoryWithStatus(category);
      const dbKey = (read.values?.api_key || '').trim();
      const envKey = (process.env[env] || '').trim();

      if (dbKey) {
        return { id, configured: true, source: 'attached' as const, masked: maskKey(dbKey) };
      }
      if (envKey) {
        return { id, configured: true, source: 'server' as const, masked: maskKey(envKey) };
      }
      return { id, configured: false, source: 'none' as const, masked: '' };
    }),
  );

  return NextResponse.json({ providers });
}

export async function POST(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: { action?: string; provider?: string; key?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const action = body.action;
  const provider = (body.provider || '').trim();
  const providerDef = ATTACHABLE_PROVIDERS[provider];

  if (action !== 'set' && action !== 'clear') {
    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  }
  if (!providerDef) {
    return NextResponse.json(
      { error: 'This provider has no server-side key store in this app. Only OpenRouter and Google AI Studio (Gemini) keys can be attached here.' },
      { status: 400 },
    );
  }

  if (action === 'clear') {
    await deleteSetting(providerDef.category, 'api_key');
    return NextResponse.json({ ok: true });
  }

  const key = (body.key || '').trim();
  if (key.length < 8) {
    return NextResponse.json({ error: 'Paste the full API key first.' }, { status: 400 });
  }

  await upsertSettings(providerDef.category, { api_key: key });
  return NextResponse.json({ ok: true, masked: maskKey(key) });
}
