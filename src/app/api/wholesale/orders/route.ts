/**
 * A buyer's own wholesale orders.
 *
 * These are **not** WooCommerce retail orders. A wholesale order is an agreement to
 * ship pallets against an accepted quotation, with proforma/deposit terms — merging
 * it into the retail order book would put a 40ft container in the same list as a jar
 * and give the storefront's stock reservation and email side effects a claim on it.
 * The two order books are separate on purpose, and this route reads only the
 * wholesale one.
 *
 * Scoped to the session's account id, so one buyer cannot enumerate another's
 * shipments by guessing a reference.
 */

import { NextResponse } from 'next/server';
import { requireActiveBuyer } from '@/lib/wholesale/requireBuyer';
import { buyerOrderView } from '@/lib/wholesale/buyerView';
import { listWholesaleRecords } from '@/lib/wholesale/store';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const gate = await requireActiveBuyer(request);
  if (!gate.ok) return gate.response;

  try {
    const rows = await listWholesaleRecords('orders', { account_id: gate.buyer.accountId, limit: 200 });
    const orders = rows.map((row) => buyerOrderView(row));
    return NextResponse.json({ orders, count: orders.length });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? `Your wholesale orders could not be read: ${error.message}`
            : 'Your wholesale orders could not be read.',
      },
      { status: 502 }
    );
  }
}
