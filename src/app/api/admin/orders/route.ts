/**
 * The console's order read.
 *
 * Order records live in WooCommerce, so this route is an authenticated door onto
 * `lib/woo/orders` — the WooCommerce consumer key stays on the server, and the
 * browser receives the same `Order` shape the order screens have always rendered.
 * It replaced a Supabase read of the app's own order table, which meant the
 * console and the store could disagree about which orders existed.
 *
 * The store's own counts travel with the page (`total`, `totalPages`), so the pager
 * states how many orders the store holds rather than how many this page happens to
 * contain. The figures below it are counted from the orders actually read and say
 * how wide that read was, because a dashboard that quietly reports a sample as a
 * total is worse than one that reports nothing.
 */

import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import {
  WooOrderError,
  listWooOrders,
  orderWithItemsFromWoo,
  restoreWooOrders,
  statsFromWooOrders,
  trashWooOrders,
  type AppOrderStatus,
} from '@/lib/woo/orders';
import { STATS_WINDOW, pageCoversStatsWindow } from '@/lib/admin/orderStatsWindow';

export const dynamic = 'force-dynamic';

/**
 * How many orders one bulk request may carry.
 *
 * Not a business rule — a budget. Trashing one order costs three upstream
 * subrequests and Cloudflare kills an invocation at 50, so 15 is the largest
 * number that always completes. See the guard in `POST`.
 */
const MAX_BULK_ORDERS = 15;

const APP_STATUSES: AppOrderStatus[] = [
  'pending',
  'confirmed',
  'processing',
  'packed',
  'shipped',
  'delivered',
  'cancelled',
  'refunded',
];

export async function GET(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const params = new URL(request.url).searchParams;
  const statusParam = params.get('status') || '';
  // `trash` is not a fulfilment state — it is a request for the orders the console
  // has moved out of the way. It passes through to WooCommerce as its own status.
  const status: AppOrderStatus | 'trash' | undefined =
    statusParam === 'trash'
      ? 'trash'
      : APP_STATUSES.includes(statusParam as AppOrderStatus)
        ? (statusParam as AppOrderStatus)
        : undefined;

  const search = params.get('search') || undefined;
  const pageNumber = Number(params.get('page') ?? '1') || 1;
  const perPage = Number(params.get('limit') ?? '') || undefined;

  // One WooCommerce read whenever the page already is the stats window; see
  // `pageCoversStatsWindow` for why that is sound and when it is not.
  // The statistics describe the shop's real trade, so a trash read never doubles
  // as the stats window: the KPI row must not be counted from deleted rows.
  const reusesPage =
    status !== 'trash' &&
    pageCoversStatsWindow({
      status,
      search,
      page: pageNumber,
      perPage,
    });

  try {
    // When the page read is *not* the stats window, the two reads describe
    // different order sets but neither depends on the other — so they start
    // together instead of one after the other. Measured on staging: a filtered
    // page (or any page narrower than the window) paid two serial store reads
    // (~5.2s) for one screen; the same pair in parallel is one store read's wait.
    // The rejection guard keeps a failing page read from surfacing as an
    // unhandled rejection on the stats promise.
    const statsPromise = reusesPage ? null : listWooOrders({ perPage: STATS_WINDOW });
    statsPromise?.catch(() => undefined);

    const page = await listWooOrders({ status, search, page: pageNumber, perPage });
    const statsOrders = reusesPage ? page.orders : (await statsPromise!).orders;

    return NextResponse.json({
      orders: page.orders.map(orderWithItemsFromWoo),
      count: page.total,
      totalPages: page.totalPages,
      stats: statsFromWooOrders(statsOrders),
    });
  } catch (error) {
    const status = error instanceof WooOrderError ? error.status : 502;
    const message = error instanceof Error ? error.message : 'The orders could not be read.';
    return NextResponse.json({ error: message }, { status });
  }
}

/**
 * Move orders to the store's trash, or put them back.
 *
 * Deliberately not a delete. These are the store's own order records, and the
 * owner's intent — "get these out of my list" — is served by trashing them, which
 * WooCommerce can undo. A permanent delete is offered nowhere in this console,
 * because nothing here can verify an order was really a test order.
 */
export async function POST(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: { action?: unknown; ids?: unknown };
  try {
    body = (await request.json()) as { action?: unknown; ids?: unknown };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const action = body.action === 'trash' || body.action === 'restore' ? body.action : null;
  if (!action) {
    return NextResponse.json({ error: 'action must be "trash" or "restore".' }, { status: 400 });
  }

  const ids = Array.isArray(body.ids)
    ? body.ids.map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0)
    : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: 'A list of order ids is required.' }, { status: 400 });
  }
  // Bounded to what one invocation can actually finish. Each trashed order costs
  // three upstream calls (read the order, remember its status, move it), and
  // Cloudflare aborts an invocation at 50 subrequests — so a request for more than
  // this would be rejected by the runtime partway through, leaving the caller with a
  // partial change and a "too many subrequests" error. The console sends smaller
  // batches than this anyway; the cap just stops a direct caller walking past it.
  if (ids.length > MAX_BULK_ORDERS) {
    return NextResponse.json(
      { error: `At most ${MAX_BULK_ORDERS} orders can be changed at once.` },
      { status: 400 },
    );
  }

  try {
    const result = action === 'trash' ? await trashWooOrders(ids) : await restoreWooOrders(ids);
    return NextResponse.json({ ok: result.failed.length === 0, action, ...result });
  } catch (error) {
    const status = error instanceof WooOrderError ? error.status : 502;
    const message = error instanceof Error ? error.message : 'The orders could not be changed.';
    return NextResponse.json({ error: message }, { status });
  }
}
