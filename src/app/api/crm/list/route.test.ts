import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWordPressStub, type WordPressStub, type WordPressStubRoute } from '@/lib/backend/wordpressTestServer';

vi.hoisted(() => {
  process.env.WORDPRESS_BASE_URL = 'https://himalayankoh.test/staging';
  process.env.WORDPRESS_ADMIN_USER = 'app-admin';
  process.env.WORDPRESS_ADMIN_APP_PASSWORD = 'abcd EFGH ijkl MNOP qrst UVWX';
  process.env.ADMIN_SESSION_SECRET = 'test-secret-that-is-long-enough-1234';
});

import { createAdminSession } from '@/lib/auth/adminSession';
import { GET } from './route';

const realFetch = globalThis.fetch;

function useWordPress(routes: WordPressStubRoute[]): WordPressStub {
  const stub = createWordPressStub(routes);
  globalThis.fetch = stub.fetch as unknown as typeof fetch;
  return stub;
}

async function validToken(): Promise<string> {
  const { token } = await createAdminSession({
    id: '7',
    username: 'salman',
    email: 'salman@himalayankoh.com',
    name: 'Salman Bashir',
  });
  return token;
}

function crmRow(overrides: Record<string, unknown> = {}) {
  return {
    id: '41',
    email: 'buyer@feedstore.com',
    name: 'Feed, "Best" Store',
    phone: '713-555-0199',
    source: 'campaign',
    page_url: '/gift-drop',
    coupon_code: 'SALT10',
    coupon_used: 1,
    metadata: {},
    opted_in: 1,
    status: null,
    notes: null,
    created_at: '2026-02-01 10:00:00',
    updated_at: '2026-02-01 10:00:00',
    ...overrides,
  };
}

function listRequest(query = '', token?: string): Request {
  const headers: Record<string, string> = {};
  if (token !== undefined) headers.Authorization = `Bearer ${token}`;
  return new Request(`http://localhost/api/crm/list${query}`, { headers });
}

