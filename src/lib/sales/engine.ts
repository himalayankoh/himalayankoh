import { computeCosts, computeProfit } from './summary';
/**
 * Himalayan Koh Sales — server-side aggregation engine.
 *
 * ## Design principles
 *
 * 1. **WooCommerce is truth.** Every number comes from `listWooOrders`.
 *    Unpaid orders are never revenue.
 * 2. **Pure computation.** Given a list of WooOrderLike records, this module
 *    produces every metric the Sales dashboard needs. No I/O beyond the
 *    initial order fetch.
 * 3. **Paid = revenue.** An order contributes to revenue only when
 *    `paymentStatusFromWoo(order) === 'paid'`.
 * 4. **Refunded orders reduce revenue.** A refunded order's total is
 *    subtracted, not ignored.
 */

import type {
  WooOrderLike,
  WooOrderLineItem,
} from '@/lib/woo/orders';
import {
  paymentStatusFromWoo,
  appStatusFromWoo,
  orderFromWoo,
} from '@/lib/woo/orders';
import type {
  RevenueSummary,
  DailySalesPoint,
  SalesOrderRow,
  SalesOrderItemRow,
  PaymentRecord,
  ReconciliationStatus,
  SalesDashboardData,
  SalesPeriod,
  DateRange,
  WholesaleFinancialSummary,
  TodayKpiSummary,
  ManualExpense,
  CostSourceType,
  CogsStatus,
} from './types';

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const money = (v: string | number | undefined | null): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const round2 = (v: number) => Math.round(v * 100) / 100;

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parseDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function periodToRange(period: SalesPeriod): DateRange {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let from: Date;

  switch (period) {
    case 'today':
      from = today;
      break;
    case '7d':
      from = new Date(today);
      from.setDate(from.getDate() - 6);
      break;
    case '30d':
      from = new Date(today);
      from.setDate(from.getDate() - 29);
      break;
    case '90d':
      from = new Date(today);
      from.setDate(from.getDate() - 89);
      break;
    case '12m':
      from = new Date(today);
      from.setFullYear(from.getFullYear() - 1);
      break;
    case 'ytd':
      from = new Date(today.getFullYear(), 0, 1);
      break;
    case 'all':
    default:
      from = new Date(2020, 0, 1);
      break;
  }

  return { from: isoDate(from), to: isoDate(today) };
}

/* ------------------------------------------------------------------ */
/* Revenue                                                             */
/* ------------------------------------------------------------------ */

function isOrderPaid(order: WooOrderLike): boolean {
  if (order.status === 'refunded' || order.status === 'cancelled' || order.status === 'failed' || order.status === 'trash') {
    return false;
  }
  const payStatus = paymentStatusFromWoo(order);
  if (payStatus === 'paid') return true;
  if (order.date_paid_gmt || order.status === 'processing' || order.status === 'completed') {
    return true;
  }
  return false;
}

function isOrderRefunded(order: WooOrderLike): boolean {
  const payStatus = paymentStatusFromWoo(order);
  const appStatus = appStatusFromWoo(order);
  return payStatus === 'refunded' || appStatus === 'refunded' || order.status === 'refunded';
}

function computeRevenue(orders: WooOrderLike[]): RevenueSummary {
  let grossRevenue = 0;
  let refunds = 0;
  let shippingRevenue = 0;
  let taxCollected = 0;
  let discountsGiven = 0;
  let paidCount = 0;

  for (const order of orders) {
    if (isOrderRefunded(order)) {
      refunds += money(order.total);
      continue;
    }

    if (!isOrderPaid(order)) continue;

    paidCount += 1;
    grossRevenue += money(order.total);
    shippingRevenue += money(order.shipping_total);
    taxCollected += money(order.total_tax);
    discountsGiven += money(order.discount_total);
  }

  const netRevenue = round2(grossRevenue - refunds);

  return {
    grossRevenue: round2(grossRevenue),
    refunds: round2(refunds),
    netRevenue,
    shippingRevenue: round2(shippingRevenue),
    taxCollected: round2(taxCollected),
    discountsGiven: round2(discountsGiven),
    orderCount: paidCount,
    aov: paidCount > 0 ? round2(netRevenue / paidCount) : 0,
    currency: 'USD',
  };
}

