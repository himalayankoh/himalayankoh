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
  wooRefundedAmount,
} from '@/lib/woo/orders';
import { formatPaymentMethod } from '@/lib/orders/display';
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

/* ------------------------------------------------------------------ */
/* Payment evidence: what the store's own "paid" total is made of     */
/* ------------------------------------------------------------------ */

/**
 * Where a payment provider's reference can be recorded on an order.
 *
 * `transaction_id` is WooCommerce's own field and is what most gateways write. The
 * meta keys are the ones this store's four gateways actually use — measured on its own
 * orders, not guessed: Stripe `_stripe_intent_id`, PayPal `_ppcp_paypal_order_id` and
 * `_paypal_order_id`, Amazon Pay `amazon_charge_id`/`amazon_capture_id`/
 * `amazon_authorization_id`, Square `_wc_square_credit_card_trans_id`.
 */
const PROVIDER_REFERENCE_META = /(_transaction_id|_stripe_intent_id|_stripe_charge_id|_paypal_order_id|_ppcp_paypal_order_id|_paypal_transaction_id|amazon_charge_id|amazon_capture_id|amazon_authorization_id|_wc_square_credit_card_trans_id)$/i;

/**
 * The reference a provider left on this order, or null.
 *
 * This is evidence that a reference *exists* — it is not proof that the money arrived,
 * because nothing here contacts the provider. The whole point of `RevenueEvidence` is to
 * keep those two claims apart instead of letting them share the word "confirmed".
 */
export function providerReference(woo: WooOrderLike): string | null {
  const direct = typeof woo.transaction_id === 'string' ? woo.transaction_id.trim() : '';
  if (direct) return direct;
  for (const item of woo.meta_data ?? []) {
    if (!PROVIDER_REFERENCE_META.test(String(item?.key ?? ''))) continue;
    const value = String(item?.value ?? '').trim();
    if (value) return value;
  }
  return null;
}

/**
 * Names a gateway test leaves behind.
 *
 * Measured, not guessed: three of this store's paid orders carry a billing name of
 * literally `test test`, one of them on the administrator's own account, and a fourth
 * was billed to the owner's own name at 99% off — an 8-cent Square charge and a 10-cent
 * PayPal capture. A placeholder name is the store's own evidence that nobody was
 * buying; it never decides an order on its own, and nothing here deletes or moves one.
 */
const PLACEHOLDER_BILLING_NAME = /^(test|tests|testing|test test|test user|test account|test customer|asdf|asdfasdf|aaa+|xxx+|qwerty|dummy|demo|sample|none|null|n\/?a)$/i;

/** A discount that leaves cents of a real price — the coupon this store's tests used. */
const NEAR_TOTAL_DISCOUNT = 0.9;
const CENTS_CEILING = 1;

/** The billing name as the store recorded it, trimmed; empty when there is none. */
export function billingNameOf(woo: WooOrderLike): string {
  return [woo.billing?.first_name, woo.billing?.last_name]
    .map((part) => String(part ?? '').trim())
    .filter(Boolean)
    .join(' ')
    .trim();
}

/**
 * Is this order shaped like a gateway test rather than a sale?
 *
 * Two shapes, both of which the store's own records show, and neither of which is an
 * amount on its own: a placeholder billing name, or a discount of at least 90% that
 * leaves the order under a dollar. Amount alone is deliberately *not* a test signal —
 * one of this store's smallest orders (60 cents) is a Stripe payment the provider still
 * confirms as captured.
 */
export function classifyTestShapedOrder(woo: WooOrderLike): {
  testShaped: boolean;
  reason: string | null;
} {
  const name = billingNameOf(woo);
  if (name && PLACEHOLDER_BILLING_NAME.test(name)) {
    return { testShaped: true, reason: `the billing name is a placeholder ("${name}")` };
  }

  const subtotal = money(woo.subtotal);
  const discount = money(woo.discount_total);
  const total = money(woo.total);
  if (discount > 0 && subtotal > 0 && total < CENTS_CEILING && discount / subtotal >= NEAR_TOTAL_DISCOUNT) {
    return {
      testShaped: true,
      reason: `a ${Math.round((discount / subtotal) * 100)}% discount left the order at ${total.toFixed(2)}`,
    };
  }

  return { testShaped: false, reason: null };
}

