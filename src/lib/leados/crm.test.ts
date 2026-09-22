import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWordPressStub, type WordPressStub, type WordPressStubRoute } from '@/lib/backend/wordpressTestServer';

// Set before the config module is imported: the WordPress base URL is resolved
// once, at module load, so it has to be in place before `./crm` pulls it in.
vi.hoisted(() => {
  process.env.WORDPRESS_BASE_URL = 'https://himalayankoh.test/staging';
  process.env.WORDPRESS_ADMIN_USER = 'app-admin';
  process.env.WORDPRESS_ADMIN_APP_PASSWORD = 'abcd EFGH ijkl MNOP qrst UVWX';
});

import { createCrmLead, listCrmLeads } from './crm';

// WordPress displays application passwords in spaced groups; the spaces are
// cosmetic. Asserting on the stripped form proves the whole chain agrees.
const EXPECTED_BASIC = `Basic ${Buffer.from('app-admin:abcdEFGHijklMNOPqrstUVWX').toString('base64')}`;

const realFetch = globalThis.fetch;

function useWordPress(routes: WordPressStubRoute[]): WordPressStub {
  const stub = createWordPressStub(routes);
  globalThis.fetch = stub.fetch as unknown as typeof fetch;
  return stub;
}

/** A row shaped the way MySQL returns it: 0/1, and numeric ids as strings. */
function crmRow(overrides: Record<string, unknown> = {}) {
  return {
    id: '41',
    email: 'buyer@feedstore.com',
    name: 'Dale Feed',
    phone: null,
    company: null,
    source: 'campaign',
    page_url: null,
    coupon_code: null,
    coupon_used: 0,
    metadata: { utm: 'spring' },
    opted_in: 1,
    status: null,
    notes: null,
    created_at: '2026-02-01 10:00:00',
    updated_at: '2026-02-01 10:00:00',
    ...overrides,
  };
}

