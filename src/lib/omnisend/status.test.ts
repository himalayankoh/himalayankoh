import { afterEach, describe, expect, it, vi } from 'vitest';

const credential = vi.hoisted(() => ({
  current: { key: null as string | null, source: null as 'wordpress' | 'env' | null, storeFailure: null as null | { kind: string; status: number | null; message: string } },
}));

vi.mock('./client', () => ({
  resolveOmnisendCredential: vi.fn(async () => credential.current),
}));

import { readOmnisendStatus } from './status';

function res(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

afterEach(() => {
  vi.unstubAllGlobals();
  credential.current = { key: null, source: null, storeFailure: null };
});

describe('readOmnisendStatus', () => {
  it('reports a WordPress failure as unavailable, not as a missing key', async () => {
    credential.current = {
      key: null,
      source: null,
      storeFailure: { kind: 'wordpress_unavailable', status: null, message: 'store timed out' },
    };

    const status = await readOmnisendStatus();

    expect(status.state).toBe('wordpress_unavailable');
    expect(status.configured).toBe(false);
    // The owner must not be told to paste a key for a store that never answered.
    expect(status.message).toMatch(/not the same as a missing key/i);
    expect(status.retryable).toBe(true);
  });

  it('reports a genuinely absent key as missing', async () => {
    credential.current = { key: null, source: null, storeFailure: null };

    const status = await readOmnisendStatus();

    expect(status.state).toBe('missing');
    expect(status.action).toMatch(/app\.omnisend\.com/i);
  });

  it('maps a 401 to invalid_key without claiming connected', async () => {
    credential.current = { key: 'k', source: 'wordpress', storeFailure: null };
    vi.stubGlobal('fetch', vi.fn(async () => res(401, { error: 'unauthorized' })));

    const status = await readOmnisendStatus();

    expect(status.state).toBe('invalid_key');
    expect(status.connected).toBe(false);
    expect(status.configured).toBe(true);
    expect(status.providerStatus).toBe(401);
  });

  it('maps a 403 to insufficient_permissions', async () => {
    credential.current = { key: 'k', source: 'wordpress', storeFailure: null };
    vi.stubGlobal('fetch', vi.fn(async () => res(403, { error: 'forbidden' })));

    expect((await readOmnisendStatus()).state).toBe('insufficient_permissions');
  });

  it('treats a network failure as a provider outage, not a rejected key', async () => {
    credential.current = { key: 'k', source: 'env', storeFailure: null };
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('fetch failed');
    }));

    const status = await readOmnisendStatus();

    expect(status.state).toBe('provider_unavailable');
    expect(status.configured).toBe(true);
    expect(status.source).toBe('env');
    expect(status.retryable).toBe(true);
  });

  it('does not report a 200 without an account record as connected', async () => {
    credential.current = { key: 'k', source: 'wordpress', storeFailure: null };
    vi.stubGlobal('fetch', vi.fn(async () => res(200, { marker: 'something else' })));

    const status = await readOmnisendStatus();

    expect(status.state).toBe('provider_unavailable');
    expect(status.brandID).toBeNull();
  });

  it('reports connected only from the provider response, with counts and no subscriber identities', async () => {
    credential.current = { key: 'k', source: 'wordpress', storeFailure: null };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.endsWith('/accounts')) {
          return res(200, {
            brandID: 'brand-123',
            name: 'Himalayan Koh',
            website: 'himalayankoh.com',
            verified: false,
            apiKeyPermissions: { contacts: true, campaigns: true, lists: false },
          });
        }
        if (url.includes('status=subscribed')) {
          return res(200, {
            contacts: [{ email: 'someone@example.com' }, { email: 'second@example.com' }],
            paging: { next: null },
          });
        }
        if (url.includes('status=unsubscribed')) {
          return res(200, { contacts: [{ email: 'gone@example.com' }], paging: { next: null } });
        }
        return res(200, {
          campaigns: [
            { id: 'c1', name: 'Autumn', status: 'draft', createdAt: '2026-10-01T00:00:00Z' },
            { id: 'c2', name: 'Welcome', status: 'sent', createdAt: '2026-09-01T00:00:00Z' },
          ],
        });
      }),
    );

    const status = await readOmnisendStatus({ fresh: true });

    expect(status.state).toBe('connected');
    expect(status.connected).toBe(true);
    expect(status.brandID).toBe('brand-123');
    expect(status.accountName).toBe('Himalayan Koh');
    expect(status.subscribedCount).toBe(2);
    expect(status.unsubscribedCount).toBe(1);
    expect(status.contactsCount).toBe(3);
    expect(status.campaignsDraftCount).toBe(1);
    expect(status.domainVerified).toBe(false);

    // The payload is shown to an admin screen; subscriber identities must not be in it.
    expect(JSON.stringify(status)).not.toContain('someone@example.com');
    expect(JSON.stringify(status)).not.toContain('gone@example.com');
    // No invented fallbacks.
    expect(JSON.stringify(status)).not.toContain('6ad2c802990511dbe285b33e');
  });

  it('reports a truncated contact page as unavailable instead of presenting it as the whole list', async () => {
    credential.current = { key: 'k', source: 'wordpress', storeFailure: null };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.endsWith('/accounts')) {
          return res(200, { brandID: 'brand-123', name: 'Himalayan Koh', verified: true });
        }
        if (url.includes('/contacts')) {
          return res(200, { contacts: [{ email: 'a@example.com' }], paging: { next: 'cursor' } });
        }
        return res(200, { campaign: null, paging: { next: null } });
      }),
    );

    const status = await readOmnisendStatus();

    expect(status.state).toBe('connected');
    expect(status.subscribedCount).toBeNull();
    expect(status.unsubscribedCount).toBeNull();
    expect(status.contactsCount).toBeNull();
  });
});
