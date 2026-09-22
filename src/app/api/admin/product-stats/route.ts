/**
 * First-party view/interest counts per product, for the catalog console.
 *
 * The events are WordPress's now (the `hk_site_events` table behind
 * `hk-storefront/v1/events`), so the read goes through `siteEventsApi` instead of
 * Supabase. The counting itself is unchanged, including which events mean what:
 * `view_item` is a view, `add_to_cart` is interest, `wishlist_save` is a save.
 *
 * The row cap is real, so it is reported: `truncated: true` means the window held
 * more events than one read returns, and the figures below are then a floor rather
 * than a total. Silently charting a partial window as a complete one is how an
 * analytics panel loses its reader's trust.
 */

import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import { siteEventsApi } from '@/lib/wordpress/siteContent';

export const dynamic = 'force-dynamic';

const TRACKED_EVENTS = ['view_item', 'add_to_cart', 'wishlist_save'];
const READ_LIMIT = 5000;
const WINDOW_DAYS = 90;

export async function GET(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000)
      .toISOString()
      .slice(0, 19)
      .replace('T', ' ');

    const events = await siteEventsApi.list({ since, events: TRACKED_EVENTS, limit: READ_LIMIT });

    const since30 = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const since7 = new Date(Date.now() - 7 * 86_400_000).toISOString();

    const stats: Record<string, { views: number; views7d: number; views30d: number; interest: number; saved: number }> = {};

    const recordStat = (idOrSlug: string, ev: string, occurredAt: string) => {
      if (!idOrSlug) return;
      const key = idOrSlug.trim();
      if (!stats[key]) {
        stats[key] = { views: 0, views7d: 0, views30d: 0, interest: 0, saved: 0 };
      }
      const item = stats[key];
      const is7d = occurredAt >= since7;
      const is30d = occurredAt >= since30;

      if (ev === 'view_item') {
        item.views++;
        if (is7d) item.views7d++;
        if (is30d) item.views30d++;
      } else if (ev === 'add_to_cart') {
        item.interest++;
      } else if (ev === 'wishlist_save') {
        item.saved++;
      }
    };

    for (const row of events) {
      // The plugin stores `occurred_at` as UTC MySQL time; comparing it against a
      // string timerange only works if both sides are the same format, so the ISO
      // form is normalised here rather than assumed.
      const occurred = (row.occurred_at || '').replace(' ', 'T');
      for (const itemId of Array.isArray(row.item_ids) ? row.item_ids : []) {
        recordStat(String(itemId), row.event, occurred);
      }
      if (row.path) {
        const match = row.path.match(/\/product\/([^/?#]+)/);
        if (match) recordStat(decodeURIComponent(match[1]), row.event, occurred);
      }
    }

    return NextResponse.json({ stats, truncated: events.length >= READ_LIMIT });
  } catch (err) {
    return NextResponse.json({
      stats: {},
      unavailable: err instanceof Error ? err.message : 'Analytics service unavailable',
    });
  }
}