/* ------------------------------------------------------------------ */
/* Today KPIs                                                          */
/* ------------------------------------------------------------------ */

function computeTodayKpis(allOrders: WooOrderLike[]): TodayKpiSummary {
  const todayStr = isoDate(new Date());
  let paidRev = 0;
  let refunds = 0;
  let count = 0;

  for (const order of allOrders) {
    const created = parseDate(order.date_created_gmt);
    if (!created) continue;
    if (isoDate(created) !== todayStr) continue;

    if (isOrderRefunded(order)) {
      refunds += money(order.total);
    } else if (isOrderPaid(order)) {
      paidRev += money(order.total);
      count += 1;
    }
  }

  const netRev = round2(paidRev - refunds);
  return {
    paidRevenue: round2(paidRev),
    orderCount: count,
    refunds: round2(refunds),
    netRevenue: netRev,
    aov: count > 0 ? round2(netRev / count) : 0,
  };
}

/* ------------------------------------------------------------------ */
/* Costs (order-level accurate costs + manual expenses)                */
/* ------------------------------------------------------------------ */

/** Gateway fee estimate — Stripe's 2.9% + $0.30 per transaction. */
export const STRIPE_PCT = 0.029;
export const STRIPE_FIXED = 0.30;

/* ------------------------------------------------------------------ */
/* Daily series                                                        */
/* ------------------------------------------------------------------ */

function computeDailySeries(orders: WooOrderLike[], range: DateRange): DailySalesPoint[] {
  const from = new Date(range.from);
  const to = new Date(range.to);
  const dayMap = new Map<string, DailySalesPoint>();

  // Prefill every day in range
  for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
    const key = isoDate(d);
    dayMap.set(key, { date: key, revenue: 0, orders: 0, refunds: 0, netRevenue: 0 });
  }

  for (const order of orders) {
    const created = parseDate(order.date_created_gmt);
    if (!created) continue;
    const key = isoDate(created);
    const point = dayMap.get(key);
    if (!point) continue;

    const payStatus = paymentStatusFromWoo(order);
    const appStatus = appStatusFromWoo(order);
    const total = money(order.total);

    if (isOrderRefunded(order)) {
      point.refunds += total;
    } else if (isOrderPaid(order)) {
      point.revenue += total;
      point.orders += 1;
    }
  }

  const result: DailySalesPoint[] = [];
  for (const [, point] of dayMap) {
    point.revenue = round2(point.revenue);
    point.refunds = round2(point.refunds);
    point.netRevenue = round2(point.revenue - point.refunds);
    result.push(point);
  }

  return result.sort((a, b) => a.date.localeCompare(b.date));
}

/* ------------------------------------------------------------------ */
/* Order rows & Supplementary Financial Layer                          */
/* ------------------------------------------------------------------ */

function getOrderMeta(order: WooOrderLike, key: string): string | null {
  const item = order.meta_data?.find(m => m.key === key);
  if (!item || item.value === undefined || item.value === null) return null;
  const val = String(item.value).trim();
  return val.length > 0 ? val : null;
}

function getLineItemMeta(line: WooOrderLineItem, key: string): string | null {
  const item = line.meta_data?.find(m => m.key === key);
  if (!item || item.value === undefined || item.value === null) return null;
  const val = String(item.value).trim();
  return val.length > 0 ? val : null;
}

function getCostFromMap(
  map: Map<number, number> | Record<number, number> | undefined,
  id: number
): number | null {
  if (!map || !id) return null;
  if (map instanceof Map) {
    const val = map.get(id);
    return typeof val === 'number' && Number.isFinite(val) ? val : null;
  }
  const val = (map as Record<number, number>)[id];
  return typeof val === 'number' && Number.isFinite(val) ? val : null;
}

