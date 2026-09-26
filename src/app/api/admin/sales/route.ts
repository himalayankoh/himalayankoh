/**
 * Himalayan Koh Sales — Admin Sales & Profit API Route
 *
 * ## Principles
 * 1. WooCommerce is the authoritative source of truth for retail orders.
 * 2. Unpaid/cancelled orders are NEVER counted as revenue.
 * 3. Refunds are subtracted from gross revenue to yield net revenue.
 * 4. Wholesale orders are queried from the wholesale module when available
 *    and reported with separate booked vs collected metrics.
 * 5. Admin authentication is strictly verified.
 */

import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import { listWooOrders, WooOrderError, type WooOrderLike } from '@/lib/woo/orders';
import { listWholesaleRecords } from '@/lib/wholesale/store';
import { buildSalesDashboard, type WholesaleOrderRecord } from '@/lib/sales/engine';
import type { SalesPeriod, ManualExpense } from '@/lib/sales/types';

export const dynamic = 'force-dynamic';

const VALID_PERIODS: SalesPeriod[] = ['today', '7d', '30d', '90d', '12m', 'ytd', 'all'];
const PAGES = 3;
const PER_PAGE = 100;

export async function GET(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const url = new URL(request.url);
  const periodParam = (url.searchParams.get('period') || '30d') as SalesPeriod;
  const period: SalesPeriod = VALID_PERIODS.includes(periodParam) ? periodParam : '30d';

  try {
    // 1. Fetch WooCommerce orders across up to PAGES requests
    const collectedOrders: WooOrderLike[] = [];
    let totalInStore = 0;

    for (let page = 1; page <= PAGES; page += 1) {
      const response = await listWooOrders({ perPage: PER_PAGE, page });
      totalInStore = response.total;
      collectedOrders.push(...response.orders);
      if (response.orders.length < PER_PAGE || page * PER_PAGE >= response.total) {
        break;
      }
    }

    // 2. Fetch Wholesale orders if available
    const wholesaleOrders: WholesaleOrderRecord[] = [];
    try {
      const [wsOrders, wsAccounts] = await Promise.all([
        listWholesaleRecords('orders').catch(() => []),
        listWholesaleRecords('accounts').catch(() => []),
      ]);

      const accountMap = new Map<string, string>();
      for (const acc of (wsAccounts as Array<{ id?: string | number; companyName?: string; company_name?: string }>)) {
        if (acc.id) {
          accountMap.set(String(acc.id), acc.companyName || acc.company_name || 'Wholesale Partner');
        }
      }

      for (const raw of (wsOrders as Array<Record<string, unknown>>)) {
        const id = String(raw.id || raw.reference || raw.ref || '');
        const ref = String(raw.reference || raw.ref || raw.id || 'WS-ORD');
        const accId = String(raw.accountId || raw.account_id || '');
        const status = String(raw.status || 'CONFIRMED');
        const currency = String(raw.currency || 'USD');
        const totals = raw.totals as Record<string, unknown> | undefined;
        const total = Number(totals?.sellGrandTotal ?? totals?.total ?? raw.total ?? 0);
        const deposit = Number(raw.depositCollected ?? raw.deposit_collected ?? raw.paid_amount ?? 0);
        const balance = Number(raw.balanceCollected ?? raw.balance_collected ?? 0);
        const createdAt = String(raw.createdAt || raw.created_at || new Date().toISOString());

        wholesaleOrders.push({
          id,
          reference: ref,
          companyName: accountMap.get(accId) || 'Wholesale Partner',
          status,
          currency,
          total,
          depositCollected: deposit,
          balanceCollected: balance,
          createdAt,
        });
      }
    } catch {
      // Wholesale records are optional if unconfigured
    }

    // 3. Build comprehensive Sales dashboard
    const dashboardData = buildSalesDashboard({
      orders: collectedOrders,
      period,
      wholesaleOrders,
      ordersScanned: collectedOrders.length,
      windowCapped: totalInStore > collectedOrders.length,
    });

    return NextResponse.json(dashboardData);
  } catch (error) {
    const status = error instanceof WooOrderError ? error.status : 502;
    const message = error instanceof Error ? error.message : 'Unable to compile sales metrics';
    return NextResponse.json({ error: message }, { status });
  }
}
