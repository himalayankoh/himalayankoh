import { describe, expect, it } from 'vitest';

import {
  buyerConfidence,
  buyerOrderView,
  buyerQuoteView,
  confidenceNote,
  isExpired,
} from './buyerView';

/**
 * These tests exist for two promises that are easy to break by accident:
 *
 *  1. a buyer is never shown the cost side of a quotation, and
 *  2. a number is never presented as firmer than it is.
 *
 * Both are the kind of failure that looks like a working screen.
 */

const AT = new Date('2026-09-23T00:00:00.000Z');

/** A stored quote with everything the row can carry, cost side included. */
const STORED_QUOTE = {
  id: 12,
  ref: 'HK-WS-Q00012',
  account_id: 3,
  status: 'QUOTED',
  incoterm: 'CIF',
  containers: 1,
  currency: 'USD',
  destination_country: 'United States',
  destination_port: 'USHOU',
  lines: [
    { name: 'Fine Grain 25 kg', wholesaleSku: 'HK-WS-FINE', units: 1000, cartons: 250, pallets: 5, netWeightKg: 2500 },
  ],
  totals: { merchandise: 18_500, oceanFreight: 2_580, total: 24_291.4, perUnit: 24.2914, currency: 'USD' },
  margin_pct: 22,
  sell_total: 31_000,
  valid_until: '2026-10-20T00:00:00.000Z',
  created_at: '2026-09-20T10:00:00.000Z',
  updated_at: '2026-09-21T10:00:00.000Z',
  notes: null,
};

describe('price firmness', () => {
  it('treats a passed validity date as expired, before anyone changes the status', () => {
    expect(buyerConfidence('QUOTED', '2026-09-01T00:00:00.000Z', AT)).toBe('EXPIRED');
    expect(buyerConfidence('ACCEPTED', '2026-09-01T00:00:00.000Z', AT)).toBe('EXPIRED');
  });

  it('keeps an in-date quotation confirmed and an unpriced request indicative', () => {
    expect(buyerConfidence('QUOTED', '2026-10-20T00:00:00.000Z', AT)).toBe('CONFIRMED');
    expect(buyerConfidence('SUBMITTED', null, AT)).toBe('INDICATIVE');
    expect(buyerConfidence('UNDER_REVIEW', null, AT)).toBe('UNDER_REVIEW');
    expect(buyerConfidence('DRAFT', null, AT)).toBe('INDICATIVE');
  });

  it('never calls a rate with no stated validity expired, and never calls it a promise either', () => {
    expect(isExpired(null, AT)).toBe(false);
    expect(buyerConfidence('QUOTED', null, AT)).toBe('CONFIRMED');
  });

  it('says something different for each state', () => {
    const notes = new Set(
      (['CONFIRMED', 'INDICATIVE', 'UNDER_REVIEW', 'EXPIRED'] as const).map((state) => confidenceNote(state))
    );
    expect(notes.size).toBe(4);
  });
});

describe('what a buyer is shown', () => {
  const view = buyerQuoteView(STORED_QUOTE, AT);

  it('carries the quoted sell total and a per-unit price derived from it', () => {
    expect(view.totals.quotedTotal).toBe(31_000);
    expect(view.totals.perUnit).toBe(31);
    expect(view.awaitingQuotation).toBe(false);
  });

  it('carries no cost-side figure at all', () => {
    const serialised = JSON.stringify(view);
    // The cost breakdown's own numbers must not survive the projection in any form.
    expect(serialised).not.toContain('18500');
    expect(serialised).not.toContain('24291');
    expect(serialised).not.toContain('merchandise');
    expect(serialised).not.toContain('oceanFreight');
    expect(serialised).not.toContain('margin');
  });

  it('shows an unpriced request as awaiting a quotation, not as a zero', () => {
    const pending = buyerQuoteView({ ...STORED_QUOTE, status: 'SUBMITTED', sell_total: 0, totals: {} }, AT);
    expect(pending.totals.quotedTotal).toBeNull();
    expect(pending.totals.perUnit).toBeNull();
    expect(pending.awaitingQuotation).toBe(true);
    expect(pending.lines[0].unitPrice).toBeNull();
  });

  it('keeps the load plan, because the buyer supplied those quantities', () => {
    expect(view.totals.units).toBe(1000);
    expect(view.totals.pallets).toBe(5);
    expect(view.lines[0].cartons).toBe(250);
  });
});

describe('orders', () => {
  it('reports the balance from the recorded payment, not from the retail order book', () => {
    const view = buyerOrderView({
      id: 4,
      ref: 'HK-WS-O00004',
      status: 'AWAITING_DEPOSIT',
      incoterm: 'CIF',
      currency: 'USD',
      destination_country: 'United States',
      plan: { units: 1000, cartons: 250, pallets: 5 },
      totals: { sellTotal: 31_000 },
      payment_terms: { label: 'Deposit then balance before shipment', depositPct: 30 },
      sell_total: 31_000,
      paid_amount: 9_300,
      created_at: '2026-09-22T00:00:00.000Z',
      updated_at: '2026-09-22T00:00:00.000Z',
    });

    expect(view.total).toBe(31_000);
    expect(view.balanceDue).toBe(21_700);
    expect(view.depositPct).toBe(30);
    expect(view.pallets).toBe(5);
  });
});


describe('inquiry snapshots and external invoice links', () => {
  it('preserves estimated merchandise without turning it into a confirmed quotation', () => {
    const view = buyerQuoteView({ ...STORED_QUOTE, status: 'SUBMITTED', lines: [{ name: 'Salt', units: 2, unitPriceIndicative: 9.07 }] });
    expect(view.estimatedTotal).toBe(18.14);
    expect(view.totals.quotedTotal).toBeNull();
  });
  it('does not invent identical unit prices from a mixed-SKU final total', () => {
    const view = buyerQuoteView({ ...STORED_QUOTE, sell_total: 23.04, lines: [
      { name: '2 lb lick', units: 1, unitPriceIndicative: 9.07 },
      { name: '6 lb lick', units: 1, unitPriceIndicative: 13.97 },
    ] }, AT);
    expect(view.totals.quotedTotal).toBe(23.04);
    expect(view.totals.perUnit).toBeNull();
    expect(view.lines.every((line) => line.unitPrice === null && line.lineTotal === null)).toBe(true);
    expect(view.estimatedTotal).toBe(23.04);
  });
  it('rejects unsafe URLs and hides payment links on unconfirmed inquiries', () => {
    const view = buyerQuoteView({ ...STORED_QUOTE, status: 'SUBMITTED', invoice_url: 'javascript:alert(1)', external_payment_url: 'https://pay.example.invalid' });
    expect(view.invoiceUrl).toBeNull(); expect(view.externalPaymentUrl).toBeNull();
  });
  it('exposes only a confirmed HTTPS invoice/payment link, never internal notes', () => {
    const view = buyerQuoteView({ ...STORED_QUOTE, invoice_url: 'https://example.invalid/invoice', external_payment_url: 'https://pay.example.invalid/', internal_notes: 'Private desk note' }, AT);
    expect(view.invoiceUrl).toContain('/invoice'); expect(view.externalPaymentUrl).toContain('pay.example.invalid');
    expect(JSON.stringify(view)).not.toContain('Private desk note');
  });
});
