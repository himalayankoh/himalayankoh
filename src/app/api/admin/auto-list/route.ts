/**
 * The console's auto-publish toggle, persisted server-side.
 *
 * The Products screen reads and writes this so the setting survives a reload and
 * is shared across devices — the alternative it used before was a per-browser
 * flag, which meant the switch could disagree with itself on a second device.
 *
 * It lives in `site_settings` under the `console` category: console preferences
 * are application data this app already stores there (see `lib/admin/campaigns.ts`
 * for the same reasoning), and no migration is needed for one boolean.
 *
 * The flag is a *preference*, never a publish: a product is still promoted only by
 * the editor's own save path, and an unreadable preference answers `false`, so a
 * failed read can never turn auto-publishing on.
 */

import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import { getSetting, upsertSettings } from '@/lib/settings/serverSettings';

export const dynamic = 'force-dynamic';

const CATEGORY = 'console';
const KEY = 'auto_list';

export async function GET(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const stored = await getSetting(CATEGORY, KEY);
  return NextResponse.json({ enabled: stored === 'true' });
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

  const { enabled } = body as { enabled?: unknown };
  if (typeof enabled !== 'boolean') {
    return NextResponse.json({ error: '`enabled` must be true or false.' }, { status: 400 });
  }

  try {
    await upsertSettings(CATEGORY, { [KEY]: enabled ? 'true' : 'false' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The preference could not be saved.';
    return NextResponse.json({ error: message }, { status: 502 });
  }

  return NextResponse.json({ enabled });
}
