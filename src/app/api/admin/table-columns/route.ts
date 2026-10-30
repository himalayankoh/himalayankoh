/**
 * The catalogue table's column order, saved for the signed-in admin.
 *
 * The Products table lets an admin drag columns into the order they want. The
 * browser already keeps a copy in `localStorage` as the first-paint value; this
 * route is the shared copy, so the order follows the admin to another device.
 *
 * Stored per admin id under `site_settings` (`console` category): two admins
 * looking at the same catalogue want their own order, so one shared row would be
 * wrong. An unknown or duplicate key is dropped on both read and write — the
 * table renders a fixed set of columns, and a stored order may not invent one.
 */

import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import { getSetting, upsertSettings } from '@/lib/settings/serverSettings';

export const dynamic = 'force-dynamic';

const CATEGORY = 'console';

/**
 * The columns the table actually has. Kept in step with
 * `features/catalog/tableColumns.ts`, which is the client's own list; unknown
 * keys are refused here rather than stored and ignored later.
 */
const COLUMN_KEYS = [
  'product',
  'category',
  'status',
  'price',
  'margin',
  'stock',
  'views',
  'interest',
  'age',
  'promotion',
  'readiness',
  'actions',
] as const;

const KNOWN = new Set<string>(COLUMN_KEYS);

function sanitize(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string' || !KNOWN.has(entry) || seen.has(entry)) continue;
    seen.add(entry);
    ordered.push(entry);
  }
  if (ordered.length === 0) return null;
  // A stored order that omits columns is completed rather than rejected: new
  // columns appear at the end instead of the admin losing their whole order.
  for (const key of COLUMN_KEYS) if (!seen.has(key)) ordered.push(key);
  return ordered;
}

function storageKey(userId: string): string {
  return `table_columns:${userId}`;
}

export async function GET(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const stored = await getSetting(CATEGORY, storageKey(auth.userId));
  if (!stored) return NextResponse.json({ columns: null });

  try {
    const parsed = sanitize(JSON.parse(stored));
    return NextResponse.json({ columns: parsed });
  } catch {
    // A malformed row is reported as "never saved" — the browser then renders its
    // own default order rather than a broken one.
    return NextResponse.json({ columns: null });
  }
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

  const columns = sanitize((body as { columns?: unknown }).columns);
  if (!columns) {
    return NextResponse.json({ error: 'No known column keys were supplied.' }, { status: 400 });
  }

  try {
    await upsertSettings(CATEGORY, { [storageKey(auth.userId)]: JSON.stringify(columns) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The column order could not be saved.';
    return NextResponse.json({ error: message }, { status: 502 });
  }

  return NextResponse.json({ columns });
}