function lineItemToRow(
  line: WooOrderLineItem,
  catalogCostMap?: Map<number, number> | Record<number, number>
): SalesOrderItemRow {
  const qty = Number(line.quantity ?? 0);
  const unitPrice = Number(line.price ?? 0);
  const lineTotal = money(line.total);

  // 1. Line-item snapshotted cost
  const unitCostMeta = getLineItemMeta(line, '_unit_cost');
  const lineCogsMeta = getLineItemMeta(line, '_line_cogs');
  const cogsSourceMeta = getLineItemMeta(line, '_cogs_source') as CostSourceType | null;

  let unitCost: number | null = null;
  let lineCogs: number | null = null;
  let cogsSource: CostSourceType = 'none';

  if (unitCostMeta !== null || lineCogsMeta !== null) {
    unitCost = unitCostMeta !== null ? money(unitCostMeta) : round2(money(lineCogsMeta) / (qty || 1));
    lineCogs = lineCogsMeta !== null ? money(lineCogsMeta) : round2(unitCost * qty);
    cogsSource = cogsSourceMeta || 'manual';
  } else if (catalogCostMap) {
    // 2. Authoritative catalog cost (variation > product)
    const varId = Number(line.variation_id ?? 0);
    const prodId = Number(line.product_id ?? 0);
    const catCost = (varId > 0 ? getCostFromMap(catalogCostMap, varId) : null)
      ?? (prodId > 0 ? getCostFromMap(catalogCostMap, prodId) : null);

    if (catCost !== null && catCost > 0) {
      unitCost = catCost;
      lineCogs = round2(unitCost * qty);
      cogsSource = 'auto';
    }
  }

  return {
    productName: line.name ?? 'Unknown',
    sku: typeof line.sku === 'string' ? line.sku : null,
    quantity: qty,
    unitPrice,
    lineTotal,
    unitCost,
    lineCogs,
    cogsSource,
  };
}

export function orderToSalesRow(
  woo: WooOrderLike,
  catalogCostMap?: Map<number, number> | Record<number, number>
): SalesOrderRow {
  const order = orderFromWoo(woo);
  const refundedAmount = order.status === 'refunded' ? order.total : 0;
  const netTotal = round2(order.total - refundedAmount);

  const billingName = [woo.billing?.first_name, woo.billing?.last_name]
    .filter(Boolean)
    .join(' ')
    .trim();

  const items = (woo.line_items ?? []).map(l => lineItemToRow(l, catalogCostMap));

  // 1. Order COGS Resolution
  const orderCogsMeta = getOrderMeta(woo, '_hk_cogs') || getOrderMeta(woo, '_cogs');
  const orderCogsSourceMeta = (getOrderMeta(woo, '_hk_cogs_source') || getOrderMeta(woo, '_cogs_source')) as CostSourceType | null;

  let cogs: number | null = null;
  let cogsStatus: CogsStatus = 'missing';
  let cogsSource: CostSourceType = 'none';
  let isSnapshotted = false;

  if (orderCogsMeta !== null) {
    cogs = money(orderCogsMeta);
    cogsStatus = 'verified';
    cogsSource = orderCogsSourceMeta || 'manual';
    isSnapshotted = true;
  } else if (items.length > 0 && items.every(it => it.lineCogs !== null)) {
    cogs = round2(items.reduce((sum, it) => sum + (it.lineCogs ?? 0), 0));
    cogsStatus = 'verified';
    cogsSource = items.every(it => it.cogsSource === 'auto') ? 'auto' : 'manual';
    isSnapshotted = false;
  }

  // 2. Actual Business Shipping Cost (NOT customer shipping charged!)
  const shipMeta = getOrderMeta(woo, '_hk_shipping_cost') || getOrderMeta(woo, '_shipping_cost');
  const shipSourceMeta = (getOrderMeta(woo, '_hk_shipping_cost_source') || getOrderMeta(woo, '_shipping_cost_source')) as CostSourceType | null;
  const actualShippingCost = shipMeta !== null ? money(shipMeta) : 0;
  const shippingCostSource: CostSourceType = shipMeta !== null ? (shipSourceMeta || 'manual') : 'none';

  // 3. Payment Gateway Fee
  const feeMeta = getOrderMeta(woo, '_hk_payment_fee') || getOrderMeta(woo, '_payment_fee');
  const feeSourceMeta = (getOrderMeta(woo, '_hk_payment_fee_source') || getOrderMeta(woo, '_payment_fee_source')) as CostSourceType | null;
  let paymentFee = 0;
  let paymentFeeSource: CostSourceType = 'none';

  if (feeMeta !== null) {
    paymentFee = money(feeMeta);
    paymentFeeSource = feeSourceMeta || 'manual';
  } else if (isOrderPaid(woo)) {
    const method = (woo.payment_method ?? '').toLowerCase();
    if (method.includes('stripe') || method.includes('card') || method === '') {
      paymentFee = round2(money(woo.total) * STRIPE_PCT + STRIPE_FIXED);
      paymentFeeSource = 'estimated';
    } else {
      paymentFee = 0;
      paymentFeeSource = 'actual';
    }
  }

  // 4. Other Direct Expense
  const otherMeta = getOrderMeta(woo, '_hk_other_expense') || getOrderMeta(woo, '_other_expense');
  const otherSourceMeta = (getOrderMeta(woo, '_hk_other_expense_source') || getOrderMeta(woo, '_other_expense_source')) as CostSourceType | null;
  const otherExpense = otherMeta !== null ? money(otherMeta) : 0;
  const otherExpenseSource: CostSourceType = otherMeta !== null ? (otherSourceMeta || 'manual') : 'none';

  // 5. Total Costs & Profit
  let totalCosts: number | null = null;
  let netProfit: number | null = null;
  let profitMarginPct: number | null = null;

  if (cogsStatus === 'verified' && cogs !== null) {
    totalCosts = round2(cogs + actualShippingCost + paymentFee + otherExpense);
    netProfit = round2(netTotal - totalCosts);
    profitMarginPct = netTotal > 0 ? round2((netProfit / netTotal) * 100) : 0;
  }

  return {
    id: order.id,
    orderNumber: order.order_number,
    channel: 'retail',
    date: order.created_at,
    customerName: billingName || 'Guest',
    customerEmail: order.email,
    status: order.status,
    paymentStatus: isOrderPaid(woo) ? 'paid' : order.payment_status,
    paymentMethod: order.payment_method,
    subtotal: order.subtotal,
    shipping: order.shipping_cost,
    tax: order.tax_amount,
    discount: order.discount_amount,
    total: order.total,
    refundedAmount,
    netTotal,
    currency: order.currency,
    itemCount: items.length,
    items,
    cogs,
    cogsStatus,
    cogsSource,
    actualShippingCost,
    shippingCostSource,
    paymentFee,
    paymentFeeSource,
    otherExpense,
    otherExpenseSource,
    totalCosts,
    netProfit,
    profitMarginPct,
    isSnapshotted,
    collectedAmount: isOrderPaid(woo) ? netTotal : 0,
    supplier: getOrderMeta(woo, '_hk_supplier') ?? '',
    supplierReference: getOrderMeta(woo, '_hk_supplier_reference') ?? '',
    notes: getOrderMeta(woo, '_hk_sales_notes') ?? '',
    transactionId: woo.transaction_id ?? '',
    tracking: getOrderMeta(woo, '_tracking_number') ?? '',
  };
}

