/**
 * The profit record of a wholesale order, and who it belongs to.
 *
 * ## Two businesses in one order
 *
 * A trade order can come from a dealer who introduces or receives the customer, or
 * straight from a buyer Himalayan Koh sold to. Both are legal, and they are *not* the
 * same margin: on a dealer order the dealer's share comes off the gross profit before
 * Himalayan Koh's net, and on a direct order the whole gross profit is ours. So the
 * breakdown names every part rather than printing one "profit" figure that quietly
 * means two different things.
 *
 * ```
 *   sell total        what the trade customer pays
 *   − cost total      goods (ex-factory / tier cost) + origin charges, as priced
 *   − freight total   ocean freight + surcharges on this order
 *   − other costs     destination, duty, extras actually incurred
 *   = gross profit
 *   − dealer share    the dealer's commission (a share of gross profit, or a figure)
 *   = HK net profit
 * ```
 *
 * ## Why the numbers are inputs, not lookups
 *
 * Every figure here is the one stored on the order (frozen when it was raised), never
 * a fresh read of a supplier's cost or today's freight table. A margin agreed with a
 * dealer in March must not move because a factory re-quoted in April; that is exactly
 * what the order's own snapshot columns are for. A caller that has only a quote
 * passes the quote's totals, and the words say where they came from.
 *
 * ## What it refuses
 *
 * A negative amount is a data-entry mistake, not a credit: it is rejected by name
 * rather than folded into the total and silently inflating a margin. And a commission
 * percentage outside 0–100 is rejected too — a "150% share of profit" is a typo that
 * would otherwise produce a negative net profit nothing explains.
 *
 * Pure — no I/O, no clock. Testable from stored rows alone.
 */

import type { QuoteTotals } from './types';

/** Where a commission figure came from, stated so the console never implies the wrong thing. */
export type CommissionBasis = 'NONE' | 'GROSS_PROFIT_SHARE' | 'FIXED_AMOUNT';

export interface ProfitInput {
  currency: string;
  /** What the trade customer pays, as agreed. */
  sellTotal: number;
  /** Goods plus the origin-side charges frozen on the order/quote. */
  costTotal: number;
  /** Ocean freight and surcharges, when the order is priced beyond EXW/FOB. */
  freightTotal?: number;
  /** Destination charges, duty and extras — only what was actually included. */
  otherCosts?: number;
  /** The dealer's share of gross profit, in percent. 0 with no dealer. */
  commissionPct?: number;
  /** An agreed fixed dealer amount, which wins over the percentage. */
  commissionAmount?: number | null;
  /** Who the dealer is, for the words in the breakdown. */
  dealerName?: string | null;
}

export interface ProfitBreakdown {
  currency: string;
  sellTotal: number;
  costTotal: number;
  freightTotal: number;
  otherCosts: number;
  /** cost + freight + other. */
  totalCost: number;
  grossProfit: number;
  /** Gross profit as a percentage of the sell total. */
  grossMarginPct: number;
  /** Gross profit over cost — a different number, and the one traders argue with. */
  markupPct: number;
  commissionPct: number;
  commissionAmount: number;
  commissionBasis: CommissionBasis;
  dealerName: string | null;
  /** After the dealer's share. */
  hkNetProfit: number;
  hkNetMarginPct: number;
  /** True when the sell side is not set yet, so the figures are not a result. */
  priced: boolean;
  assumptions: string[];
}

/** A named refusal, so a bad figure is a sentence rather than a NaN. */
export class WholesaleProfitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WholesaleProfitError';
  }
}

const round = (value: number, places = 2) => {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
};

function amount(value: unknown, label: string): number {
  if (value === undefined || value === null || value === '') return 0;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new WholesaleProfitError(`${label} is not a number.`);
  }
  if (parsed < 0) {
    throw new WholesaleProfitError(`${label} cannot be negative (${parsed}).`);
  }
  return parsed;
}

/**
 * The breakdown for one order.
 *
 * An unpriced order (no sell total yet) is not an error — it is a draft — so the
 * figures are returned with `priced: false` and a margin that says nothing rather
 * than a misleading 0%.
 */
