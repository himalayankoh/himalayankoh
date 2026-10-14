import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWordPressStub, type WordPressStub, type WordPressStubRoute } from '@/lib/backend/wordpressTestServer';

vi.hoisted(() => {
  process.env.WORDPRESS_BASE_URL = 'https://himalayankoh.test/staging';
  process.env.WORDPRESS_ADMIN_USER = 'app-admin';
  process.env.WORDPRESS_ADMIN_APP_PASSWORD = 'abcd EFGH ijkl MNOP qrst UVWX';
});

import {
  saveLeadsBatchToLibrary,
  checkSavedIdentities,
  HK_DEFAULT_PROJECT_ID,
} from './db';
import { leadIdentity } from './intelligence';
import type { NormalizedLead } from './types';

const realFetch = globalThis.fetch;

function useWordPress(routes: WordPressStubRoute[]): WordPressStub {
  const stub = createWordPressStub(routes);
  globalThis.fetch = stub.fetch as unknown as typeof fetch;
  return stub;
}

function makeLeadFixture(i: number): NormalizedLead & { opportunityScore?: number; opportunitySignals?: string[] } {
  return {
    businessName: `Test B2B Enterprise ${i}`,
    category: i % 2 === 0 ? 'Feed Store' : 'Equestrian Center',
    address: null,
    city: 'Houston',
    region: 'Texas',
    country: 'United States',
    website: `https://business-${i}.example.com`,
    phone: `713-555-${String(i).padStart(4, '0')}`,
    email: `contact@business-${i}.example.com`,
    latitude: 29.7604,
    longitude: -95.3698,
    osmType: null,
    osmId: null,
    osmUrl: null,
    opportunityScore: 75 + (i % 25),
    opportunitySignals: ['wholesale buyer candidate'],
    dataSource: 'searxng_web',
  };
}

