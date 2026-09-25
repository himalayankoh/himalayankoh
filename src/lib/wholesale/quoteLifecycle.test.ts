import { describe, expect, it } from 'vitest';

import {
  buildQuoteRevision,
  commercialSnapshotFromRow,
  daysUntilExpiry,
  describeRevision,
  diffCommercial,
  effectiveQuoteStatus,
  isQuoteExpired,
  revisionFromAuditRow,
  revisionHistory,
  validityDateFromDays,
  validitySentence,
} from './quoteLifecycle';

const NOW = new Date('2026-09-23T09:00:00.000Z');

describe('expiry', () => {
  it('is valid through the stated day, not just to its midnight', () => {
    expect(isQuoteExpired('2026-09-23', NOW)).toBe(false);
    expect(isQuoteExpired('2026-09-22', NOW)).toBe(true);
    expect(isQuoteExpired(null, NOW)).toBe(false);
    expect(isQuoteExpired('not a date', NOW)).toBe(false);
  });

  it('expires a waiting quote but never rewrites a closed one', () => {
    expect(effectiveQuoteStatus('QUOTED', '2026-09-01', NOW)).toBe('EXPIRED');
    expect(effectiveQuoteStatus('UNDER_REVIEW', '2026-09-01', NOW)).toBe('EXPIRED');
    expect(effectiveQuoteStatus('QUOTED', '2026-10-30', NOW)).toBe('QUOTED');
    // An accepted agreement is closed: it does not lapse because a date went by.
    expect(effectiveQuoteStatus('ACCEPTED', '2026-09-01', NOW)).toBe('ACCEPTED');
    expect(effectiveQuoteStatus('CONVERTED_TO_ORDER', '2026-09-01', NOW)).toBe('CONVERTED_TO_ORDER');
    expect(effectiveQuoteStatus('REJECTED', '2026-09-01', NOW)).toBe('REJECTED');
  });

  it('counts the days left and says something only when it matters', () => {
    expect(daysUntilExpiry('2026-09-26', NOW)).toBe(4);
    expect(validitySentence('2026-09-26', NOW)).toMatch(/valid for 4 more day/);
    expect(validitySentence('2026-11-30', NOW)).toBeNull();
    // Valid through the 20th, and it is the morning of the 23rd: two full days have
    // gone by, which is what the sentence says.
    expect(validitySentence('2026-09-20', NOW)).toMatch(/lapsed 2 day/);
    expect(validitySentence(null, NOW)).toBeNull();
  });

  it('clamps a validity window the owner typed absurdly', () => {
    expect(validityDateFromDays(30, NOW)).toBe('2026-10-23');
    expect(validityDateFromDays(0, NOW)).toBe('2026-10-23');
    expect(validityDateFromDays(-5, NOW)).toBe('2026-10-23');
  });
});

describe('commercial snapshots and revisions', () => {
  const row = {
    status: 'QUOTED',
    currency: 'USD',
    sell_total: 12_000,
    margin_pct: 18,
    incoterm: 'FOB',
    containers: 1,
    valid_until: '2026-10-30',
    destination_country: 'United States',
    totals: { total: 9_800, sellPerUnit: 2.4 },
    lines: [{ units: 5_000 }],
  };

  it('reads the figures a buyer can be held to', () => {
    const snapshot = commercialSnapshotFromRow(row);
    expect(snapshot.sellTotal).toBe(12_000);
    expect(snapshot.costTotal).toBe(9_800);
    expect(snapshot.sellPerUnit).toBe(2.4);
    expect(snapshot.validUntil).toBe('2026-10-30');
    expect(snapshot.destinationCountry).toBe('United States');
  });

  it('names exactly the fields that changed', () => {
    const before = commercialSnapshotFromRow(row);
    const after = commercialSnapshotFromRow({ ...row, sell_total: 12_400, valid_until: '2026-11-30' });
    expect(diffCommercial(before, after).sort()).toEqual(['sellTotal', 'validUntil']);
  });

  it('builds an append-only revision carrying both sides and the actor', () => {
    const before = commercialSnapshotFromRow(row);
    const after = commercialSnapshotFromRow({ ...row, sell_total: 12_400 });
    const audit = buildQuoteRevision({
      quoteRowId: 42,
      before,
      after,
      actor: 'owner@himalayankoh.com',
      reason: 'Freight re-quoted',
      previousRevision: 2,
      at: NOW,
    });

    expect(audit.action).toBe('QUOTE_REVISED');
    expect(audit.entity).toBe('quotes');
    expect(audit.entity_id).toBe(42);
    expect(audit.detail.revision).toBe(3);
    expect(audit.detail.reason).toBe('Freight re-quoted');
    expect(audit.detail.before.sellTotal).toBe(12_000);
    expect(audit.detail.after.sellTotal).toBe(12_400);
    expect(audit.detail.changed).toEqual(['sellTotal']);
  });

  it('turns a revision into human lines for the console', () => {
    const before = commercialSnapshotFromRow(row);
    const after = commercialSnapshotFromRow({ ...row, sell_total: 12_400, margin_pct: 20 });
    const revision = buildQuoteRevision({ quoteRowId: 1, before, after, actor: 'a', at: NOW }).detail;

    expect(revision.changed).toContain('marginPct');
    const lines = describeRevision(revision);
    expect(lines.some((line) => line.startsWith('Sell total: 12,000 → 12,400'))).toBe(true);
  });

  it('parses only its own audit rows, newest first', () => {
    const before = commercialSnapshotFromRow(row);
    const after = commercialSnapshotFromRow({ ...row, sell_total: 12_400 });
    const stored = buildQuoteRevision({ quoteRowId: 7, before, after, actor: 'owner', at: NOW });

    const rows = [
      { action: 'RECORD_SAVED', entity: 'products', detail: { anything: true } },
      stored as unknown as Record<string, unknown>,
      {
        action: 'QUOTE_REVISED',
        at: '2026-09-24T10:00:00.000Z',
        actor: 'owner',
        detail: { revision: 2, at: '2026-09-24T10:00:00.000Z', actor: 'owner', changed: [], before, after },
      },
    ];

    const history = revisionHistory(rows);
    expect(history).toHaveLength(2);
    expect(history[0].revision).toBe(2);
    expect(history[1].revision).toBe(1);
    expect(revisionFromAuditRow({ action: 'RECORD_SAVED' })).toBeNull();
  });
});
