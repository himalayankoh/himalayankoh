/**
 * One wholesale order, for the buyer who owns it.
 *
 * The id comes from the URL and the *account* comes from the session, and the read
 * is filtered by both (`listWholesaleRecords('orders', { id, account_id })`). A
 * buyer who changes the number in the URL gets "not found" — not a 403, because
 * telling them the order exists but is someone else's would confirm the id space.
 */

import { NextResponse } from 'next/server';
import { requireActiveBuyer } from '@/lib/wholesale/requireBuyer';
import { buyerOrderView } from '@/lib/wholesale/buyerView';
import { listWholesaleRecords } from '@/lib/wholesale/store';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await requireActiveBuyer(request);
  if (!gate.ok) return gate.response;

  const { id } = await context.params;
  const orderId = Math.trunc(Number(id));
  if (!Number.isFinite(orderId) || orderId <= 0) {
    return NextResponse.json({ error: 'No such order.' }, { status: 404 });
  }

  try {
    const rows = await listWholesaleRecords('orders', {
      id: orderId,
      account_id: gate.buyer.accountId,
      limit: 1,
    });
    if (!rows.length) {
      return NextResponse.json({ error: 'No such order.' }, { status: 404 });
    }
    return NextResponse.json({ order: buyerOrderView(rows[0]) });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? `That order could not be read: ${error.message}`
            : 'That order could not be read.',
      },
      { status: 502 }
    );
  }
}
