/**
 * The app's own order records, read-only.
 *
 * Before the migration this *was* the order list. WooCommerce is now where orders
 * live, but orders placed through this app's checkout before that are still worth
 * reading — and an owner who could not see them would think they had been lost. So
 * they are served from the static archive the export wrote (see
 * `lib/orders/legacyOrders.ts`), clearly labelled as legacy, and never written: this
 * route has no POST, and the status update route writes the store.
 *
 * It exists as its own endpoint rather than being merged into `/api/admin/orders`
 * because the two sources count and page differently. A single list that merged
 * them would have to invent a page size across both, and the count under it would
 * be true of neither — which is the confusion this separation avoids.
 */

import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import {
  isLegacyOrderStoreAvailable,
  listLegacyOrders,
} from '@/lib/orders/legacyOrders';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  if (!isLegacyOrderStoreAvailable()) {
    return NextResponse.json({
      orders: [],
      count: 0,
      totalPages: 1,
      available: false,
      reason:
        'No legacy order archive is installed on this deployment, and nothing is read from the old database at runtime.',
    });
  }

  const params = new URL(request.url).searchParams;

  try {
    const page = await listLegacyOrders({
      search: params.get('search') || undefined,
      status: params.get('status') || undefined,
      page: Number(params.get('page') ?? '1') || 1,
      limit: Number(params.get('limit') ?? '') || 25,
    });

    return NextResponse.json({
      orders: page.orders.map((order) => ({
        id: order.id,
        order_number: order.order_number,
        email: order.email,
        status: order.status,
        payment_status: order.payment_status,
        total: order.total,
        created_at: order.created_at,
        source: 'legacy' as const,
      })),
      count: page.count,
      totalPages: page.totalPages || 1,
      available: true,
      reason: null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The app’s order records could not be read.';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
