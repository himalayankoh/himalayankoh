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
  lineItemsFromWoo,
} from '@/lib/woo/orders';
import type {
  RevenueSummary,
  CostSummary,
  ProfitSummary,
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
/* Costs (estimated from order data & manual expenses)                 */
/* ------------------------------------------------------------------ */

/** Gateway fee estimate — Stripe's 2.9% + $0.30 per transaction. */
const STRIPE_PCT = 0.029;
const STRIPE_FIXED = 0.30;

function computeCosts(
  orders: WooOrderLike[],
  revenue: RevenueSummary,
  manualExpenses: ManualExpense[] = []
): CostSummary {
  let gatewayFees = 0;

  for (const order of orders) {
    if (!isOrderPaid(order)) continue;

    const total = money(order.total);
    const method = (order.payment_method ?? '').toLowerCase();
    if (method.includes('stripe') || method.includes('card') || method === '') {
      gatewayFees += total * STRIPE_PCT + STRIPE_FIXED;
    }
  }

  gatewayFees = round2(gatewayFees);

  let cogs = 0;
  let shippingCost = 0;
  let otherExpenses = 0;

  for (const exp of manualExpenses) {
    if (exp.category === 'shipping') {
      shippingCost += exp.amount;
    } else if (exp.category === 'supplier_payment' || exp.category === 'packaging') {
      cogs += exp.amount;
    } else if (exp.category === 'gateway_fee') {
      gatewayFees += exp.amount;
    } else {
      otherExpenses += exp.amount;
    }
  }

  const totalCosts = round2(cogs + shippingCost + gatewayFees + otherExpenses);

  return {
    cogs: round2(cogs),
    shippingCost: round2(shippingCost),
    gatewayFees,
    otherExpenses: round2(otherExpenses),
    totalCosts,
  };
}

/* ------------------------------------------------------------------ */
/* Profit                                                              */
/* ------------------------------------------------------------------ */

function computeProfit(revenue: RevenueSummary, costs: CostSummary): ProfitSummary {
  const grossProfit = round2(revenue.netRevenue - costs.cogs);
  const grossMarginPct = revenue.netRevenue > 0
    ? round2((grossProfit / revenue.netRevenue) * 100)
    : 0;

  const netProfit = round2(revenue.netRevenue - costs.totalCosts);
  const netMarginPct = revenue.netRevenue > 0
    ? round2((netProfit / revenue.netRevenue) * 100)
    : 0;

  return {
    netRevenue: revenue.netRevenue,
    totalCosts: costs.totalCosts,
    grossProfit,
    grossMarginPct,
    netProfit,
    netMarginPct,
  };
}

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
/* Order rows                                                          */
/* ------------------------------------------------------------------ */

function lineItemToRow(line: WooOrderLineItem): SalesOrderItemRow {
  return {
    productName: line.name ?? 'Unknown',
    sku: typeof line.sku === 'string' ? line.sku : null,
    quantity: Number(line.quantity ?? 0),
    unitPrice: Number(line.price ?? 0),
    lineTotal: money(line.total),
  };
}

function orderToSalesRow(woo: WooOrderLike): SalesOrderRow {
  const order = orderFromWoo(woo);
  const items = lineItemsFromWoo(woo);
  const refundedAmount = order.status === 'refunded' ? order.total : 0;

  const billingName = [woo.billing?.first_name, woo.billing?.last_name]
    .filter(Boolean)
    .join(' ')
    .trim();

  return {
    id: order.id,
    orderNumber: order.order_number,
    channel: 'retail',
    date: order.created_at,
    customerName: billingName || 'Guest',
    customerEmail: order.email,
    status: order.status,
    paymentStatus: order.payment_status,
    paymentMethod: order.payment_method,
    subtotal: order.subtotal,
    shipping: order.shipping_cost,
    tax: order.tax_amount,
    discount: order.discount_amount,
    total: order.total,
    refundedAmount,
    netTotal: round2(order.total - refundedAmount),
    currency: order.currency,
    itemCount: items.length,
    items: (woo.line_items ?? []).map(lineItemToRow),
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
  const method = (woo.payment_method ?? '').toLowerCase();
  const fee = method.includes('stripe') || method.includes('card') || method === ''
    ? round2(total * STRIPE_PCT + STRIPE_FIXED)
    : 0;
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
  const costs = computeCosts(filtered, revenue, manualExpenses);
  const profit = computeProfit(revenue, costs);
  const dailySeries = computeDailySeries(filtered, dateRange);
  const salesOrders = filtered.map(orderToSalesRow);
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