/** One class of orders, as the evidence counts it. */
export interface RevenueEvidenceBucket {
  orders: number;
  total: number;
}

/**
 * What the store's own paid total is actually made of.
 *
 * The console's revenue line is WooCommerce's rule — an order the store reports paid,
 * with refunds subtracted — and that rule is exactly as trustworthy as the store's word.
 * This decomposes it so no reader has to take the total on faith:
 *
 *   - `withProviderReference` / `withoutProviderReference`: paid, split by whether the
 *     record names a provider transaction at all;
 *   - `testShaped`: paid, and shaped like a gateway test — separated because the store
 *     counts it as revenue and the operator should not;
 *   - `awaitingPayment`, `failed`, `cancelled`, `archived`: not revenue, each for its
 *     own reason, so a figure that is *missing* is never rendered as a zero;
 *   - `excludingTestShaped`: the same paid rule with the test-shaped orders removed.
 *
 * The buckets partition the paid set: every order the store reports paid is in exactly
 * one of `withProviderReference`, `withoutProviderReference` or `testShaped`.
 */
export interface RevenueEvidence {
  storePaid: RevenueEvidenceBucket;
  withProviderReference: RevenueEvidenceBucket;
  withoutProviderReference: RevenueEvidenceBucket;
  testShaped: RevenueEvidenceBucket & { ids: number[]; reasons: string[] };
  awaitingPayment: RevenueEvidenceBucket;
  failed: RevenueEvidenceBucket;
  cancelled: RevenueEvidenceBucket;
  archived: RevenueEvidenceBucket;
  /** `storePaid.total` less the orders that are shaped like a gateway test. */
  excludingTestShaped: number;
  /** What may, and may not, be claimed about these figures. */
  basis: string;
}

export function computeRevenueEvidence(orders: WooOrderLike[]): RevenueEvidence {
  const empty = (): RevenueEvidenceBucket => ({ orders: 0, total: 0 });
  const add = (bucket: RevenueEvidenceBucket, amount: number): void => {
    bucket.orders += 1;
    bucket.total = round2(bucket.total + amount);
  };

  const storePaid = empty();
  const withProviderReference = empty();
  const withoutProviderReference = empty();
  const testShaped: RevenueEvidence['testShaped'] = { ...empty(), ids: [], reasons: [] };
  const awaitingPayment = empty();
  const failed = empty();
  const cancelled = empty();
  const archived = empty();

  for (const order of orders ?? []) {
    const total = money(order.total);
    const status = String(order.status ?? '').toLowerCase();

    if (status === 'trash') {
      add(archived, total);
      continue;
    }

    if (isOrderPaid(order)) {
      add(storePaid, total);
      const shape = classifyTestShapedOrder(order);
      if (shape.testShaped) {
        add(testShaped, total);
        const id = Number(order.id);
        if (Number.isFinite(id) && id > 0) testShaped.ids.push(id);
        if (shape.reason) testShaped.reasons.push(shape.reason);
      } else if (providerReference(order)) {
        add(withProviderReference, total);
      } else {
        add(withoutProviderReference, total);
      }
      continue;
    }

    if (status === 'failed') add(failed, total);
    else if (status === 'cancelled') add(cancelled, total);
    else add(awaitingPayment, total);
  }

  return {
    storePaid,
    withProviderReference,
    withoutProviderReference,
    testShaped,
    awaitingPayment,
    failed,
    cancelled,
    archived,
    excludingTestShaped: round2(storePaid.total - testShaped.total),
    basis:
      'WooCommerce is the source: an order counts as paid when the store reports a paid date, ' +
      'or a completed/processing status with no failed payment. A provider reference is evidence ' +
      'that one was recorded, not proof the money arrived — nothing in this console contacts a ' +
      'gateway. Provider-level confirmation is a separate check, recorded in ' +
      'docs/production/CUSTOMER-DATA-AUDIT-2026-10-11.md.',
  };
}

