import { describe, expect, it } from 'vitest';

import {
  consoleStatusFromWoo,
  isPublicWooStatus,
  wooListingStatusFrom,
  wooListingStatusOrDraft,
} from './productStatus';
import type { ConsoleProductStatus } from './productStatus';

/**
 * The regression these tests exist for, measured live on staging: a product the
 * owner saved as a draft came back from a later save as WooCommerce `private`.
 * The console had read every non-published state as one word and written that
 * word back as `private`, so `draft` was not a state the editor could keep.
 */
describe('console status → WooCommerce status', () => {
  it('publishes only Live', () => {
    expect(wooListingStatusFrom('active')).toBe('publish');
  });

  it('keeps Draft as draft', () => {
    expect(wooListingStatusFrom('draft')).toBe('draft');
  });

  it('writes Inactive and Archived as private, the store’s not-public state', () => {
    expect(wooListingStatusFrom('inactive')).toBe('private');
    expect(wooListingStatusFrom('archived')).toBe('private');
  });

  it('keeps Ready and Safety hold out of the storefront', () => {
    expect(wooListingStatusFrom('ready')).toBe('draft');
    expect(wooListingStatusFrom('safety_hold')).toBe('draft');
  });

  it('accepts WooCommerce’s own words, so a caller may send either vocabulary', () => {
    expect(wooListingStatusFrom('publish')).toBe('publish');
    expect(wooListingStatusFrom('private')).toBe('private');
  });

  it('refuses a word that is neither, rather than guessing', () => {
    expect(wooListingStatusFrom('Live')).toBeNull();
    expect(wooListingStatusFrom('published')).toBeNull();
    expect(wooListingStatusFrom('')).toBeNull();
    expect(wooListingStatusFrom(undefined)).toBeNull();
    expect(wooListingStatusFrom('trash')).toBeNull();
  });

  it('treats an unreadable status as a draft when the caller is internal', () => {
    expect(wooListingStatusOrDraft('publish')).toBe('publish');
    expect(wooListingStatusOrDraft('nonsense')).toBe('draft');
  });
});

describe('WooCommerce status → console status', () => {
  it('reads the three primary states as themselves', () => {
    expect(consoleStatusFromWoo('publish')).toBe('active');
    expect(consoleStatusFromWoo('draft')).toBe('draft');
    expect(consoleStatusFromWoo('private')).toBe('inactive');
  });

  it('reads pending as a draft: submitted, not published', () => {
    expect(consoleStatusFromWoo('pending')).toBe('draft');
  });

  it('reads a status the editor does not offer as a draft, never as live', () => {
    for (const value of ['trash', 'future', 'inherit', '', undefined, null, 'weird']) {
      expect(consoleStatusFromWoo(value)).toBe('draft');
      expect(isPublicWooStatus(value)).toBe(false);
    }
  });
});

describe('round trips', () => {
  /**
   * Every supported round trip, in the order the request names them. The three
   * primary states are exact; the two folds are asserted as folds so a future
   * edit cannot change one silently.
   */
  const EXACT: ConsoleProductStatus[] = ['active', 'draft', 'inactive'];
  const FOLDED: Array<[ConsoleProductStatus, ConsoleProductStatus]> = [
    ['ready', 'draft'],
    ['archived', 'inactive'],
    ['safety_hold', 'draft'],
  ];

  it.each(EXACT)('%s survives a save and a reload unchanged', (status) => {
    const stored = wooListingStatusFrom(status);
    expect(stored).not.toBeNull();
    expect(consoleStatusFromWoo(stored)).toBe(status);
  });

  it.each(FOLDED)('%s is stored as a real Woo status and reads back as %s', (status, expected) => {
    const stored = wooListingStatusFrom(status);
    expect(stored).not.toBeNull();
    expect(consoleStatusFromWoo(stored)).toBe(expected);
    // A fold must never make something public that was not.
    expect(isPublicWooStatus(stored)).toBe(status === 'active');
  });

  it('never turns a draft into private, which was the live defect', () => {
    expect(consoleStatusFromWoo(wooListingStatusFrom('draft'))).toBe('draft');
  });
});
