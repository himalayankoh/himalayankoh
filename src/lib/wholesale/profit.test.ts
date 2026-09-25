import { describe, expect, it } from 'vitest';

import {
  computeProfit,
  profitInputFromRow,
  summariseProfit,
  WholesaleProfitError,
  type OrderProfitLine,
} from './profit';

const dealerOrder = {
  currency: 'USD',
  sellTotal: 50_000,
  costTotal: 38_000,
  freightTotal: 3_600,
  otherCosts: 400,
  commissionPct: 20,
};

describe('order profit', () => {
  it('subtracts every cost, then the dealer, and names both', () => {
    const profit = computeProfit(dealerOrder);

    expect(profit.totalCost).toBe(42_000);
    expect(profit.grossProfit).toBe(8_000);
    expect(profit.commissionBasis).toBe('GROSS_PROFIT_SHARE');
    // 20% of gross profit, not 20% of the invoice: the distinction is the whole point.
    expect(profit.commissionAmount).toBe(1_600);
    expect(profit.hkNetProfit).toBe(6_400);
    expect(profit.grossMarginPct).toBe(16);
    expect(profit.hkNetMarginPct).toBe(12.8);
    expect(profit.markupPct).toBe(19.05);
  });

  it('leaves the whole gross profit with Himalayan Koh when there is no dealer', () => {
    const profit = computeProfit({ ...dealerOrder, commissionPct: 0 });
    expect(profit.commissionBasis).toBe('NONE');
    expect(profit.commissionAmount).toBe(0);
    expect(profit.hkNetProfit).toBe(profit.grossProfit);
  });

  it('honours a fixed dealer amount over a percentage', () => {
    const profit = computeProfit({ ...dealerOrder, commissionAmount: 2_500 });
    expect(profit.commissionBasis).toBe('FIXED_AMOUNT');
    expect(profit.commissionAmount).toBe(2_500);
    expect(profit.hkNetProfit).toBe(5_500);
  });

  it('treats an order with no sell total as a draft, not as zero margin', () => {
    const profit = computeProfit({ ...dealerOrder, sellTotal: 0 });
    expect(profit.priced).toBe(false);
    expect(profit.hkNetMarginPct).toBe(0);
    expect(profit.assumptions.join(' ')).toMatch(/not a result|cost picture/i);
  });

  it('says when freight is missing, because it changes the margin', () => {
    const profit = computeProfit({ ...dealerOrder, freightTotal: 0 });
    expect(profit.assumptions.join(' ')).toMatch(/freight is recorded/i);
  });

  it('flags a loss instead of presenting a negative margin as a result', () => {
    const profit = computeProfit({ ...dealerOrder, sellTotal: 40_000 });
    expect(profit.grossProfit).toBeLessThan(0);
    expect(profit.assumptions.join(' ')).toMatch(/negative/i);
  });

  it('refuses a negative amount and an impossible commission', () => {
    expect(() => computeProfit({ ...dealerOrder, costTotal: -1 })).toThrow(WholesaleProfitError);
    expect(() => computeProfit({ ...dealerOrder, commissionPct: 140 })).toThrow(/cannot exceed 100%/);
  });

  it('holds a dealer’s share of a loss at zero instead of charging it back', () => {
    // A live staging sale below cost stored a negative dealer amount, and a negative
    // amount is refused everywhere else — so reading the order back threw and the
    // whole margin screen answered 400. A share of profit is not a share of a loss.
    const loss = computeProfit({ ...dealerOrder, sellTotal: 40_000, commissionPct: 10 });
    expect(loss.grossProfit).toBeLessThan(0);
    expect(loss.commissionAmount).toBe(0);
    expect(loss.hkNetProfit).toBe(loss.grossProfit);
    expect(loss.assumptions.join(' ')).toMatch(/held at zero/i);
  });

  it('never produces a breakdown that its own reader would refuse', () => {
    // The round trip that failed live: compute → store → read back → compute again.
    for (const sellTotal of [0, 40_000, 90_000]) {
      for (const commissionPct of [0, 10, 20]) {
        const first = computeProfit({ ...dealerOrder, sellTotal, commissionPct });
        const stored = {
          currency: 'USD',
          sell_total: first.sellTotal,
          cost_total: first.costTotal,
          freight_total: first.freightTotal,
          other_costs: first.otherCosts,
          commission_pct: first.commissionPct,
          commission_amount: first.commissionAmount,
        };
        const again = computeProfit(profitInputFromRow(stored));
        expect(again.hkNetProfit).toBe(first.hkNetProfit);
        expect(again.commissionAmount).toBe(first.commissionAmount);
        expect(again.commissionBasis).toBe(first.commissionBasis);
      }
    }
  });
});

