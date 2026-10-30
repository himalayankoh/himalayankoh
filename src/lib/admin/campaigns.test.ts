import { describe, expect, it } from 'vitest';
import { effectiveStatus, validateCampaign, type Campaign } from './campaigns';

/**
 * Campaign rules.
 *
 * Two things are pinned here because they are the promises the screen makes: a
 * campaign cannot be called ready without the parts that make it a campaign, and a
 * status that depends on the clock is derived rather than asserted.
 */

function campaign(overrides: Partial<Campaign> = {}): Campaign {
  return {
    id: 'cmp_1',
    name: 'Spring restock',
    goal: 'Clear the 8×4×1 block stock',
    audience: 'Repeat buyers in Texas',
    brief: 'Email the block offer to buyers who ordered in the last year.',
    startsAt: null,
    endsAt: null,
    productIds: [2400],
    couponCode: null,
    status: 'draft',
    createdAt: '2026-09-18T00:00:00.000Z',
    updatedAt: '2026-09-18T00:00:00.000Z',
    ...overrides,
  };
}

describe('validation', () => {
  it('accepts a campaign with all five required parts', () => {
    expect(validateCampaign(campaign()).ok).toBe(true);
  });

  it('refuses a campaign without a name', () => {
    const result = validateCampaign(campaign({ name: '   ' }));
    expect(result.ok).toBe(false);
    expect(result.problems.join(' ')).toMatch(/needs a name/i);
  });

  it('refuses a campaign without a product to feature', () => {
    const result = validateCampaign(campaign({ productIds: [] }));
    expect(result.ok).toBe(false);
    expect(result.problems.join(' ')).toMatch(/at least one product/i);
  });

  it('lists every reason it is not ready, not just the first', () => {
    const result = validateCampaign(campaign({ goal: '', audience: '', brief: '', productIds: [] }));
    expect(result.problems.length).toBe(4);
  });

  it('refuses an end date that is not after the start', () => {
    const result = validateCampaign(
      campaign({ startsAt: '2026-10-01T00:00:00.000Z', endsAt: '2026-09-01T00:00:00.000Z' })
    );
    expect(result.ok).toBe(false);
    expect(result.problems.join(' ')).toMatch(/end date is not after/i);
  });

  it('allows a schedule that is open-ended', () => {
    expect(validateCampaign(campaign({ startsAt: '2026-10-01T00:00:00.000Z' })).ok).toBe(true);
  });
});

describe('derived status', () => {
  const now = new Date('2026-09-18T12:00:00Z');

  it('leaves a draft alone whatever its dates say', () => {
    const draft = campaign({ status: 'draft', startsAt: '2020-01-01T00:00:00.000Z' });
    expect(effectiveStatus(draft, now)).toBe('draft');
  });

  it('is scheduled before its window opens', () => {
    const ready = campaign({ status: 'ready', startsAt: '2026-10-01T00:00:00.000Z' });
    expect(effectiveStatus(ready, now)).toBe('scheduled');
  });

  it('is running inside its window', () => {
    const ready = campaign({
      status: 'ready',
      startsAt: '2026-09-01T00:00:00.000Z',
      endsAt: '2026-10-01T00:00:00.000Z',
    });
    expect(effectiveStatus(ready, now)).toBe('running');
  });

  it('is completed once its end has passed, without anyone editing it', () => {
    const ready = campaign({
      status: 'ready',
      startsAt: '2026-08-01T00:00:00.000Z',
      endsAt: '2026-09-01T00:00:00.000Z',
    });
    expect(effectiveStatus(ready, now)).toBe('completed');
  });

  it('is only ready when it has no schedule at all', () => {
    expect(effectiveStatus(campaign({ status: 'ready' }), now)).toBe('ready');
  });
});
