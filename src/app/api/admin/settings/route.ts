/**
 * The admin settings store, as the console edits it.
 *
 * ## One read, and the badge that used to cost a second
 *
 * Every field the console can edit is described by `SETTINGS_REGISTRY`, and the values
 * come from one WordPress option per category — so this route reads one category per
 * registry entry, all at once. That fan-out is already the shape it should be; the reads
 * are independent and there is nothing to sequence.
 *
 * What used to be wasteful was the *screen*. The panel that draws these fields also shows
 * a Stripe status badge, and it fetched that from `/api/admin/payments` in a second
 * authenticated request — which re-read the `stripe` category this route already holds,
 * plus the `payments` category, to say one word. So the badge is answered here now, from
 * the row already in hand plus a single read of `payments`, and the screen asks once.
 *
 * ## Secrets never leave the server
 *
 * A stored password is returned as the mask the panel expects (`••••••••`), never as its
 * value, and the `sources` map says whether each field is configured in WordPress, in the
 * Worker's environment, or not at all. The Stripe badge goes further and carries no key
 * material whatsoever — not even a masked fragment — because a badge has no use for it.
 */

import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import { getSettingsForCategory, getSettingsForCategoryWithStatus, upsertSettings } from '@/lib/settings/serverSettings';
import { SETTINGS_REGISTRY } from '@/lib/settings/registry';
import { stripeBadge, stripeFacts, type StripeBadge } from '@/lib/stripe/server/stripe';

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
  //
  // `payments` is not one of them: it is not a field the console edits, it is where the
  // Stripe badge's state lives. It is read in the same wave rather than after, and a
  // store that cannot answer it leaves the badge *unknown* instead of failing the screen.
  //
  // The status-carrying read is deliberate. `getSettingsForCategory` answers `{}` for
  // both "nothing is stored" and "the store refused", and built from an empty object the
  // badge would say "configured and ready" about a provider nothing was read about.
  const [categoryValues, paymentsRead] = await Promise.all([
    Promise.all(SETTINGS_REGISTRY.map((category) => getSettingsForCategory(category.id))),
    getSettingsForCategoryWithStatus('payments'),
  ]);
  const paymentValues = paymentsRead.ok ? paymentsRead.values : null;

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

  // The Stripe category is one of the rows read above, so the badge costs the `payments`
  // read and nothing more.
  let stripe: StripeBadge | null = null;
  if (paymentValues) {
    const stripeIndex = SETTINGS_REGISTRY.findIndex((category) => category.id === 'stripe');
    stripe = stripeBadge(
      stripeFacts({
        stripe: stripeIndex >= 0 ? categoryValues[stripeIndex] ?? {} : {},
        payments: paymentValues,
      })
    );
  }

  return NextResponse.json({ settings: result, sources, stripe });
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