export function computeProfit(input: ProfitInput): ProfitBreakdown {
  const currency = (input.currency || 'USD').toUpperCase();
  const sellTotal = amount(input.sellTotal, 'Sell total');
  const costTotal = amount(input.costTotal, 'Cost total');
  const freightTotal = amount(input.freightTotal, 'Freight');
  const otherCosts = amount(input.otherCosts, 'Other costs');

  const commissionPctRaw = amount(input.commissionPct ?? 0, 'Commission percentage');
  if (commissionPctRaw > 100) {
    throw new WholesaleProfitError(
      `A dealer's share of profit cannot exceed 100% (it is ${commissionPctRaw}%).`
    );
  }
  const fixed = input.commissionAmount === null || input.commissionAmount === undefined
    ? null
    : amount(input.commissionAmount, 'Fixed dealer amount');

  const totalCost = round(costTotal + freightTotal + otherCosts, 2);
  const grossProfit = round(sellTotal - totalCost, 2);

  // A share of a *loss* is not money the dealer hands over: the rate is a share of
  // profit, and there is no profit. So the share is held at zero and the loss stays
  // with Himalayan Koh — stated in the assumptions rather than left to be inferred.
  // (Left unclamped, a loss would store a negative dealer amount, and a negative
  // amount is refused everywhere else by design — which turned one bad sale into a
  // profit screen that would not load at all.)
  const shareOfProfit = round((commissionPctRaw / 100) * grossProfit, 2);
  const commissionAmount = fixed !== null ? round(fixed, 2) : Math.max(shareOfProfit, 0);
  const commissionBasis: CommissionBasis =
    fixed !== null ? 'FIXED_AMOUNT' : commissionPctRaw > 0 ? 'GROSS_PROFIT_SHARE' : 'NONE';

  const hkNetProfit = round(grossProfit - commissionAmount, 2);
  const priced = sellTotal > 0;

  const assumptions: string[] = [];
  if (!priced) {
    assumptions.push(
      'No sell total is set on this order yet, so the profit figures are a cost picture only — nothing here is a result.'
    );
  }
  if (freightTotal === 0) {
    assumptions.push(
      'No freight is recorded on this order. On an EXW/FOB sale that is correct; on a CFR/CIF sale the freight belongs in the cost and the margin here is too high.'
    );
  }
  if (commissionPctRaw === 0 && fixed === null) {
    assumptions.push('No dealer is attached, so the whole gross profit is Himalayan Koh’s.');
  } else if (commissionBasis === 'GROSS_PROFIT_SHARE') {
    assumptions.push(
      `The dealer takes ${commissionPctRaw}% of gross profit (${commissionAmount} ${currency}), agreed on the account.`
    );
  } else {
    assumptions.push(`The dealer takes a fixed ${commissionAmount} ${currency} on this order.`);
  }
  if (grossProfit < 0) {
    assumptions.push(
      'Gross profit is negative: the costs recorded on this order exceed the agreed sell total. Check the freight and destination figures before accepting it.'
    );
    if (fixed === null && commissionPctRaw > 0) {
      assumptions.push(
        `The dealer’s ${commissionPctRaw}% share of a loss is not charged back, so their share is held at zero and the whole loss (${grossProfit} ${currency}) is Himalayan Koh’s.`
      );
    }
  }

  return {
    currency,
    sellTotal,
    costTotal,
    freightTotal,
    otherCosts,
    totalCost,
    grossProfit,
    grossMarginPct: priced ? round((grossProfit / sellTotal) * 100, 2) : 0,
    markupPct: totalCost > 0 ? round((grossProfit / totalCost) * 100, 2) : 0,
    commissionPct: commissionPctRaw,
    commissionAmount,
    commissionBasis,
    dealerName: input.dealerName ?? null,
    hkNetProfit,
    hkNetMarginPct: priced ? round((hkNetProfit / sellTotal) * 100, 2) : 0,
    priced,
    assumptions,
  };
}

/** The stored columns of an order/quote row, as the profit engine needs them. */
export interface StoredProfitRow {
  currency?: unknown;
  sell_total?: unknown;
  cost_total?: unknown;
  freight_total?: unknown;
  other_costs?: unknown;
  commission_pct?: unknown;
  commission_amount?: unknown;
  totals?: unknown;
  has_dealer?: unknown;
}

function object(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }
  return {};
}

function firstNumber(...candidates: unknown[]): number {
  for (const candidate of candidates) {
    const parsed = Number(candidate);
    if (Number.isFinite(parsed) && parsed !== 0) return parsed;
  }
  return 0;
}

/**
 * Reads the profit inputs off a stored order row.
 *
 * The explicit columns win; the `totals` JSON is the fallback, because an order
 * raised before the profit columns existed still has `sellTotal` and `costTotal` on
 * its snapshot and must not read as an order with no margin. Anything genuinely absent
 * stays zero, and `computeProfit` says so in its assumptions rather than filling it in.
 */