describe('LeadOS 3.0 Batch Persistence & Scaling Acceptance', () => {
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('correctly persists a 25-record batch in a single bounded request', async () => {
    const leads = Array.from({ length: 25 }, (_, i) => makeLeadFixture(i + 1));

    const wp = useWordPress([
      {
        method: 'POST',
        path: '/leados/v1/leads/batch',
        body: {
          ok: true,
          savedCount: 25,
          failedCount: 0,
          results: leads.map((l, idx) => ({
            index: idx,
            businessName: l.businessName,
            dedupeKey: l.website,
            id: `lead-uuid-${idx}`,
            success: true,
          })),
        },
      },
    ]);

    const result = await saveLeadsBatchToLibrary(leads, HK_DEFAULT_PROJECT_ID, 25);

    const calls = wp.callsTo('/leados/v1/leads/batch', 'POST');
    expect(calls).toHaveLength(1);
    const body = calls[0].body as { leads: any[] };
    expect(body.leads).toHaveLength(25);
    expect(result.savedCount).toBe(25);
    expect(result.failedCount).toBe(0);
    expect(result.errors).toHaveLength(0);
    expect(result.savedKeys.size).toBeGreaterThanOrEqual(25);
  });

  it('correctly splits 50 records into exactly 2 bounded requests of 25', async () => {
    const leads = Array.from({ length: 50 }, (_, i) => makeLeadFixture(i + 1));

    const wp = useWordPress([
      {
        method: 'POST',
        path: '/leados/v1/leads/batch',
        body: {
          ok: true,
          savedCount: 25,
          failedCount: 0,
          results: Array.from({ length: 25 }, (_, idx) => ({
            index: idx,
            businessName: `Test B2B Enterprise ${idx}`,
            dedupeKey: `key-${idx}`,
            id: `lead-uuid-${idx}`,
            success: true,
          })),
        },
      },
    ]);

    const result = await saveLeadsBatchToLibrary(leads, HK_DEFAULT_PROJECT_ID, 25);

    const calls = wp.callsTo('/leados/v1/leads/batch', 'POST');
    expect(calls).toHaveLength(2);
    expect((calls[0].body as { leads: any[] }).leads).toHaveLength(25);
    expect((calls[1].body as { leads: any[] }).leads).toHaveLength(25);
    expect(result.savedCount).toBe(50);
    expect(result.failedCount).toBe(0);
  });

  it('correctly splits 100 records into exactly 4 bounded requests of 25', async () => {
    const leads = Array.from({ length: 100 }, (_, i) => makeLeadFixture(i + 1));

    const wp = useWordPress([
      {
        method: 'POST',
        path: '/leados/v1/leads/batch',
        body: {
          ok: true,
          savedCount: 25,
          failedCount: 0,
          results: Array.from({ length: 25 }, (_, idx) => ({
            index: idx,
            businessName: `Test B2B Enterprise ${idx}`,
            dedupeKey: `key-${idx}`,
            id: `lead-uuid-${idx}`,
            success: true,
          })),
        },
      },
    ]);

    const result = await saveLeadsBatchToLibrary(leads, HK_DEFAULT_PROJECT_ID, 25);

    const calls = wp.callsTo('/leados/v1/leads/batch', 'POST');
    expect(calls).toHaveLength(4);
    for (const call of calls) {
      expect((call.body as { leads: any[] }).leads).toHaveLength(25);
    }
    expect(result.savedCount).toBe(100);
    expect(result.failedCount).toBe(0);
  });

  it('correctly splits 200 records into exactly 8 bounded requests of 25', async () => {
    const leads = Array.from({ length: 200 }, (_, i) => makeLeadFixture(i + 1));

    const wp = useWordPress([
      {
        method: 'POST',
        path: '/leados/v1/leads/batch',
        body: {
          ok: true,
          savedCount: 25,
          failedCount: 0,
          results: Array.from({ length: 25 }, (_, idx) => ({
            index: idx,
            businessName: `Test B2B Enterprise ${idx}`,
            dedupeKey: `key-${idx}`,
            id: `lead-uuid-${idx}`,
            success: true,
          })),
        },
      },
    ]);

    const result = await saveLeadsBatchToLibrary(leads, HK_DEFAULT_PROJECT_ID, 25);

    const calls = wp.callsTo('/leados/v1/leads/batch', 'POST');
    expect(calls).toHaveLength(8);
    for (const call of calls) {
      expect((call.body as { leads: any[] }).leads).toHaveLength(25);
    }
    expect(result.savedCount).toBe(200);
    expect(result.failedCount).toBe(0);
  });

  it('accurately reports per-record failures and retries only failed records', async () => {
    const leads = [
      makeLeadFixture(1),
      makeLeadFixture(2),
      makeLeadFixture(3),
    ];

    const wp = useWordPress([
      {
        method: 'POST',
        path: '/leados/v1/leads/batch',
        body: {
          ok: true,
          savedCount: 2,
          failedCount: 1,
          results: [
            { index: 0, businessName: leads[0].businessName, dedupeKey: 'k1', id: 'id1', success: true },
            { index: 1, businessName: leads[1].businessName, dedupeKey: 'k2', success: false, error: 'Lock timeout' },
            { index: 2, businessName: leads[2].businessName, dedupeKey: 'k3', id: 'id3', success: true },
          ],
        },
      },
      {
        method: 'POST',
        path: '/leados/v1/leads',
        body: {
          lead: {
            id: 'lead-uuid-retry-success',
            business_name: leads[1].businessName,
            category: 'Feed Store',
          },
        },
      },
    ]);

    const result = await saveLeadsBatchToLibrary(leads, HK_DEFAULT_PROJECT_ID, 25);

    const batchCalls = wp.callsTo('/leados/v1/leads/batch', 'POST');
    const singleCalls = wp.callsTo('/leados/v1/leads', 'POST');

    expect(batchCalls).toHaveLength(1);
    expect(singleCalls).toHaveLength(1);
    expect((singleCalls[0].body as { lead: { business_name: string } }).lead.business_name).toBe(leads[1].businessName);
    expect(result.savedCount).toBe(3);
    expect(result.failedCount).toBe(0);
  });

  it('checkSavedIdentities efficiently queries existing keys without full library load', async () => {
    const candidates = [makeLeadFixture(1), makeLeadFixture(2), makeLeadFixture(3)];

    const wp = useWordPress([
      {
        method: 'POST',
        path: '/leados/v1/leads/check-identities',
        body: {
          ok: true,
          matched: [
            {
              id: 'lead-id-1',
              dedupeKey: leadIdentity(candidates[0]),
              businessName: candidates[0].businessName,
              website: candidates[0].website,
              status: 'new',
            },
          ],
        },
      },
    ]);

    const matchMap = await checkSavedIdentities(candidates);

    const calls = wp.callsTo('/leados/v1/leads/check-identities', 'POST');
    expect(calls).toHaveLength(1);
    expect(matchMap.has(leadIdentity(candidates[0]))).toBe(true);
    expect(matchMap.has(leadIdentity(candidates[1]))).toBe(false);
    expect(matchMap.has(leadIdentity(candidates[2]))).toBe(false);
  });
});