/* ------------------------------------------------------------------ */
/* Payment records                                                     */
/* ------------------------------------------------------------------ */

function orderToPaymentRecord(woo: WooOrderLike): PaymentRecord | null {
  const isPaid = isOrderPaid(woo);
  const isRefunded = isOrderRefunded(woo);
  if (!isPaid && !isRefunded) return null;

  const order = orderFromWoo(woo);
  const total = order.total;
  const feeMeta = getOrderMeta(woo, '_hk_payment_fee') || getOrderMeta(woo, '_payment_fee');
  let fee = 0;
  if (feeMeta !== null) {
    fee = money(feeMeta);
  } else {
    const method = (woo.payment_method ?? '').toLowerCase();
    fee = method.includes('stripe') || method.includes('card') || method === ''
      ? round2(total * STRIPE_PCT + STRIPE_FIXED)
      : 0;
  }
  const received = isRefunded ? 0 : total;
  const netReceived = round2(received - fee);

  let status: ReconciliationStatus = 'matched';
  if (isRefunded) status = 'unmatched';
  else if (received < total) status = 'partial';

  return {
    orderId: order.id,
    orderNumber: order.order_number,
    date: order.created_at,
    expectedAmount: total,
    receivedAmount: received,
    gatewayFee: fee,
    netReceived,
    status,
    paymentMethod: order.payment_method ?? 'Unknown',
    transactionId: woo.transaction_id || null,
    currency: order.currency,
  };
}

/* ------------------------------------------------------------------ */
/* Top products & customers                                            */
/* ------------------------------------------------------------------ */

