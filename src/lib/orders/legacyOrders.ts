/**
 * LEGACY — pre-migration orders, read-only, served from a static archive.
 *
 * ## Why this file exists at all
 *
 * Orders placed through this app before the WooCommerce migration live in the
 * Supabase `orders`/`order_items` tables. WooCommerce is now the source of truth for
 * new orders, but an existing customer must still be able to open an old order, and
 * the owner must still be able to see orders the store never held. Deleting this
 * path without importing the data would lose both.
 *
 * ## Where the data comes from now
 *
 * `npm run migrate:orders -- --export-archive` writes the 14 historical orders (and
 * their 23 line items) to `supabase-backup/legacy-orders.archive.json`, and this
 * module reads that file. It used to open a live Supabase client on every request —
 * which meant the application shipped, and depended on, a database it was migrating
 * away from, to show fourteen rows it could just as easily take with it.
 *
 * The archive is untracked on purpose: it holds customers' own order details and
 * their addresses, and git history is the wrong place for them. Point
 * `HK_LEGACY_ORDERS_ARCHIVE` at it if it lives somewhere else on the server.
 *
 * If the archive is not there, the legacy path answers "nothing here" — the same
 * honest answer as a deployment that never had these orders. That is a degradation,
 * never an outage, and never a reason to reconnect the database.
 *
 * ## The rules this path obeys
 *
 *   - **Read only.** There is no write of any kind in this module.
 *   - **No network.** A file read, nothing more.
 *   - **Identity-bridged, never id-matched blindly.** The archive rows carry the
 *     app's old user id, which no session produces any more. A signed-in shopper is
 *     matched by **billing email**; a guest only ever sees an order with no owner.
 *
 * ## Removal condition
 *
 * Delete this module, and the archive with it, once the historical-order import has
 * run and been verified (every paid order has a matching WooCommerce order keyed on
 * `_hk_legacy_supabase_order_id`, the legacy endpoint sees no requests for 14 days,
 * and a reconciliation count matches). Conditions are written out in
 * `docs/ORDERS-WOOCOMMERCE-MIGRATION.md` §4.
 *
 * Server-only.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Order, OrderItem, OrderWithItems } from '@/lib/commerce/databaseTypes';

/** A legacy order row plus its line items, exactly as the export wrote it. */
type ArchivedOrder = Omit<OrderWithItems, 'order_items'> & {
  order_items?: OrderItem[];
};

interface Archive {
  exportedAt?: string;
  orders?: ArchivedOrder[];
}

let cache: ArchivedOrder[] | null | undefined;

function archivePath(): string {
  return process.env.HK_LEGACY_ORDERS_ARCHIVE || join(process.cwd(), 'supabase-backup', 'legacy-orders.archive.json');
}

/** Loads the archive once; `null` means "this deployment has no legacy orders". */
function loadArchive(): ArchivedOrder[] | null {
  if (cache !== undefined) return cache;
  try {
    const parsed = JSON.parse(readFileSync(archivePath(), 'utf8')) as Archive;
    cache = Array.isArray(parsed.orders) ? parsed.orders : null;
  } catch {
    cache = null;
  }
  return cache;
}

/** Whether this deployment has a legacy archive to serve at all. */
export function isLegacyOrderStoreAvailable(): boolean {
  return loadArchive() !== null;
}

/** Test-only hook: forget the loaded archive. */
export function __resetLegacyArchiveForTests(): void {
  cache = undefined;
}

function withItems(order: ArchivedOrder): OrderWithItems {
  return { ...order, order_items: order.order_items ?? [] } as OrderWithItems;
}

function ownedByViewer(order: Pick<Order, 'user_id' | 'email'>, viewerEmail: string | null): boolean {
  if (viewerEmail) {
    return String(order.email ?? '').trim().toLowerCase() === viewerEmail.trim().toLowerCase();
  }
  // A caller with no verified session is a guest: only an ownerless legacy order,
  // never one that belongs to a registered account.
  return !order.user_id;
}

/**
 * One legacy order by id, when this viewer is allowed to see it.
 *
 * Returns null for a missing order **and** for one that belongs to somebody else —
 * the same answer, so ids cannot be probed across accounts.
 */
export async function getLegacyOrderForViewer(
  orderId: string,
  viewerEmail: string | null,
): Promise<OrderWithItems | null> {
  const orders = loadArchive();
  if (!orders) return null;
  const order = orders.find((o) => String(o.id) === orderId);
  if (!order) return null;
  return ownedByViewer(order, viewerEmail) ? withItems(order) : null;
}

/**
 * One legacy order by its human order number, when this viewer may see it.
 *
 * The tracker looks orders up by number, and the number is not the id — so this is
 * a separate read rather than a filter on the one above.
 */
export async function getLegacyOrderByNumberForViewer(
  orderNumber: string,
  viewerEmail: string | null,
): Promise<OrderWithItems | null> {
  const orders = loadArchive();
  if (!orders) return null;
  const order = orders.find((o) => String(o.order_number) === String(orderNumber));
  if (!order) return null;
  return ownedByViewer(order, viewerEmail) ? withItems(order) : null;
}

export interface LegacyOrderListQuery {
  search?: string;
  status?: string;
  page?: number;
  limit?: number;
}

export interface LegacyOrderListPage {
  orders: ArchivedOrder[];
  count: number;
  totalPages: number;
}

/** The owner's read: every archived order, filtered and paged in memory. */
export async function listLegacyOrders(query: LegacyOrderListQuery = {}): Promise<LegacyOrderListPage> {
  const all = loadArchive() ?? [];
  const search = (query.search || '').trim().toLowerCase();
  const status = (query.status || '').trim();

  const filtered = all
    .filter((o) => (status ? String(o.status) === status : true))
    .filter((o) =>
      search
        ? String(o.order_number || '').toLowerCase().includes(search) ||
          String(o.email || '').toLowerCase().includes(search)
        : true,
    )
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));

  const limit = query.limit && query.limit > 0 ? query.limit : 25;
  const page = query.page && query.page > 0 ? query.page : 1;
  const start = (page - 1) * limit;

  return {
    orders: filtered.slice(start, start + limit),
    count: filtered.length,
    totalPages: Math.max(1, Math.ceil(filtered.length / limit)),
  };
}