describe('CRM data layer against the WordPress REST API', () => {
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('authenticates as the app administrator and targets the staging origin', async () => {
    const wp = useWordPress([{ path: '/crm/v1/leads', body: { leads: [] } }]);

    await listCrmLeads();

    const calls = wp.callsTo('/crm/v1/leads', 'GET');
    expect(calls).toHaveLength(1);
    expect(calls[0].headers.Authorization).toBe(EXPECTED_BASIC);
    // The `/staging` install path must survive URL construction.
    expect(calls[0].url).toContain('https://himalayankoh.test/staging/wp-json/crm/v1/leads');
  });

  it('turns MySQL 0/1 into real booleans', async () => {
    useWordPress([
      {
        path: '/crm/v1/leads',
        body: {
          leads: [
            crmRow({ id: '1', email: 'a@example.com', coupon_used: 0, opted_in: 1 }),
            crmRow({ id: '2', email: 'b@example.com', coupon_used: 1, opted_in: 0 }),
            crmRow({ id: '3', email: 'c@example.com', coupon_used: '0', opted_in: '1' }),
            crmRow({ id: '4', email: 'd@example.com', coupon_used: null, opted_in: null }),
          ],
        },
      },
    ]);

    const leads = await listCrmLeads();

    // `"0"` is truthy in JavaScript — this is the regression the mapper exists for.
    expect(leads.map((lead) => lead.coupon_used)).toEqual([false, true, false, false]);
    expect(leads.map((lead) => lead.opted_in)).toEqual([true, false, true, false]);
  });

  it('coerces the auto-increment id to a number and passes metadata through', async () => {
    useWordPress([{ path: '/crm/v1/leads', body: { leads: [crmRow()] } }]);

    const [lead] = await listCrmLeads();

    expect(lead.id).toBe(41);
    expect(typeof lead.id).toBe('number');
    expect(lead.metadata).toEqual({ utm: 'spring' });
  });

  it('replaces a non-object metadata payload with an empty object', async () => {
    useWordPress([{ path: '/crm/v1/leads', body: { leads: [crmRow({ metadata: 'not json' })] } }]);

    const [lead] = await listCrmLeads();

    expect(lead.metadata).toEqual({});
  });

  it('sends the console filters as query parameters', async () => {
    const wp = useWordPress([{ path: '/crm/v1/leads', body: { leads: [] } }]);

    await listCrmLeads({ search: 'dale', source: 'campaign', couponUsed: '1' });

    const [call] = wp.callsTo('/crm/v1/leads', 'GET');
    expect(call.query.get('search')).toBe('dale');
    expect(call.query.get('source')).toBe('campaign');
    expect(call.query.get('couponUsed')).toBe('1');
  });

  it('omits filters the caller did not ask for', async () => {
    const wp = useWordPress([{ path: '/crm/v1/leads', body: { leads: [] } }]);

    await listCrmLeads();

    const [call] = wp.callsTo('/crm/v1/leads', 'GET');
    expect(call.query.has('search')).toBe(false);
    expect(call.query.has('source')).toBe(false);
    expect(call.query.has('couponUsed')).toBe(false);
  });

  it('posts a captured lead and returns the stored row', async () => {
    const wp = useWordPress([
      {
        path: '/crm/v1/leads',
        method: 'POST',
        body: { lead: { ...crmRow(), id: 99, coupon_used: 1 } },
      },
    ]);

    const lead = await createCrmLead({
      email: 'new@example.com',
      name: 'New Lead',
      source: 'gift_drop',
      page_url: '/gift-drop',
      metadata: { coupon: 'SALT10' },
      opted_in: true,
    });

    const [call] = wp.callsTo('/crm/v1/leads', 'POST');
    expect(call.body).toEqual({
      email: 'new@example.com',
      name: 'New Lead',
      source: 'gift_drop',
      page_url: '/gift-drop',
      metadata: { coupon: 'SALT10' },
      opted_in: true,
    });

    expect(lead.id).toBe(99);
    expect(lead.coupon_used).toBe(true);
  });

  it('names the credential when WordPress refuses it', async () => {
    useWordPress([
      {
        path: '/crm/v1/leads',
        status: 401,
        body: { code: 'rest_forbidden', message: 'Sorry, you are not allowed to do that.' },
      },
    ]);

    await expect(listCrmLeads()).rejects.toThrow(/WORDPRESS_ADMIN_USER/);
  });

  it('names the plugin when the namespace is missing', async () => {
    // No route registered: the stub answers WordPress's rest_no_route 404.
    useWordPress([]);

    await expect(listCrmLeads()).rejects.toThrow(/crm\/v1 namespace is missing/);
  });

  it('refuses to call WordPress when the app has no credential', async () => {
    const username = process.env.WORDPRESS_ADMIN_USER;
    const password = process.env.WORDPRESS_ADMIN_APP_PASSWORD;
    delete process.env.WORDPRESS_ADMIN_USER;
    delete process.env.WORDPRESS_ADMIN_APP_PASSWORD;

    const wp = useWordPress([{ path: '/crm/v1/leads', body: { leads: [] } }]);

    try {
      await expect(listCrmLeads()).rejects.toThrow(/WORDPRESS_ADMIN_APP_PASSWORD/);
      // Nothing was sent — a missing credential must not become a request that
      // WordPress would answer 401 for anyway.
      expect(wp.calls).toHaveLength(0);
    } finally {
      process.env.WORDPRESS_ADMIN_USER = username;
      process.env.WORDPRESS_ADMIN_APP_PASSWORD = password;
    }
  });
});

describe('CRM data layer request shape', () => {
  beforeEach(() => {
    globalThis.fetch = realFetch;
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('surfaces a WordPress API error message rather than an HTML body', async () => {
    useWordPress([
      {
        path: '/crm/v1/leads',
        status: 500,
        raw: '<br /><b>Fatal error</b>: Uncaught Error',
      },
    ]);

    await expect(listCrmLeads()).rejects.toThrow(/HTTP 500/);
  });
});
