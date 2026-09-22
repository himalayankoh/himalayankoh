/**
 * LEGACY — pre-migration orders, read-only.
 *
 * ## Why this file exists at all
 *
 * Orders placed through this app before the WooCommerce migration live in the
 * Supabase `orders`/`order_items` tables, and only there. The migration made
 * WooCommerce the source of truth for **new** orders, but an existing customer must
 * still be able to open an old order from their order-history email, and the owner
 * must still be able to see orders the store never held. Deleting this path without
 * importing the data would lose both.
 *
 * ## The rules this path obeys
 *
 *   - **Read only.** There is no insert, update or delete in this module. No new
 *     order, payment or shipping state is ever written here — new orders go to
 *     WooCommerce, and nothing else writes an order at all.
 *   - **Narrowly reached.** It is consulted only when WooCommerce has no order for
 *     the given id/number. A live order never falls through to it.
 *   - **Identity-bridged, never id-matched blindly.** The legacy rows were keyed by
 *     a Supabase user id, which no session produces any more. A signed-in shopper is
 *     matched to their legacy orders by **billing email**; a guest only ever sees a
 *     legacy order with no owner (`user_id IS NULL`). This is the same rule the
 *     storefront already used for guest orders.
 *
 * ## Removal condition
 *
 * This module is deleted, and the two tables with it, once the historical-order
 * import has run and been verified: every paid Supabase order has a matching
 * WooCommerce order (keyed on `_hk_legacy_id`), the legacy admin endpoint receives
 * no requests for 14 consecutive days, and a reconciliation count matches. The
 * start/end/rollback conditions are written out in
 * `docs/ORDERS-WOOCOMMERCE-MIGRATION.md` §4. Until then this is the honest
 * compatibility path, not the architecture.
 *
 * Server-only.
 */

import { getSupabaseAdmin } from '@/lib/stripe/server/supabaseAdmin';
import { isSupabaseConfigured } from '@/lib/supabase/client';
import type { Order, OrderItem, OrderWithItems } from '@/lib/supabase/database.types';

const COLUMNS = `*, order_items(*)`;

/**
 * The legacy ids are UUIDs. Anything else is answered "no such order" without a
 * query, because Postgres rejects a non-UUID id with a cast error rather than an
 * empty result — and a shopper's typo would then read as a database outage.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Whether the legacy store is even configured here — false on a WordPress-only deploy. */
export function isLegacyOrderStoreAvailable(): boolean {
  return isSupabaseConfigured();
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
  viewerEmail: string | null
): Promise<OrderWithItems | null> {
  if (!isLegacyOrderStoreAvailable()) return null;
  if (!UUID_RE.test(orderId)) return null;
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from('orders').select(COLUMNS).eq('id', orderId).maybeSingle();
  if (error) throw error;
  const order = data as (Order & { order_items: OrderItem[] }) | null;
  if (!order) return null;
  return ownedByViewer(order, viewerEmail) ? (order as OrderWithItems) : null;
}

/**
 * One legacy order by its human order number, when this viewer may see it.
 *
 * The tracker looks orders up by number, and the number is not the id — so this is
 * a separate read rather than a filter on the one above.
 */
export async function getLegacyOrderByNumberForViewer(
  orderNumber: string,
  viewerEmail: string | null
): Promise<OrderWithItems | null> {
  if (!isLegacyOrderStoreAvailable()) return null;
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('orders')
    .select(COLUMNS)
    .eq('order_number', orderNumber)
    .maybeSingle();
  if (error) throw error;
  const order = data as (Order & { order_items: OrderItem[] }) | null;
  if (!order) return null;
  return ownedByViewer(order, viewerEmail) ? (order as OrderWithItems) : null;
}