describe('reading a stored order', () => {
  it('prefers the explicit columns and falls back to the frozen totals', () => {
    const fromColumns = profitInputFromRow({ currency: 'USD', sell_total: 1_000, cost_total: 700 });
    expect(fromColumns.sellTotal).toBe(1_000);
    expect(fromColumns.costTotal).toBe(700);

    const fromTotals = profitInputFromRow({
      currency: 'USD',
      totals: { sellTotal: 2_000, total: 1_500, oceanFreight: 250, destinationCharges: 100 },
    });
    expect(fromTotals.sellTotal).toBe(2_000);
    expect(fromTotals.costTotal).toBe(1_500);
    expect(fromTotals.freightTotal).toBe(250);
    expect(fromTotals.otherCosts).toBe(100);
  });

  it('treats a zero stored commission as "no override", not as a 0% agreement', () => {
    expect(profitInputFromRow({ commission_pct: 0, commission_amount: 0 }).commissionAmount).toBeNull();
  });

  it('does not read a percentage order’s frozen amount back as a fixed amount', () => {
    // The column carries the *computed* figure for a share of profit, so treating it
    // as an agreed fixed amount made the screen report the wrong basis and let the
    // stored figure start winning over a later rate change.
    const share = profitInputFromRow({ commission_pct: 20, commission_amount: 1_488.73 });
    expect(share.commissionPct).toBe(20);
    expect(share.commissionAmount).toBeNull();
    expect(computeProfit(share).commissionBasis).toBe('GROSS_PROFIT_SHARE');

    const agreed = profitInputFromRow({ commission_pct: 0, commission_amount: 900 });
    expect(agreed.commissionAmount).toBe(900);
    expect(computeProfit(agreed).commissionBasis).toBe('FIXED_AMOUNT');
  });

  it('ignores a negative stored amount rather than failing the whole read', () => {
    // A row written before the zero-floor existed must still be readable.
    const legacy = profitInputFromRow({ currency: 'USD', sell_total: 1_000, cost_total: 1_400, commission_pct: 10, commission_amount: -40 });
    expect(legacy.commissionAmount).toBeNull();
    expect(() => computeProfit(legacy)).not.toThrow();
  });
});

describe('profit across orders', () => {
  const line = (reference: string, overrides: Partial<Parameters<typeof computeProfit>[0]>): OrderProfitLine => ({
    orderId: 1,
    reference,
    accountId: 7,
    accountName: 'Karachi Traders',
    status: 'CONFIRMED',
    dealerName: 'Karachi Traders',
    breakdown: computeProfit({ ...dealerOrder, ...overrides }),
  });

  it('totals the priced orders and reports the margins over them', () => {
    const summary = summariseProfit([line('A', {}), line('B', { sellTotal: 20_000, costTotal: 16_000, freightTotal: 0, otherCosts: 0 })]);

    expect(summary.orders).toBe(2);
    expect(summary.pricedOrders).toBe(2);
    // A: gross 8,000 → dealer 1,600 → net 6,400. B: gross 4,000 → dealer 800 → net 3,200.
    expect(summary.sellTotal).toBe(70_000);
    expect(summary.grossProfit).toBe(12_000);
    expect(summary.totalCost).toBe(58_000);
    expect(summary.dealerCommission).toBe(2_400);
    expect(summary.hkNetProfit).toBe(9_600);
    expect(summary.grossMarginPct).toBe(17.14);
  });

  it('lists unpriced orders and keeps them out of the percentages', () => {
    const summary = summariseProfit([line('A', {}), line('DRAFT-1', { sellTotal: 0 })]);
    expect(summary.unpriced).toEqual(['DRAFT-1']);
    expect(summary.pricedOrders).toBe(1);
    expect(summary.grossMarginPct).toBe(16);
    expect(summary.assumptions.join(' ')).toMatch(/no sell total yet/i);
  });

  it('names a loss-making order rather than folding it into an average', () => {
    const summary = summariseProfit([line('A', {}), line('LOSS-9', { sellTotal: 30_000 })]);
    expect(summary.lossMaking).toEqual(['LOSS-9']);
  });

  it('never adds one currency to another', () => {
    const summary = summariseProfit([line('A', {}), line('EUR-1', { currency: 'EUR' })]);
    expect(summary.currency).toBe('USD');
    expect(summary.assumptions.join(' ')).toMatch(/priced in USD, EUR/);
  });
});
