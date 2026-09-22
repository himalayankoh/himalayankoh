import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The legacy adapter's two promises: it never writes, and it never asks the
 * database a question the database will reject.
 *
 * The second one is not theoretical — Postgres answers a non-UUID id with a cast
 * error rather than an empty result, so a shopper who mistypes a numeric id used to
 * turn into a 500 instead of a 404. These tests pin the guard that fixes it.
 */

const state = {
  configured: true,
  queried: false,
  row: null as Record<string, unknown> | null,
};

vi.mock('@/lib/supabase/client', () => ({
  isSupabaseConfigured: () => state.configured,
}));

vi.mock('@/lib/stripe/server/supabaseAdmin', () => ({
  getSupabaseAdmin: () => ({
    from: () => {
      state.queried = true;
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => ({ data: state.row, error: null }),
      };
      return chain;
    },
  }),
}));

import { getLegacyOrderForViewer, isLegacyOrderStoreAvailable } from './legacyOrders';

beforeEach(() => {
  state.configured = true;
  state.queried = false;
  state.row = null;
});

describe('isLegacyOrderStoreAvailable', () => {
  it('follows the Supabase configuration, so a WordPress-only deploy skips it', () => {
    expect(isLegacyOrderStoreAvailable()).toBe(true);
    state.configured = false;
    expect(isLegacyOrderStoreAvailable()).toBe(false);
  });
});

describe('getLegacyOrderForViewer', () => {
  it('answers a non-UUID id without querying the database', async () => {
    const result = await getLegacyOrderForViewer('999999', null);

    expect(result).toBeNull();
    expect(state.queried).toBe(false);
  });

  it('queries a UUID id', async () => {
    await getLegacyOrderForViewer('5f0c2f8e-1a2b-4c3d-8e4f-5a6b7c8d9e0f', null);

    expect(state.queried).toBe(true);
  });

  it('does not query at all when the legacy store is not configured', async () => {
    state.configured = false;

    await getLegacyOrderForViewer('5f0c2f8e-1a2b-4c3d-8e4f-5a6b7c8d9e0f', null);

    expect(state.queried).toBe(false);
  });

  it('shows a guest only an ownerless legacy order', async () => {
    state.row = { id: '5f0c2f8e-1a2b-4c3d-8e4f-5a6b7c8d9e0f', user_id: 'some-user', email: 'a@b.com' };

    const result = await getLegacyOrderForViewer('5f0c2f8e-1a2b-4c3d-8e4f-5a6b7c8d9e0f', null);

    expect(result).toBeNull();
  });

  it('matches a signed-in shopper by the email the legacy row recorded', async () => {
    state.row = {
      id: '5f0c2f8e-1a2b-4c3d-8e4f-5a6b7c8d9e0f',
      user_id: 'old-supabase-id',
      email: 'Shopper@Example.com',
      order_items: [],
    };

    const result = await getLegacyOrderForViewer('5f0c2f8e-1a2b-4c3d-8e4f-5a6b7c8d9e0f', 'shopper@example.com');

    expect(result).not.toBeNull();
  });

  it('does not show a signed-in shopper somebody else’s legacy order', async () => {
    state.row = {
      id: '5f0c2f8e-1a2b-4c3d-8e4f-5a6b7c8d9e0f',
      user_id: 'old-supabase-id',
      email: 'other@example.com',
      order_items: [],
    };

    const result = await getLegacyOrderForViewer('5f0c2f8e-1a2b-4c3d-8e4f-5a6b7c8d9e0f', 'shopper@example.com');

    expect(result).toBeNull();
  });
});