export function profitInputFromRow(row: StoredProfitRow, dealerName?: string | null): ProfitInput {
  const totals = object(row.totals) as Partial<QuoteTotals> & Record<string, unknown>;
  const sellTotal = firstNumber(row.sell_total, totals.sellTotal);
  const costTotal = firstNumber(row.cost_total, totals.costTotal, totals.total, totals.merchandise);

  const commissionPct = Number(row.commission_pct) || 0;
  const storedAmount = Number(row.commission_amount);
  // The amount column holds two different things depending on how the share was
  // agreed: an agreed fixed figure, or the frozen value of a percentage share (which
  // an export reads so it does not have to redo the arithmetic). Reading the second
  // back as the first converts a share of profit into a fixed amount *silently* — the
  // screen then says the wrong thing and the stored figure starts winning over a
  // later rate change. So a stored amount counts as an agreed figure only when there
  // is no percentage share on the row at all. A non-positive amount is no amount.
  const commissionAmount =
    commissionPct > 0 || !Number.isFinite(storedAmount) || storedAmount <= 0 ? null : storedAmount;

  return {
    currency: typeof row.currency === 'string' && row.currency ? row.currency : 'USD',
    sellTotal,
    costTotal,
    freightTotal: firstNumber(row.freight_total, totals.oceanFreight),
    otherCosts: firstNumber(row.other_costs, totals.destinationCharges, totals.duty),
    commissionPct,
    commissionAmount,
    dealerName: dealerName ?? null,
  };
}

/** One order's contribution to the console's profit view. */
export interface OrderProfitLine {
  orderId: number;
  reference: string;
  accountId: number;
  accountName: string;
  status: string;
  dealerName: string | null;
  breakdown: ProfitBreakdown;
}

/** What the profit view totals, and over how many orders. */
export interface ProfitSummary {
  currency: string;
  orders: number;
  pricedOrders: number;
  sellTotal: number;
  totalCost: number;
  grossProfit: number;
  dealerCommission: number;
  hkNetProfit: number;
  /** Gross profit over sell total across the priced orders. */
  grossMarginPct: number;
  hkNetMarginPct: number;
  /** Orders whose costs exceed their sell total, by reference. */
  lossMaking: string[];
  /** Orders with no sell total yet — counted out of the percentages. */
  unpriced: string[];
  assumptions: string[];
}

/**
 * Totals across orders.
 *
 * Only priced orders contribute to the percentages: including a draft with no sell
 * total would drag the average margin down for no reason a reader could see.
 * Mixed currencies would be a lie added together, so a second currency is named in
 * the assumptions instead of being summed.
 */
export function summariseProfit(lines: OrderProfitLine[]): ProfitSummary {
  const currencies = [...new Set(lines.map((line) => line.breakdown.currency))];
  const currency = currencies[0] ?? 'USD';

  const priced = lines.filter((line) => line.breakdown.priced);
  const sum = (pick: (line: OrderProfitLine) => number) =>
    round(priced.reduce((total, line) => total + pick(line), 0), 2);

  const sellTotal = sum((line) => line.breakdown.sellTotal);
  const grossProfit = sum((line) => line.breakdown.grossProfit);
  const hkNetProfit = sum((line) => line.breakdown.hkNetProfit);

  const assumptions: string[] = [];
  if (currencies.length > 1) {
    assumptions.push(
      `These orders are priced in ${currencies.join(', ')}. The totals are ${currency} only; read the per-order lines for the rest rather than adding currencies together.`
    );
  }
  if (lines.length > priced.length) {
    assumptions.push(
      `${lines.length - priced.length} order(s) have no sell total yet, so they are listed but excluded from the margins.`
    );
  }

  return {
    currency,
    orders: lines.length,
    pricedOrders: priced.length,
    sellTotal,
    totalCost: sum((line) => line.breakdown.totalCost),
    grossProfit,
    dealerCommission: sum((line) => line.breakdown.commissionAmount),
    hkNetProfit,
    grossMarginPct: sellTotal > 0 ? round((grossProfit / sellTotal) * 100, 2) : 0,
    hkNetMarginPct: sellTotal > 0 ? round((hkNetProfit / sellTotal) * 100, 2) : 0,
    lossMaking: priced.filter((line) => line.breakdown.grossProfit < 0).map((line) => line.reference),
    unpriced: lines.filter((line) => !line.breakdown.priced).map((line) => line.reference),
    assumptions,
  };
}
