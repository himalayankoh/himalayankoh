// ============================================================================
// SITE EVENTS — first-party traffic analytics
//
// The storefront records lightweight events (page_view, view_item, add_to_cart,
// begin_checkout, purchase, search, ...) so the Admin "Traffic Overview" can show
// real visitor numbers and charts. This is independent of Google: GA4 still
// receives the same events via gtag, but our dashboard reads from this table.
//
// Event persistence belongs to WordPress. This browser module sends a same-origin
// POST to `/api/events`; the server route owns the WordPress credential and table.
// Recording is fire-and-forget and must NEVER break the storefront.
// ============================================================================

import { getFreshAccessToken } from './wordpressAdminAuth';

const VID_KEY = 'luxedge_vid';
const SID_KEY = 'luxedge_sid';

const EVENTS_PATH = '/api/events';

function makeId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    /* fall through to Math.random */
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function ids(): { visitor: string; session: string } {
  let visitor = '';
  let session = '';
  try {
    visitor = localStorage.getItem(VID_KEY) || '';
    if (!visitor) {
      visitor = makeId();
      localStorage.setItem(VID_KEY, visitor);
    }
    session = sessionStorage.getItem(SID_KEY) || '';
    if (!session) {
      session = makeId();
      sessionStorage.setItem(SID_KEY, session);
    }
  } catch {
    visitor = visitor || makeId();
    session = session || makeId();
  }
  return { visitor, session };
}

function detectDevice(ua: string): string {
  if (/(iPad|Tablet)/i.test(ua)) return 'tablet';
  if (/(Mobi|Android|iPhone|iPod)/i.test(ua)) return 'mobile';
  return 'desktop';
}

export interface TrackParams {
  [key: string]: unknown;
}

/**
 * Record an event for first-party analytics. Fire-and-forget: swallows every
 * error (network, storage, an unconfigured server) so analytics can never break
 * the storefront. Admin paths and the admin panel itself are never recorded.
 */
export function recordSiteEvent(name: string, params: TrackParams = {}): void {
  try {
    if (typeof window === 'undefined') return;

    const path = window.location.pathname + window.location.search;
    if (path.startsWith('/admin')) return; // keep public traffic honest

    const { visitor, session } = ids();

    let referrer = '';
    try {
      const raw = document.referrer || '';
      referrer = raw.startsWith(window.location.origin) ? '' : raw;
    } catch {
      /* ignore */
    }

    const items = params.items;
    let item_ids: string[] | null = null;
    if (Array.isArray(items)) {
      item_ids = items
        .map((i) => String((i as { item_id?: unknown; id?: unknown })?.item_id ?? (i as { id?: unknown })?.id ?? ''))
        .filter(Boolean)
        .slice(0, 20);
    }
    if (item_ids && item_ids.length === 0) item_ids = null;

    const body: Record<string, unknown> = {
      event: name,
      path,
      referrer: referrer || null,
      visitor_id: visitor,
      session_id: session,
      device: detectDevice(navigator.userAgent),
      utm_source: params.campaign_source ? String(params.campaign_source) : null,
      utm_medium: params.campaign_medium ? String(params.campaign_medium) : null,
      utm_campaign: params.campaign_name ? String(params.campaign_name) : null,
      item_ids: item_ids || null,
    };

    // Revenue fields (migration 0024). Whether those columns exist is the route's
    // question to answer — it holds the schema probe this module used to keep,
    // because the answer is the same for every visitor rather than per browser.
    const value =
      typeof params.value === 'number' && Number.isFinite(params.value)
        ? params.value
        : typeof params.value === 'string' && params.value.trim() !== ''
          ? Number(params.value)
          : NaN;
    if (!Number.isNaN(value)) body.value = value;
    if (typeof params.currency === 'string' && params.currency.trim()) body.currency = params.currency.trim();

    void fetch(EVENTS_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      // Nothing waits on this, and `keepalive` lets an event outlive the
      // navigation that triggered it — a plain fetch can lose the last
      // page_view of a session to the unload, which is the one worth having.
      keepalive: true,
    }).catch(() => {
      /* ignore — best-effort analytics */
    });
  } catch {
    /* never throw, never break the storefront */
  }
}

export interface SiteEventRow {
  event: string;
  path: string;
  referrer: string | null;
  visitor_id: string | null;
  session_id: string | null;
  device: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  item_ids: unknown | null;
  value: number | null;
  currency: string | null;
  occurred_at: string;
}

/**
 * Fetch the last `days` of events as a signed-in admin. Throws on auth failure
 * or an unreadable response (e.g. the table is not migrated yet).
 */
export async function fetchSiteEvents(days = 30): Promise<SiteEventRow[]> {
  const token = await getFreshAccessToken();
  if (!token) throw new Error('Sign in as admin to view traffic analytics.');

  const response = await fetch(`${EVENTS_PATH}?days=${encodeURIComponent(String(days))}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (response.status === 401 || response.status === 403) {
    throw new Error('Sign in as admin to view traffic analytics.');
  }
  if (response.status === 503) {
    throw new Error('Traffic analytics is not configured on this deployment.');
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || `Could not load analytics (HTTP ${response.status}).`);
  }

  const body = (await response.json()) as { events?: SiteEventRow[] };
  return (body.events ?? []).map((row) => ({
    ...row,
    value: row.value ?? null,
    currency: row.currency ?? null,
  }));
}
