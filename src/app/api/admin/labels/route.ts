/**
 * The shipping-label worklist: paid orders, split by whether a label exists yet.
 *
 * This used to be a Supabase read of the app's own `orders` table joined to
 * `profiles`, which meant an order paid through WooCommerce could be missing from the
 * bench that prints its label. It reads WooCommerce now, and the two halves of the
 * split are the same two questions the bench asks:
 *
 *   ready   — a label has been bought (the order carries `_hk_label_url`)
 *   pending — paid and not cancelled, but no label yet
 *
 * The carrier and tracking come from the order meta the label step writes, so a
 * label bought in this console is visible here immediately rather than after a sync.
 */

import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import { listWooOrders, orderWithItemsFromWoo, WooOrderError, type Order } from '@/lib/woo/orders';

export const dynamic = 'force-dynamic';

/** One page of WooCommerce's own ceiling. More than this is a second page, not a wider read. */
const READ_LIMIT = 100;

/** An order as the label bench renders it. `profile` stays null: the email is the identity. */
type LabelOrder = Order & { profile: null };

function toLabelOrder(order: Order): LabelOrder {
  return { ...order, profile: null };
}

export async function GET(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const { orders, total } = await listWooOrders({ perPage: READ_LIMIT });

    const labelable = orders
      .map((order) => orderWithItemsFromWoo(order))
      .map(toLabelOrder)
      // Paid and not cancelled: an order that has neither paid nor been cancelled is
      // somebody else's problem (the payment step), and shipping it would be wrong.
      .filter((order) => order.payment_status === 'paid' && order.status !== 'cancelled');

    return NextResponse.json({
      ready: labelable.filter((order) => Boolean(order.label_url)),
      pending: labelable.filter((order) => !order.label_url),
      // The store's count for the read, so the screen can say when it is showing one
      // page of a longer list instead of implying the list is everything.
      scanned: orders.length,
      total,
    });
  } catch (error) {
    if (error instanceof WooOrderError) {
      return NextResponse.json({ error: error.message }, { status: error.status || 502 });
    }
    console.error('Shipping label worklist read failed:', error);
    return NextResponse.json({ error: 'Could not load the label worklist.' }, { status: 502 });
  }
}
