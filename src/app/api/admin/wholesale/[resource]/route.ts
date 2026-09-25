/**
 * Wholesale records, for the console — one route, an allowlist, and the session for
 * an actor.
 *
 * ## Why one route with a `resource` parameter
 *
 * The plugin keeps thirteen record types behind one allowlisted endpoint whose
 * allowlist is the thing that decides what may be written. Thirteen Next.js routes
 * would be thirteen places to forget an `Id<...>`, so the resource is a parameter
 * here too — and the *first* thing this handler does is check it against
 * `WHOLESALE_RESOURCES`, the same union the typed store client accepts. A name that
 * is not on that list never reaches WordPress.
 *
 * ## The actor is the session's
 *
 * Every write carries `actor` from the verified admin session, so the audit trail
 * says who changed a supplier's cost. A body-supplied actor is ignored.
 *
 * ## Status vocabulary is checked at the edge
 *
 * `quotes.status` and `orders.status` are lifecycle words the plugin stores as text;
 * a typo there would put a quote in a state no screen recognises. The known
 * vocabularies are enforced here so the failure is a named 400 rather than a row
 * nobody can find.
 */

import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import { wholesaleDisabled } from '@/lib/wholesale/gate';
import { deleteWholesaleRecord, isWholesaleResource, listWholesaleRecords, upsertWholesaleRecord } from '@/lib/wholesale/store';
import { recordQuoteRevision } from '@/lib/wholesale/revisionLog';

export const dynamic = 'force-dynamic';

const QUOTE_STATUSES = new Set([
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'QUOTED',
  'ACCEPTED',
  'REJECTED',
  'EXPIRED',
  'CONVERTED_TO_ORDER',
]);

const ORDER_STATUSES = new Set([
  'DRAFT',
  'AWAITING_DEPOSIT',
  'CONFIRMED',
  'IN_PRODUCTION',
  'READY_TO_SHIP',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
]);

const ACCOUNT_STATUSES = new Set(['ACTIVE', 'SUSPENDED']);

/** Filters the console may narrow a list by. Anything else is ignored, not trusted. */
const PASS_THROUGH_FILTERS = [
  'email',
  'status',
  'code',
  'side',
  'account_id',
  'product_id',
  'woo_product_id',
  'origin_id',
  'supplier_id',
  'active',
  'limit',
  'order',
] as const;

function statusProblem(resource: string, data: Record<string, unknown>): string | null {
  if (typeof data.status !== 'string') return null;
  const status = data.status.toUpperCase();
  if (resource === 'quotes' && !QUOTE_STATUSES.has(status)) {
    return `"${data.status}" is not a quotation status.`;
  }
  if (resource === 'orders' && !ORDER_STATUSES.has(status)) {
    return `"${data.status}" is not a wholesale order status.`;
  }
  if (resource === 'accounts' && !ACCOUNT_STATUSES.has(status)) {
    return `"${data.status}" is not an account status.`;
  }
  return null;
}

export async function GET(request: Request, context: { params: Promise<{ resource: string }> }) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const disabled = wholesaleDisabled();
  if (disabled) return disabled;

  const { resource } = await context.params;
  if (!isWholesaleResource(resource)) {
    return NextResponse.json({ error: `"${resource}" is not a wholesale record type.` }, { status: 404 });
  }

  const params = new URL(request.url).searchParams;
  const id = params.get('id');

  try {
    if (id) {
      const rows = await listWholesaleRecords(resource, { id: Number(id), limit: 1 });
      if (!rows.length) return NextResponse.json({ error: 'No such record.' }, { status: 404 });
      return NextResponse.json({ record: rows[0] });
    }

    const filters: Record<string, string | number | boolean> = {};
    for (const name of PASS_THROUGH_FILTERS) {
      const value = params.get(name);
      if (value === null || value === '') continue;
      filters[name] = name === 'active' ? value === 'true' || value === '1' : /^\d+$/.test(value) && name !== 'email' ? Number(value) : value;
    }

    const items = await listWholesaleRecords(resource, filters);
    return NextResponse.json({ resource, items, count: items.length });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'The wholesale records could not be read.' },
      { status: 502 }
    );
  }
}

export async function POST(request: Request, context: { params: Promise<{ resource: string }> }) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const disabled = wholesaleDisabled();
  if (disabled) return disabled;

  const { resource } = await context.params;
  if (!isWholesaleResource(resource)) {
    return NextResponse.json({ error: `"${resource}" is not a wholesale record type.` }, { status: 404 });
  }

  let body: { id?: number; data?: Record<string, unknown> };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const data = body.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return NextResponse.json({ error: 'A field set is required.' }, { status: 400 });
  }

  const statusError = statusProblem(resource, data);
  if (statusError) return NextResponse.json({ error: statusError }, { status: 400 });

  // The plugin never writes these from a request; normalise before it has to.
  if (typeof data.status === 'string') data.status = data.status.toUpperCase();

  const actor = auth.admin.name || auth.admin.username || auth.admin.email;
  const quoteId = body.id ? Number(body.id) : 0;
  // A quotation's price is a figure a buyer can be held to. The reason for a change
  // rides along with it (`revisionReason`) — it is not a column, so it is stripped
  // before the write and kept in the audit entry instead.
  const revisionReason = data.revisionReason === undefined ? null : String(data.revisionReason).slice(0, 500);
  delete data.revisionReason;

  // Read before the update: the revision's "before" figures have to be the ones that
  // were there, and a read after the write would already show the new price.
  let storedQuote: Record<string, unknown> | null = null;
  if (resource === 'quotes' && quoteId) {
    try {
      const rows = await listWholesaleRecords('quotes', { id: quoteId, limit: 1 });
      storedQuote = (rows[0] as Record<string, unknown> | undefined) ?? null;
    } catch {
      storedQuote = null;
    }
  }

  try {
    const record = await upsertWholesaleRecord(resource, data, {
      id: quoteId || undefined,
      actor,
    });

    // Written only after the update stands, so the history can never describe a change
    // that did not happen; a history that could not be written is reported instead.
    let revision: Awaited<ReturnType<typeof recordQuoteRevision>> | null = null;
    if (storedQuote) {
      try {
        revision = await recordQuoteRevision({ quoteId, stored: storedQuote, data, actor, reason: revisionReason });
      } catch (error) {
        revision = {
          revision: null,
          changed: [],
          logFailed: true,
          error: error instanceof Error ? error.message : 'The revision could not be recorded.',
        };
      }
    }

    return NextResponse.json({ record, revision }, { status: body.id ? 200 : 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'The record could not be saved.' },
      { status: 502 }
    );
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ resource: string }> }) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const disabled = wholesaleDisabled();
  if (disabled) return disabled;

  const { resource } = await context.params;
  if (!isWholesaleResource(resource)) {
    return NextResponse.json({ error: `"${resource}" is not a wholesale record type.` }, { status: 404 });
  }

  const id = Number(new URL(request.url).searchParams.get('id') ?? 0);
  if (!id) return NextResponse.json({ error: 'A record id is required.' }, { status: 400 });

  try {
    await deleteWholesaleRecord(resource, id);
    return NextResponse.json({ deleted: true, resource, id });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'The record could not be deleted.' },
      { status: 502 }
    );
  }
}
