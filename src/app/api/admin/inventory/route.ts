/**
 * Stock, read from WooCommerce's own inventory settings.
 *
 * Separate from the catalog route on purpose: the catalog answers what a shopper
 * can buy, and inventory answers how the store tracks it — quantities, thresholds,
 * backorders. The distinction is what lets this route tell the owner the truth on
 * this store, which is that WooCommerce is not managing stock at all, rather than
 * asking for a credential it already has.
 */

import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import { readInventoryReport } from '@/lib/woo/inventory';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const report = await readInventoryReport();
    return NextResponse.json(report);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The inventory could not be read.';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