function computeTopProducts(orders: WooOrderLike[]): SalesDashboardData['topProducts'] {
  const map = new Map<string, { name: string; revenue: number; quantity: number; sku: string | null }>();

  for (const order of orders) {
    if (!isOrderPaid(order)) continue;
    for (const line of order.line_items ?? []) {
      const key = String(line.product_id ?? line.name ?? 'unknown');
      const existing = map.get(key);
      const qty = Number(line.quantity ?? 0);
      const rev = money(line.total);
      if (existing) {
        existing.revenue += rev;
        existing.quantity += qty;
      } else {
        map.set(key, {
          name: line.name ?? 'Unknown',
          revenue: rev,
          quantity: qty,
          sku: typeof line.sku === 'string' ? line.sku : null,
        });
      }
    }
  }

  return [...map.values()]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 20)
    .map(p => ({ ...p, revenue: round2(p.revenue) }));
}

function computeTopCustomers(orders: WooOrderLike[]): SalesDashboardData['topCustomers'] {
  const map = new Map<string, { name: string; email: string; revenue: number; orders: number }>();

  for (const order of orders) {
    if (!isOrderPaid(order)) continue;
    const email = (order.billing?.email ?? '').trim().toLowerCase();
    if (!email) continue;
    const name = [order.billing?.first_name, order.billing?.last_name]
      .filter(Boolean).join(' ').trim() || 'Guest';
    const existing = map.get(email);
    const total = money(order.total);
    if (existing) {
      existing.revenue += total;
      existing.orders += 1;
    } else {
      map.set(email, { name, email, revenue: total, orders: 1 });
    }
  }

  return [...map.values()]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 20)
    .map(c => ({ ...c, revenue: round2(c.revenue) }));
}

/* ------------------------------------------------------------------ */
/* Wholesale integration types                                         */
/* ------------------------------------------------------------------ */

export interface WholesaleOrderRecord {
  id: string;
  reference: string;
  companyName?: string;
  status: string;
  currency: string;
  total: number;
  depositCollected?: number;
  balanceCollected?: number;
  createdAt: string;
  financials?: { cogs: number; shipping: number; other: number; commission: number; netProfit: number; margin: number };
}

/* ------------------------------------------------------------------ */
/* Public: build the full dashboard from raw Woo orders & wholesale    */
/* ------------------------------------------------------------------ */

export interface BuildDashboardParams {
  orders: WooOrderLike[];
  period: SalesPeriod;
  wholesaleOrders?: WholesaleOrderRecord[];
  manualExpenses?: ManualExpense[];
  ordersScanned?: number;
  windowCapped?: boolean;
  catalogCostMap?: Map<number, number> | Record<number, number>;
}

