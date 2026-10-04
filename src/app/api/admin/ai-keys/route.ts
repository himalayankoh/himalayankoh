/**
 * AI provider keys, as the AI Hub edits them.
 *
 * The AI Hub screen was built against this endpoint, but the route was never
 * added — so "Attach Key" posted to a URL that did not exist and every save
 * failed. This is that route.
 *
 * A key is not new state: it lives in the same WordPress option the settings
 * screen writes, one category per provider, which is also what
 * `resolveConfigFor()` reads. So attaching a key here and saving it on the
 * Settings screen are the same write, and a provider the store cannot answer for
 * reports `none` rather than pretending to be configured.
 *
 * The attachable set is derived from the server's own provider list
 * (`PROVIDER_SPECS`), so a provider is attachable exactly when the server has a
 * handler that can call it. This used to be a hand-written map of two
 * (OpenRouter and Gemini), which is why a DeepSeek key returned a 400 while the
 * card sat there inviting one.
 *
 * Secrets never leave the server: reads return a mask, never the value.
 */

import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import { getSettingsForCategoryWithStatus, upsertSettings, deleteSetting } from '@/lib/settings/serverSettings';
import { PROVIDER_SPEC_BY_ID, isCallableProvider } from '@/lib/ai/gemini';

const MASKED = '••••••••';

function maskKey(value: string): string {
  if (value.length <= 8) return MASKED;
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

export async function GET(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const providers = await Promise.all(
    Object.values(PROVIDER_SPEC_BY_ID).map(async (spec) => {
      const read = await getSettingsForCategoryWithStatus(spec.category);
      const dbKey = (read.values?.api_key || '').trim();
      const envKey = spec.envKeys.map((key) => (process.env[key] || '').trim()).find(Boolean) || '';

      if (dbKey) {
        return { id: spec.id, configured: true, source: 'attached' as const, masked: maskKey(dbKey) };
      }
      if (envKey) {
        return { id: spec.id, configured: true, source: 'server' as const, masked: maskKey(envKey) };
      }
      return { id: spec.id, configured: false, source: 'none' as const, masked: '' };
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

  if (action !== 'set' && action !== 'clear') {
    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  }
  if (!isCallableProvider(provider)) {
    return NextResponse.json(
      { error: 'This provider has no server-side handler in this app, so a key for it could never be used. Attach a key for one of: ' + Object.values(PROVIDER_SPEC_BY_ID).map((spec) => spec.label).join(', ') + '.' },
      { status: 400 },
    );
  }

  const spec = PROVIDER_SPEC_BY_ID[provider];

  if (action === 'clear') {
    await deleteSetting(spec.category, 'api_key');
    return NextResponse.json({ ok: true });
  }

  const key = (body.key || '').trim();
  if (key.length < 8) {
    return NextResponse.json({ error: 'Paste the full API key first.' }, { status: 400 });
  }

  await upsertSettings(spec.category, { api_key: key });
  return NextResponse.json({ ok: true, masked: maskKey(key) });
}
