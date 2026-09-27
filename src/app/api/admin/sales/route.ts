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

import { NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/verifyAdminRequest";
import {
  listWooOrders,
  WooOrderError,
  type WooOrderLike,
} from "@/lib/woo/orders";
import { listWooProducts } from "@/lib/woo/productWrite";
import { listWholesaleRecords } from "@/lib/wholesale/store";
import {
  buildSalesDashboard,
  type WholesaleOrderRecord,
} from "@/lib/sales/engine";
import { listSalesExpenses } from "@/lib/sales/records";
import { computeProfit, profitInputFromRow } from "@/lib/wholesale/profit";
import type { SalesPeriod } from "@/lib/sales/types";

export const dynamic = "force-dynamic";

const VALID_PERIODS: SalesPeriod[] = [
  "today",
  "7d",
  "30d",
  "90d",
  "12m",
  "ytd",
  "all",
];
const PAGES = 3;
const PER_PAGE = 100;

export async function GET(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const url = new URL(request.url);
  const periodParam = (url.searchParams.get("period") || "30d") as SalesPeriod;
  const period: SalesPeriod = VALID_PERIODS.includes(periodParam)
    ? periodParam
    : "30d";

  try {
    const warnings: string[] = [];
    const catalogRead = listWooProducts({ perPage: 100 })
      .then((products) => ({ products, error: false }))
      .catch(() => ({ products: [], error: true }));
    const expenseRead = listSalesExpenses()
      .then((items) => ({ items, error: false }))
      .catch(() => ({ items: [], error: true }));
    const wholesaleRead = Promise.all([
      listWholesaleRecords("orders"),
      listWholesaleRecords("accounts"),
    ])
      .then((rows) => ({ rows, error: false }))
      .catch(() => ({ rows: [[], []], error: true }));
    // 1. Fetch WooCommerce orders across up to PAGES requests
    const collectedOrders: WooOrderLike[] = [];
    let totalInStore = 0;

    for (let page = 1; page <= PAGES; page += 1) {
      const response = await listWooOrders({ perPage: PER_PAGE, page });
      totalInStore = response.total;
      collectedOrders.push(...response.orders);
      if (
        response.orders.length < PER_PAGE ||
        page * PER_PAGE >= response.total
      ) {
        break;
      }
    }

    // 2. Fetch authoritative catalog product costs
    const catalogCostMap = new Map<number, number>();
    try {
      const catalog = await catalogRead;
      if (catalog.error) throw new Error("Catalogue unavailable");
      const products = catalog.products;
      if (products.length >= 100)
        warnings.push(
          "Catalogue cost lookup is limited to 100 products. Missing costs must be recorded on each order.",
        );
      for (const p of products) {
        if (!p.id) continue;
        const hkCost = Number(
          p.meta_data?.find((m) => m.key === "_himalayan_koh_cost_price")
            ?.value,
        );
        const landedCost = Number(
          p.meta_data?.find((m) => m.key === "_himalayan_koh_landed_cost")
            ?.value,
        );
        const wsCost = Number(
          p.meta_data?.find((m) => m.key === "_owner_wholesale_price")?.value,
        );

        const cost =
          (Number.isFinite(hkCost) && hkCost > 0 ? hkCost : null) ??
          (Number.isFinite(landedCost) && landedCost > 0 ? landedCost : null) ??
          (Number.isFinite(wsCost) && wsCost > 0 ? wsCost : null);

        if (cost !== null && cost > 0) {
          catalogCostMap.set(p.id, cost);
        }
      }
    } catch {
      warnings.push(
        "Catalogue costs could not be loaded. Only recorded order costs are available.",
      );
    }

    // 3. Fetch Wholesale orders if available
    const wholesaleOrders: WholesaleOrderRecord[] = [];
    try {
      const wsResult = await wholesaleRead;
      if (wsResult.error) throw new Error("Wholesale unavailable");
      const [wsOrders, wsAccounts] = wsResult.rows;

      const accountMap = new Map<string, string>();
      for (const acc of wsAccounts as Array<{
        id?: string | number;
        companyName?: string;
        company_name?: string;
        company?: string;
      }>) {
        if (acc.id) {
          accountMap.set(
            String(acc.id),
            acc.companyName || acc.company_name || acc.company || "Wholesale Partner",
          );
        }
      }

      for (const raw of wsOrders as Array<Record<string, unknown>>) {
        const id = String(raw.id || raw.reference || raw.ref || "");
        const ref = String(raw.reference || raw.ref || raw.id || "WS-ORD");
        const accId = String(raw.accountId || raw.account_id || "");
        const status = String(raw.status || "CONFIRMED");
        const currency = String(raw.currency || "USD");
        const totals = raw.totals as Record<string, unknown> | undefined;
        const total = Number(
          (Number(raw.sell_total) > 0 ? raw.sell_total : undefined) ?? totals?.sellTotal ?? totals?.sellGrandTotal ?? totals?.total ?? raw.total ?? 0,
        );
        const deposit = Number(
          raw.depositCollected ?? raw.deposit_collected ?? raw.paid_amount ?? 0,
        );
        const balance = Number(
          raw.balanceCollected ?? raw.balance_collected ?? 0,
        );
        const createdAt = String(
          raw.createdAt || raw.created_at || new Date().toISOString(),
        );

        const input = profitInputFromRow(raw);
        const account = (wsAccounts as Array<Record<string, unknown>>).find(
          (a) => String(a.id) === accId,
        );
        if (!input.commissionPct && input.commissionAmount === null)
          input.commissionPct = Number(
            account?.commission_pct ?? account?.commissionPct ?? 0,
          );
        const financials =
          (Number(raw.cost_total) > 0 || totals?.costTotal != null || Number(raw.hk_net_profit) !== 0 && raw.hk_net_profit != null || (Number(raw.sell_total) > 0 || Number(totals?.sellTotal) > 0) && input.costTotal > 0)
            ? computeProfit({ ...input, sellTotal: total })
            : null;
        wholesaleOrders.push({
          id,
          reference: ref,
          companyName: accountMap.get(accId) || "Wholesale Partner",
          status,
          currency,
          total,
          depositCollected: deposit,
          balanceCollected: balance,
          createdAt,
          financials: financials
            ? {
                cogs: financials.costTotal,
                shipping: financials.freightTotal,
                other: financials.otherCosts,
                commission: financials.commissionAmount,
                netProfit: financials.hkNetProfit,
                margin: financials.hkNetMarginPct,
              }
            : undefined,
        });
      }
    } catch {
      warnings.push(
        "Wholesale records could not be loaded. Wholesale totals are unavailable.",
      );
    }

    const expenseResult = await expenseRead;
    if (expenseResult.error)
      warnings.push(
        "The expense ledger could not be loaded. Profit is incomplete; retry before using this report.",
      );
    const expenses = expenseResult.items;
    // 4. Build comprehensive Sales dashboard with unified financial reconciliation
    const dashboardData = buildSalesDashboard({
      orders: collectedOrders,
      period,
      wholesaleOrders,
      ordersScanned: collectedOrders.length,
      windowCapped: totalInStore > collectedOrders.length,
      catalogCostMap,
      manualExpenses: expenses.filter(
        (e) => !e.archived && e.currency === "USD",
      ),
    });

    return NextResponse.json(
      { ...dashboardData, expenses, warnings },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    const status = error instanceof WooOrderError ? error.status : 502;
    const message =
      error instanceof Error
        ? error.message
        : "Unable to compile sales metrics";
    return NextResponse.json({ error: message }, { status });
  }
}
