import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth/verifyAdminRequest', () => ({
  verifyAdminRequest: vi.fn(),
}));
vi.mock('@/lib/wordpress/storefrontClient', () => ({ storefrontRequest: vi.fn() }));

import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import { storefrontRequest } from '@/lib/wordpress/storefrontClient';
import { SETTINGS_REGISTRY } from '@/lib/settings/registry';
import { stripeBadge, stripeFacts } from '@/lib/stripe/server/stripe';
import { GET } from './route';

/**
 * The settings read, pinned.
 *
 * ## What this screen cost, and what it may never send
 *
 * `/admin/settings` opens with one read of this route. It used to open with two
 * authenticated requests — this one and `/api/admin/payments` for the Stripe badge
 * beside the key fields — and the second re-read the `stripe` category the first was
 * already holding. The badge is answered here now, from that row, plus one read of
 * `payments`; these tests count the store reads so the duplication cannot come back
 * quietly, because a re-added read changes no response body.
 *
 * The other half is what must never appear in the response. A stored secret is the
 * owner's, and a badge needs none of it, so the test asserts on the serialised body:
 * a sentinel secret either appears or it does not, and no amount of masking logic can
 * make a leak look like a pass.
 */

/** Sentinel values, chosen so a leak is impossible to mistake for a mask. */
const SECRET = 'sk_test_SENTINELSECRETVALUE0001';
const WEBHOOK = 'whsec_SENTINELWEBHOOKVALUE0002';
const PUBLISHABLE = 'pk_test_SENTINELPUBLISHABLE0003';

const STRIPE_ROW = {
  secret_key: SECRET,
  publishable_key: PUBLISHABLE,
  webhook_secret: WEBHOOK,
  staging_simulator: 'false',
};

let storeReads: string[] = [];

function request() {
  return new Request('https://preview.himalayankoh.com/api/admin/settings', {
    headers: { Authorization: 'Bearer test' },
  });
}

async function body(response: Response) {
  return (await response.json()) as {
    settings: Record<string, Record<string, string>>;
    sources: Record<string, Record<string, 'db' | 'env' | 'unset'>>;
    stripe: {
      mode: string;
      isConfigured: boolean;
      enabled: boolean;
      ready: boolean;
      stageLabel: string;
      lastTestAt?: string;
      lastTestOk: boolean;
      lastError?: string;
    } | null;
  };
}

function serveRows(rows: Record<string, Record<string, string>>) {
  vi.mocked(storefrontRequest).mockImplementation(async (_path: string, options?: { params?: Record<string, unknown> }) => {
    const category = String(options?.params?.category ?? '');
    storeReads.push(category);
    return { category, values: rows[category] ?? {} } as never;
  });
}

describe('admin settings read', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storeReads = [];
    // The ambient environment must not decide the answer: these tests are about what the
    // store holds and what leaves the server.
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;
    delete process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

    vi.mocked(verifyAdminRequest).mockResolvedValue({
      ok: true,
      userId: 'owner',
      admin: { userId: 'owner', username: 'owner', email: 'owner@example.invalid', name: 'Owner' },
    });

    serveRows({
      stripe: STRIPE_ROW,
      payments: {
        stripe_enabled: 'true',
        stripe_last_test_at: '2026-09-30T09:00:00.000Z',
        stripe_last_test_ok: 'true',
      },
    });
  });

  it('verifies the caller before reading the store', async () => {
    vi.mocked(verifyAdminRequest).mockResolvedValue({ ok: false, status: 401, error: 'Admin authentication required.' });

    expect((await GET(request())).status).toBe(401);
    expect(storeReads).toEqual([]);
  });

  it('reads one category per registry entry, plus payments once for the badge', async () => {
    await GET(request());

    const registryIds = SETTINGS_REGISTRY.map((category) => category.id);
    for (const id of registryIds) {
      expect(storeReads.filter((read) => read === id)).toHaveLength(1);
    }
    // The badge's state lives in `payments`, which the console does not edit — read in
    // the same wave, and exactly once.
    expect(storeReads.filter((read) => read === 'payments')).toHaveLength(1);
    expect(storeReads).toHaveLength(registryIds.length + 1);
  });

  it('never sends a stored secret to the browser, only the mask and its state', async () => {
    const payload = await body(await GET(request()));
    const serialised = JSON.stringify(payload);

    expect(serialised).not.toContain(SECRET);
    expect(serialised).not.toContain(WEBHOOK);
    expect(payload.settings.stripe.secret_key).toBe('••••••••');
    expect(payload.settings.stripe.webhook_secret).toBe('••••••••');
    expect(payload.sources.stripe.secret_key).toBe('db');
    expect(payload.sources.stripe.webhook_secret).toBe('db');
    // A publishable key is public by design — it is what the browser hands to Stripe.js —
    // so it is returned in full, and this test says so rather than leaving it to chance.
    expect(payload.settings.stripe.publishable_key).toBe(PUBLISHABLE);
  });

  it('answers the Stripe badge from the row it already read', async () => {
    const payload = await body(await GET(request()));

    expect(payload.stripe).toEqual({
      mode: 'sandbox',
      isConfigured: true,
      enabled: true,
      ready: true,
      stageLabel: 'TEST / STAGING',
      lastTestAt: '2026-09-30T09:00:00.000Z',
      lastTestOk: true,
      lastError: undefined,
    });
  });

  it('agrees with the payments screen, because both read the same derivation', async () => {
    const payload = await body(await GET(request()));

    const facts = stripeFacts({
      stripe: STRIPE_ROW,
      payments: {
        stripe_enabled: 'true',
        stripe_last_test_at: '2026-09-30T09:00:00.000Z',
        stripe_last_test_ok: 'true',
      },
    });
    expect(payload.stripe).toEqual(stripeBadge(facts));
  });

  it('reports why a switched-off provider is not ready', async () => {
    serveRows({
      stripe: STRIPE_ROW,
      payments: { stripe_enabled: 'false', stripe_last_error: 'Card declined by the issuer' },
    });

    const payload = await body(await GET(request()));
    expect(payload.stripe?.enabled).toBe(false);
    expect(payload.stripe?.ready).toBe(false);
    expect(payload.stripe?.lastError).toBe('Card declined by the issuer');
    expect(payload.stripe?.lastTestOk).toBe(false);
  });

  it('reports a provider with no keys as not configured, not as an error', async () => {
    serveRows({});

    const payload = await body(await GET(request()));
    expect(payload.stripe?.isConfigured).toBe(false);
    expect(payload.stripe?.enabled).toBe(false);
    expect(payload.stripe?.mode).toBe('sandbox');
  });

  it('still answers the fields when the payments store is unreachable', async () => {
    vi.mocked(storefrontRequest).mockImplementation(async (_path: string, options?: { params?: Record<string, unknown> }) => {
      const category = String(options?.params?.category ?? '');
      storeReads.push(category);
      if (category === 'payments') throw new Error('the store is unreachable');
      return { category, values: category === 'stripe' ? STRIPE_ROW : {} } as never;
    });

    const response = await GET(request());
    expect(response.status).toBe(200);
    const payload = await body(response);
    // The badge is a convenience; the fields the owner came for are not allowed to fail
    // with it, and an unanswerable badge says "not known" instead of guessing.
    expect(payload.stripe).toBeNull();
    expect(payload.settings.stripe.publishable_key).toBe(PUBLISHABLE);
  });
});
