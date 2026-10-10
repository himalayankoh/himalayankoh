/**
 * First-party storefront events — the one way the browser records traffic.
 *
 * ## Two backends ago
 *
 * The event recorder sends same-origin requests here. Events belong to WordPress,
 * in the `hk_site_events` table behind `hk-storefront/v1/events`; this route is the
 * only persistence caller, so the browser sees no integration credential.
 *
 * ## A public write with no session
 *
 * This is the storefront's only unauthenticated write, so it is deliberately narrow:
 * rate-limited per IP, and every field is allowlisted and capped before it reaches
 * WordPress. That is stricter than the public anon key it replaces, which could
 * insert any column of the table.
 *
 * ## Never an error the visitor can see
 *
 * Analytics is best-effort: a throttled request, an unreachable WordPress and a
 * rejected row all answer `{ ok: true, recorded: false }` with HTTP 200, because the
 * caller is a fire-and-forget beacon whose failure mode must not be a console full of
 * red or a page that waits. `recorded` is the honest half of that answer.
 */

import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import { siteEventsApi } from '@/lib/wordpress/siteContent';

export const dynamic = 'force-dynamic';

/** Per-field caps, so a public endpoint cannot be used to store bulk text. */
const MAX = { event: 64, path: 2048, referrer: 2048, id: 64, device: 16, utm: 256 };

/**
 * The most rows one read returns. Above this the dashboard's window is partial, and
 * saying so is better than charting a truncated series as if it were complete.
 */
const READ_LIMIT = 5000;

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

  try {
    await siteEventsApi.record({
      event,
      path,
      referrer: text(payload.referrer, MAX.referrer),
      visitor_id: text(payload.visitor_id, MAX.id),
      session_id: text(payload.session_id, MAX.id),
      device: text(payload.device, MAX.device),
      utm_source: text(payload.utm_source, MAX.utm),
      utm_medium: text(payload.utm_medium, MAX.utm),
      utm_campaign: text(payload.utm_campaign, MAX.utm),
      item_ids: Array.isArray(payload.item_ids) ? payload.item_ids.slice(0, 20).map(String) : [],
      value: numberOrNull(payload.value),
      currency: text(payload.currency, 8),
    });
    return NextResponse.json({ ok: true, recorded: true });
  } catch (error) {
    // Unconfigured WordPress, an unreachable origin or a rejected row: reported as
    // "not recorded" rather than thrown at a beacon that has nobody to tell.
    console.warn('Site event could not be recorded:', error);
    return NextResponse.json({ ok: true, recorded: false });
  }
}

/**
 * The admin traffic dashboard's window.
 *
 * Raw rows rather than the grouped summary, because the dashboard charts per-day and
 * per-device series that a (path, event) count cannot answer. Admin-only, and it asks
 * for a bounded window so a busy month cannot turn one request into the whole table.
 */
export async function GET(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const days = Number(new URL(request.url).searchParams.get('days') ?? '30');
  if (!Number.isInteger(days) || days < 1 || days > 90) {
    return NextResponse.json({ error: 'days must be between 1 and 90.' }, { status: 400 });
  }
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 19).replace('T', ' ');

  try {
    const events = await siteEventsApi.list({ since, limit: READ_LIMIT });
    return NextResponse.json({
      events,
      // Newest-first, so hitting the cap keeps the most recent events; the flag is
      // what stops the dashboard from drawing a partial window as a complete one.
      truncated: events.length >= READ_LIMIT,
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('Traffic event read failed:', error);
    return NextResponse.json({ error: 'Could not load traffic events.' }, { status: 502 });
  }
}
