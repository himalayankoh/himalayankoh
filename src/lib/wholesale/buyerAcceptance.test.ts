import { describe, expect, it } from 'vitest';

import { buyerAcceptance } from './buyerAcceptance';

const NOW = new Date('2026-09-23T09:00:00.000Z');

/**
 * Every branch of the one decision that commits a buyer's money.
 *
 * A drifted acceptance rule is a price accepted after it expired, so each case below is
 * pinned rather than trusted to the handler: priced, expired-by-date, already accepted,
 * not priced, and everything else.
 */
describe('buyer acceptance verdict', () => {
  it('accepts a live quotation', () => {
    const verdict = buyerAcceptance({ status: 'QUOTED', valid_until: '2026-10-30' }, NOW);
    expect(verdict.ok).toBe(true);
    expect(verdict.status).toBe(200);
    expect(verdict.code).toBe('accepted');
  });

  it('accepts a quotation with no validity date — an absent date is not a promise to break', () => {
    expect(buyerAcceptance({ status: 'QUOTED', valid_until: null }, NOW).ok).toBe(true);
    expect(buyerAcceptance({ status: 'QUOTED' }, NOW).ok).toBe(true);
  });

  it('refuses a quotation past its validity date even though the row still says QUOTED', () => {
    const verdict = buyerAcceptance({ status: 'QUOTED', valid_until: '2026-09-01' }, NOW);
    expect(verdict.ok).toBe(false);
    expect(verdict.status).toBe(409);
    expect(verdict.code).toBe('expired');
    expect(verdict.message).toMatch(/expired/i);
  });

  it('treats the stated day as valid to the end of that day', () => {
    expect(buyerAcceptance({ status: 'QUOTED', valid_until: '2026-09-23' }, NOW).ok).toBe(true);
  });

  it('refuses a quotation the buyer has already accepted or converted', () => {
    for (const status of ['ACCEPTED', 'CONVERTED_TO_ORDER']) {
      const verdict = buyerAcceptance({ status }, NOW);
      expect(verdict.ok).toBe(false);
      expect(verdict.status).toBe(409);
      expect(verdict.code).toBe('already_accepted');
    }
  });

  it('refuses a request nobody has priced yet', () => {
    for (const status of ['SUBMITTED', 'UNDER_REVIEW']) {
      const verdict = buyerAcceptance({ status }, NOW);
      expect(verdict.ok).toBe(false);
      expect(verdict.status).toBe(409);
      expect(verdict.code).toBe('not_priced');
    }
  });

  it('refuses our own working draft and every unknown state', () => {
    for (const status of ['DRAFT', 'REJECTED', 'EXPIRED', 'SUSPENDED', 'WHATEVER', '']) {
      const verdict = buyerAcceptance({ status }, NOW);
      expect(verdict.ok).toBe(false);
      expect(verdict.status).toBe(409);
      expect(verdict.code).toBe('not_acceptable');
    }
  });

  it('does not widen access: a missing row is not acceptable', () => {
    expect(buyerAcceptance(null, NOW).ok).toBe(false);
    expect(buyerAcceptance(undefined, NOW).code).toBe('not_acceptable');
  });

  it('reads a lower-cased stored status the same way', () => {
    expect(buyerAcceptance({ status: 'quoted', valid_until: '2026-10-30' }, NOW).ok).toBe(true);
    expect(buyerAcceptance({ status: 'accepted' }, NOW).code).toBe('already_accepted');
  });
});