/**
 * The evidence as sentences, for the payload the Sales screen renders.
 *
 * Only non-empty classes are named: a sentence that says "0 orders" for a class the
 * store does not have would add noise, and the point of these lines is which figures a
 * reader must not add together.
 */
export function describeRevenueEvidence(evidence: RevenueEvidence): string[] {
  const money2 = (value: number) => `$${value.toFixed(2)}`;
  const lines: string[] = [];

  lines.push(
    `Revenue is the store's own rule — orders WooCommerce reports as paid, refunds subtracted: ` +
      `${money2(evidence.storePaid.total)} across ${evidence.storePaid.orders} order(s).`
  );

  if (evidence.withProviderReference.orders > 0) {
    lines.push(
      `${evidence.withProviderReference.orders} of them (${money2(evidence.withProviderReference.total)}) carry a ` +
        `provider transaction reference. A reference records that one was written down; it is not ` +
        `confirmation the money arrived, and this console contacts no gateway.`
    );
  }
  if (evidence.withoutProviderReference.orders > 0) {
    lines.push(
      `${evidence.withoutProviderReference.orders} paid order(s) ` +
        `(${money2(evidence.withoutProviderReference.total)}) carry no provider reference at all — the store ` +
        `asserts payment and nothing in the record evidences it.`
    );
  }
  if (evidence.testShaped.orders > 0) {
    lines.push(
      `${evidence.testShaped.orders} order(s) (${money2(evidence.testShaped.total)}) are shaped like gateway tests ` +
        `— ${evidence.testShaped.reasons[0] ?? 'a placeholder billing name or a 99% discount'} — and the store ` +
        `counts them as revenue. Without them the figure is ${money2(evidence.excludingTestShaped)}. They have not ` +
        `been moved or deleted.`
    );
  }
  if (evidence.awaitingPayment.orders > 0) {
    lines.push(`Awaiting payment, not revenue: ${evidence.awaitingPayment.orders} order(s) (${money2(evidence.awaitingPayment.total)}).`);
  }
  if (evidence.failed.orders > 0) {
    lines.push(`Failed attempts, not revenue: ${evidence.failed.orders} order(s) (${money2(evidence.failed.total)}).`);
  }
  if (evidence.cancelled.orders > 0) {
    lines.push(`Cancelled, not revenue: ${evidence.cancelled.orders} order(s) (${money2(evidence.cancelled.total)}).`);
  }
  if (evidence.archived.orders > 0) {
    lines.push(
      `In the bin, outside this list until restored: ${evidence.archived.orders} order(s) ` +
        `(${money2(evidence.archived.total)}) — see the Orders screen's Trashed view.`
    );
  }

  lines.push(evidence.basis);
  return lines;
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
    const partialRefund = wooRefundedAmount(order);
    if (partialRefund > 0) refunds += partialRefund;
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
      const partialToday = wooRefundedAmount(order);
      if (partialToday > 0) refunds += partialToday;
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
      point.refunds += wooRefundedAmount(order);
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
  const refundedAmount = wooRefundedAmount(woo);
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
    paymentStatus: isOrderPaid(woo) ? (order.payment_status === 'partially_refunded' ? 'partially_refunded' : 'paid') : order.payment_status,
    // The human label, not the stored code: an operator reading the Sales table should
    // see "Credit / debit card" and "Staging Test Card", not `stripe_card` and
    // `staging_test_card` — and a staging QA order must be recognisable at a glance.
    paymentMethod: order.payment_method ? formatPaymentMethod(order.payment_method) : null,
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
  const received = round2(total - wooRefundedAmount(woo));
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
    paymentMethod: order.payment_method ? formatPaymentMethod(order.payment_method) : 'Unknown',
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
    // Where the money figure came from, in the payload's own words. `warnings` is the
    // field the Sales payload already carries for exactly this: sentences the operator
    // has to read before believing a total.
    warnings: describeRevenueEvidence(computeRevenueEvidence(filtered)),
    wholesaleSummary,
    todayKpis,
    ordersScanned,
    windowCapped,
  };
}

export { periodToRange };

