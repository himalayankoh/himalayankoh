import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import { getSettingsForCategory, upsertSettings } from '@/lib/settings/serverSettings';
import { SETTINGS_REGISTRY } from '@/lib/settings/registry';

const MASKED = '••••••••';

function maskSecret(value: string | null | undefined, source: 'db' | 'env' | 'unset'): string {
  if (!value) return '';
  return source === 'db' ? MASKED : `${MASKED} (Worker secret)`;
}

export async function GET(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const result: Record<string, Record<string, string>> = {};
  const sources: Record<string, Record<string, 'db' | 'env' | 'unset'>> = {};

  // One round trip per category, all at once. This used to `await` inside the
  // loop, so the screen paid one store read after another in series — measured
  // on staging: 7 categories, ~11.6s. The categories are independent, so there
  // is nothing to sequence.
  const categoryValues = await Promise.all(
    SETTINGS_REGISTRY.map((category) => getSettingsForCategory(category.id))
  );

  for (let index = 0; index < SETTINGS_REGISTRY.length; index += 1) {
    const category = SETTINGS_REGISTRY[index];
    const dbValues = categoryValues[index];
    result[category.id] = {};
    sources[category.id] = {};

    for (const field of category.fields) {
      const dbVal = dbValues[field.key];
      const envVal = process.env[field.envFallback];
      const source: 'db' | 'env' | 'unset' = dbVal ? 'db' : envVal ? 'env' : 'unset';

      sources[category.id][field.key] = source;

      if (field.type === 'password') {
        result[category.id][field.key] = maskSecret(dbVal || envVal, source);
      } else {
        result[category.id][field.key] = dbVal || envVal || '';
      }
    }
  }

  return NextResponse.json({ settings: result, sources });
}

export async function POST(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { category, settings } = body as { category: string; settings: Record<string, string> };

  const categoryDef = SETTINGS_REGISTRY.find((c) => c.id === category);
  if (!categoryDef) {
    return NextResponse.json({ error: 'Unknown settings category.' }, { status: 400 });
  }

  const toSave: Record<string, string | null> = {};
  for (const field of categoryDef.fields) {
    const raw = settings[field.key];
    if (raw === undefined) continue;
    // Skip masked placeholder values — user did not change this field
    if (typeof raw === 'string' && raw.startsWith('••')) continue;
    toSave[field.key] = raw.trim() || null;
  }

  await upsertSettings(category, toSave);
  return NextResponse.json({ ok: true, saved: Object.keys(toSave).length });
}