describe('GET /api/crm/list', () => {
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  describe('admin authentication', () => {
    it('refuses a request with no bearer token', async () => {
      const wp = useWordPress([{ path: '/crm/v1/leads', body: { leads: [] } }]);

      const response = await GET(listRequest());

      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: 'Admin authentication required.' });
      // Nothing reached WordPress — an unauthenticated call must not read data.
      expect(wp.calls).toHaveLength(0);
    });

    it('refuses a forged token', async () => {
      useWordPress([{ path: '/crm/v1/leads', body: { leads: [] } }]);

      const response = await GET(listRequest('', 'not-a-real-token'));

      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({
        error: 'Invalid or expired admin session. Sign in again.',
      });
    });

    it('refuses a token signed with a different secret (revocation by rotation)', async () => {
      const token = await validToken();
      const secret = process.env.ADMIN_SESSION_SECRET;
      process.env.ADMIN_SESSION_SECRET = 'a-different-secret-long-enough-to-pass';
      useWordPress([{ path: '/crm/v1/leads', body: { leads: [] } }]);

      try {
        const response = await GET(listRequest('', token));
        expect(response.status).toBe(401);
      } finally {
        process.env.ADMIN_SESSION_SECRET = secret;
      }
    });

    it('serves the list to a signed-in administrator', async () => {
      useWordPress([{ path: '/crm/v1/leads', body: { leads: [crmRow()] } }]);

      const response = await GET(listRequest('', await validToken()));

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ ok: true });
    });
  });

  describe('JSON view', () => {
    it('returns leads with MySQL booleans normalised', async () => {
      useWordPress([
        {
          path: '/crm/v1/leads',
          body: {
            leads: [
              crmRow({ id: '1', coupon_used: 1 }),
              crmRow({ id: '2', coupon_used: 0 }),
              crmRow({ id: '3', coupon_used: '0' }),
            ],
          },
        },
      ]);

      const response = await GET(listRequest('', await validToken()));
      const payload = (await response.json()) as { leads: Array<{ coupon_used: boolean; id: number }> };

      expect(payload.leads.map((lead) => lead.coupon_used)).toEqual([true, false, false]);
      expect(payload.leads.map((lead) => lead.id)).toEqual([1, 2, 3]);
    });

    it('forwards the console filters to WordPress', async () => {
      const wp = useWordPress([{ path: '/crm/v1/leads', body: { leads: [] } }]);

      await GET(listRequest('?search=dale&source=campaign&couponUsed=1', await validToken()));

      const [call] = wp.callsTo('/crm/v1/leads', 'GET');
      expect(call.query.get('search')).toBe('dale');
      expect(call.query.get('source')).toBe('campaign');
      expect(call.query.get('couponUsed')).toBe('1');
    });

    it('ignores an unrecognised couponUsed value rather than passing it through', async () => {
      const wp = useWordPress([{ path: '/crm/v1/leads', body: { leads: [] } }]);

      await GET(listRequest('?couponUsed=maybe', await validToken()));

      const [call] = wp.callsTo('/crm/v1/leads', 'GET');
      expect(call.query.has('couponUsed')).toBe(false);
    });

    it('reports a WordPress failure as a 500 with its message', async () => {
      useWordPress([
        {
          path: '/crm/v1/leads',
          status: 401,
          body: { code: 'rest_forbidden', message: 'Sorry, you are not allowed to do that.' },
        },
      ]);

      const response = await GET(listRequest('', await validToken()));

      expect(response.status).toBe(500);
      const payload = (await response.json()) as { error: string };
      expect(payload.error).toMatch(/WORDPRESS_ADMIN_USER/);
    });
  });

  describe('CSV export', () => {
    it('downloads a CSV with the expected columns and boolean values', async () => {
      useWordPress([
        {
          path: '/crm/v1/leads',
          body: {
            leads: [
              crmRow({ id: '1', coupon_used: 1 }),
              crmRow({ id: '2', coupon_used: 0, coupon_code: null }),
            ],
          },
        },
      ]);

      const response = await GET(listRequest('?format=csv', await validToken()));
      const csv = await response.text();

      expect(response.headers.get('Content-Type')).toContain('text/csv');
      expect(response.headers.get('Content-Disposition')).toContain('attachment; filename="crm-leads-');
      expect(csv).toContain('id,email,name,phone,source,page_url,coupon_code,coupon_used,created_at');
      // The regression this guards: `"0"` is truthy, so a raw interpolation would
      // report every lead as having used a coupon.
      expect(csv).toContain(',true,2026-02-01 10:00:00');
      expect(csv).toContain(',false,2026-02-01 10:00:00');
    });

    it('quotes and escapes fields containing commas, quotes or newlines', async () => {
      useWordPress([
        {
          path: '/crm/v1/leads',
          body: {
            leads: [
              crmRow({
                name: 'Feed, "Best" Store',
                coupon_code: 'SALT,10"\nNEXT',
              }),
            ],
          },
        },
      ]);

      const csv = await (await GET(listRequest('?format=csv', await validToken()))).text();

      expect(csv).toContain('"Feed, ""Best"" Store"');
      expect(csv).toContain('"SALT,10""\nNEXT"');
    });

    it('leaves ordinary values unquoted', async () => {
      useWordPress([
        {
          path: '/crm/v1/leads',
          body: { leads: [crmRow({ name: 'Dale Feed', coupon_code: 'SALT10' })] },
        },
      ]);

      const csv = await (await GET(listRequest('?format=csv', await validToken()))).text();

      expect(csv).toContain(',Dale Feed,');
      expect(csv).toContain(',SALT10,');
      expect(csv).not.toContain('"Dale Feed"');
    });

    it('emits the header even when there are no leads', async () => {
      useWordPress([{ path: '/crm/v1/leads', body: { leads: [] } }]);

      const csv = await (await GET(listRequest('?format=csv', await validToken()))).text();

      expect(csv.trim()).toBe('id,email,name,phone,source,page_url,coupon_code,coupon_used,created_at');
    });
  });
});