export function buildSalesDashboard(
  ordersOrParams: WooOrderLike[] | BuildDashboardParams,
  legacyPeriod?: SalesPeriod
): SalesDashboardData {
  let orders: WooOrderLike[];
  let period: SalesPeriod;
  let wholesaleOrders: WholesaleOrderRecord[] = [];
  let manualExpenses: ManualExpense[] = [];
  let ordersScanned = 0;
  let windowCapped = false;
  let catalogCostMap: Map<number, number> | Record<number, number> | undefined;

  if (Array.isArray(ordersOrParams)) {
    orders = ordersOrParams;
    period = legacyPeriod ?? '30d';
    ordersScanned = orders.length;
  } else {
    orders = ordersOrParams.orders;
    period = ordersOrParams.period;
    wholesaleOrders = ordersOrParams.wholesaleOrders ?? [];
    manualExpenses = ordersOrParams.manualExpenses ?? [];
    ordersScanned = ordersOrParams.ordersScanned ?? orders.length;
    windowCapped = ordersOrParams.windowCapped ?? false;
    catalogCostMap = ordersOrParams.catalogCostMap;
  }

  const dateRange = periodToRange(period);
  const from = new Date(dateRange.from);
  const to = new Date(dateRange.to);
  to.setHours(23, 59, 59, 999);

  // Filter orders to date range
  const filtered = orders.filter(o => {
    if (period === 'all') return true;
    const d = parseDate(o.date_created_gmt);
    return d && d >= from && d <= to;
  });

  const revenue = computeRevenue(filtered);
  const todayKpis = computeTodayKpis(orders);
  const salesOrders = filtered.map(o => orderToSalesRow(o, catalogCostMap));
  const costs = computeCosts(salesOrders, manualExpenses.filter(e => !e.archived && (period === 'all' || (e.date >= dateRange.from.slice(0,10) && e.date <= dateRange.to.slice(0,10)))));
  const profit = computeProfit(revenue, costs);
  const dailySeries = computeDailySeries(filtered, dateRange);
  const payments = filtered.map(orderToPaymentRecord).filter(Boolean) as PaymentRecord[];
  const topProducts = computeTopProducts(filtered);
  const topCustomers = computeTopCustomers(filtered);

  // Wholesale aggregation
  let wsTotalBooked = 0;
  let wsTotalCollected = 0;
  let wsOrderCount = 0;

  for (const ws of wholesaleOrders) {
    const wsCreated = parseDate(ws.createdAt);
    const inRange = period === 'all' || !wsCreated || (wsCreated >= from && wsCreated <= to);

    if (inRange && ws.status !== 'CANCELLED' && ws.status !== 'DRAFT') {
      wsOrderCount += 1;
      const booked = money(ws.total);
      const deposit = money(ws.depositCollected);
      const balance = money(ws.balanceCollected);
      wsTotalBooked += booked;
      wsTotalCollected += (deposit + balance);

      salesOrders.push({
        id: ws.id,
        orderNumber: ws.reference,
        channel: 'wholesale',
        date: ws.createdAt,
        customerName: ws.companyName || 'Wholesale Client',
        customerEmail: '',
        status: ws.status.toLowerCase(),
        paymentStatus: (deposit + balance) >= booked ? 'paid' : (deposit + balance) > 0 ? 'partially_paid' : 'pending',
        paymentMethod: 'Bank Wire / Terms',
        subtotal: booked,
        shipping: 0,
        tax: 0,
        discount: 0,
        total: booked,
        refundedAmount: 0,
        netTotal: booked,
        currency: ws.currency || 'USD',
        itemCount: 1,
        items: [],
        cogs: ws.financials?.cogs ?? null,
        cogsStatus: ws.financials ? 'verified' : 'missing',
        cogsSource: ws.financials ? 'actual' : 'none',
        actualShippingCost: ws.financials?.shipping ?? 0,
        shippingCostSource: 'none',
        paymentFee: 0,
        paymentFeeSource: 'none',
        otherExpense: ws.financials?.other ?? 0,
        otherExpenseSource: ws.financials ? 'actual' : 'none',
        totalCosts: ws.financials ? round2(ws.financials.cogs + ws.financials.shipping + ws.financials.other + ws.financials.commission) : null,
        netProfit: ws.financials?.netProfit ?? null,
        profitMarginPct: ws.financials?.margin ?? null,
        dealerCommission: ws.financials?.commission ?? 0,
        collectedAmount: round2(deposit + balance),
        balanceDue: round2(Math.max(0, booked - deposit - balance)),
        isSnapshotted: Boolean(ws.financials),
      });
    }
  }

  const wholesaleSummary: WholesaleFinancialSummary = {
    totalBooked: round2(wsTotalBooked),
    totalCollected: round2(wsTotalCollected),
    pendingBalance: round2(Math.max(0, wsTotalBooked - wsTotalCollected)),
    orderCount: wsOrderCount,
  };

  const channelBreakdown: SalesDashboardData['channelBreakdown'] = [
    {
      channel: 'retail',
      revenue: revenue.netRevenue,
      orders: revenue.orderCount,
      aov: revenue.aov,
    },
  ];

  if (wsOrderCount > 0) {
    channelBreakdown.push({
      channel: 'wholesale',
      revenue: wholesaleSummary.totalCollected,
      orders: wholesaleSummary.orderCount,
      aov: wholesaleSummary.orderCount > 0 ? round2(wholesaleSummary.totalCollected / wholesaleSummary.orderCount) : 0,
    });
  }

  return {
    period,
    dateRange,
    revenue,
    costs,
    profit,
    dailySeries,
    orders: salesOrders.sort((a, b) => b.date.localeCompare(a.date)),
    payments,
    topProducts,
    topCustomers,
    channelBreakdown,
    wholesaleSummary,
    todayKpis,
    ordersScanned,
    windowCapped,
  };
}

export { periodToRange };

