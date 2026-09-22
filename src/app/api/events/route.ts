/**
 * First-party traffic events — the only way the browser touches this table.
 *
 * ## Why the browser stopped talking to Supabase
 *
 * `services/siteEvents.ts` used to POST straight to
 * `<project>.supabase.co/rest/v1/site_events` with the anon key. That had two
 * costs the storefront paid on every page: it put the Supabase project URL and
 * key in the client bundle, and it pulled Supabase code (the config resolver) onto
 * the product detail page, because that page's campaign path reaches
 * `lib/marketing`, which imports the recorder. The storefront does not otherwise
 * need Supabase at all, so the credential and the code both moved here.
 *
 * ## Two callers
 *
 *   POST  public and fire-and-forget: a visitor records an event. This used to be
 *         done with a *public* key against an INSERT-only RLS policy; it is now
 *         rate-limited and field-allowlisted, which is strictly tighter than the
 *         public key allowed.
 *   GET   admin only, through the same `verifyAdminRequest` the admin routes use.
 *
 * ## The revenue columns
 *
 * Migration 043 creates `value` and `currency`, and may not have been applied to
 * a given database. The write therefore tries with them and retries without on a
 * missing-column error, caching the answer — the same "analytics never stops
 * because a migration is pending" behaviour the browser-side probe had. The read
 * needs no such dance: `select('*')` returns whatever columns exist, and the
 * dashboard already renders an absent `value` as unavailable.
 *
 * The row shapes are declared here rather than pulled from
 * `lib/supabase/database.types.ts` — `site_events` is not in that file (the
 * browser used to write it through PostgREST by hand), and every call site in
 * this app already casts around those types because the generated shape lacks the
 * `Views`/`Functions` sections this supabase-js version infers from. Regenerating
 * that file is its own job; this route should not hand-extend it.
 */

import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/stripe/server/supabaseAdmin';
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import { checkRateLimit } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

/** Per-field caps, so a public endpoint cannot be used to store bulk text. */
const MAX = { event: 64, path: 2048, referrer: 2048, id: 64, device: 16, utm: 256 };

interface SiteEventInsert {
  event: string;
  path: string;
  referrer: string | null;
  visitor_id: string | null;
  session_id: string | null;
  device: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  item_ids: string[] | null;
  value?: number | null;
  currency?: string | null;
}

interface SiteEventRow extends Omit<SiteEventInsert, 'value' | 'currency'> {
  id: string;
  value: number | null;
  currency: string | null;
  occurred_at: string;
}

/** Null when migration 043's revenue columns have not been applied yet. */
let supportsRevenue: boolean | null = null;

function isMissingColumn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === 'PGRST204' || error.code === '42703') return true;
  return /column .* does not exist|schema cache|could not find the .* column/i.test(error.message ?? '');
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function numberOrNull(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const rate = checkRateLimit(`events:${ip}`, { limit: 120, windowMs: 60_000 });
  if (!rate.allowed) {
    // Analytics is best-effort; a throttled visitor must not see an error.
    return NextResponse.json({ ok: true, recorded: false });
  }

  let payload: Record<string, unknown>;
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== 'object') return NextResponse.json({ ok: false }, { status: 400 });
    payload = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const event = text(payload.event, MAX.event);
  const path = text(payload.path, MAX.path);
  if (!event || !path) {
    return NextResponse.json({ ok: false, error: 'event and path are required.' }, { status: 400 });
  }

  const row: SiteEventInsert = {
    event,
    path,
    referrer: text(payload.referrer, MAX.referrer),
    visitor_id: text(payload.visitor_id, MAX.id),
    session_id: text(payload.session_id, MAX.id),
    device: text(payload.device, MAX.device),
    utm_source: text(payload.utm_source, MAX.utm),
    utm_medium: text(payload.utm_medium, MAX.utm),
    utm_campaign: text(payload.utm_campaign, MAX.utm),
    item_ids: Array.isArray(payload.item_ids) ? payload.item_ids.slice(0, 20).map(String) : null,
  };

  const value = numberOrNull(payload.value);
  const currency = text(payload.currency, 8);
  const sendsRevenue = value !== null || currency !== null;
  if (sendsRevenue && supportsRevenue !== false) {
    row.value = value;
    row.currency = currency;
  }

  let client;
  try {
    client = getSupabaseAdmin();
  } catch {
    // No service key on this deployment. The caller is fire-and-forget by design,
    // so this is a quiet no-op rather than a 500 it would never look at.
    return NextResponse.json({ ok: true, recorded: false });
  }

  const { error } = await client.from('site_events').insert(row as never);

  if (!error) {
    if (sendsRevenue) supportsRevenue = true;
    return NextResponse.json({ ok: true, recorded: true });
  }

  // Only the revenue columns can be the missing ones; retry the base insert so a
  // pending migration costs the event's revenue, not the event.
  if (isMissingColumn(error) && 'value' in row) {
    supportsRevenue = false;
    delete row.value;
    delete row.currency;
    const retry = await client.from('site_events').insert(row as never);
    return NextResponse.json({ ok: true, recorded: !retry.error });
  }

  console.warn('Site event insert failed:', error);
  return NextResponse.json({ ok: true, recorded: false });
}

export async function GET(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const days = Number(new URL(request.url).searchParams.get('days') ?? '30') || 30;
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  let client;
  try {
    client = getSupabaseAdmin();
  } catch {
    return NextResponse.json({ error: 'Traffic analytics is not configured on this deployment.' }, { status: 503 });
  }

  const { data, error } = await client
    .from('site_events')
    .select('*')
    // Newest-first so the cap keeps the most recent events — ascending would keep
    // the OLDEST once a window exceeds it, which reads as a stale dashboard.
    .gte('occurred_at', since)
    .order('occurred_at', { ascending: false })
    .limit(50_000);

  if (error) {
    console.error('Traffic event read failed:', error);
    return NextResponse.json({ error: 'Could not load traffic events.' }, { status: 502 });
  }

  const events = (data ?? []) as unknown as SiteEventRow[];
  return NextResponse.json({
    events: events.map((row) => ({
      ...row,
      value: row.value ?? null,
      currency: row.currency ?? null,
    })),
  });
}
