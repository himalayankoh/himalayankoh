/**
 * The Hermes evidence store, against a stubbed WordPress.
 *
 * `hermesIngest.test.ts` covers the contract validation and the dedupe behaviour, but
 * it can pass entirely through the in-memory fallback — which is exactly how a store
 * that never reaches WordPress looks healthy. These tests stub `fetch` instead, so the
 * real client, the real path and the real credential are exercised and a request that
 * goes nowhere fails here.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createWordPressStub,
  type WordPressStub,
  type WordPressStubRoute,
} from '@/lib/backend/wordpressTestServer';

vi.hoisted(() => {
  process.env.WORDPRESS_BASE_URL = 'https://himalayankoh.test/staging';
  process.env.WORDPRESS_ADMIN_USER = 'app-admin';
  process.env.WORDPRESS_ADMIN_APP_PASSWORD = 'abcd EFGH ijkl MNOP qrst UVWX';
});

import { insertEvidence, listEvidence, updateEvidenceStatus } from './evidenceStore';

const realFetch = globalThis.fetch;

function useWordPress(routes: WordPressStubRoute[]): WordPressStub {
  const stub = createWordPressStub(routes);
  globalThis.fetch = stub.fetch as unknown as typeof fetch;
  return stub;
}

afterEach(() => {
  globalThis.fetch = realFetch;
});

const EVIDENCE_PATH = '/hk-storefront/v1/hermes-evidence';

const payload = {
  source: 'n8n' as const,
  type: 'catalog_qa' as const,
  title: 'Duplicate alt text on product images',
  summary: 'Three images share one generic alt attribute.',
  confidence: 95,
  priority: 'medium' as const,
  observed_at: '2026-09-20T10:00:00.000Z',
  dedupe_key: 'wp_test_dedupe_1',
};

function storedRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 12,
    dedupe_key: 'wp_test_dedupe_1',
    source: 'n8n',
    type: 'catalog_qa',
    entity: {},
    title: payload.title,
    summary: payload.summary,
    evidence: [],
    confidence: 95,
    priority: 'medium',
    recommended_action: null,
    metadata: {},
    status: 'new',
    review_note: null,
    observed_at: payload.observed_at,
    created_at: '2026-09-20T10:00:01.000Z',
    updated_at: '2026-09-20T10:00:01.000Z',
    ...overrides,
  };
}

describe('Hermes evidence on WordPress', () => {
  it('stores a finding through the plugin, not in memory', async () => {
    const stub = useWordPress([
      { method: 'POST', path: EVIDENCE_PATH, body: { status: 'CREATED', record: storedRecord() } },
    ]);

    const result = await insertEvidence(payload);

    expect(result.status).toBe('CREATED');
    // The id comes back as a string because the app's record ids are strings; the
    // store hands WordPress's integer over without leaking the difference.
    expect(result.id).toBe('12');
    expect(result.record.title).toBe(payload.title);

    const [sent] = stub.callsTo(EVIDENCE_PATH, 'POST');
    expect(sent).toBeDefined();
    expect((sent.body as { dedupe_key: string }).dedupe_key).toBe('wp_test_dedupe_1');
    // The administrator application password, not a public key: this endpoint is
    // full site access and must never be reachable from a browser bundle.
    expect(sent.headers.Authorization).toMatch(/^Basic /);
  });

  it('reports a duplicate as already_exists with the stored row', async () => {
    useWordPress([
      { method: 'POST', path: EVIDENCE_PATH, body: { status: 'ALREADY_EXISTS', record: storedRecord() } },
    ]);

    const result = await insertEvidence(payload);
    expect(result.status).toBe('ALREADY_EXISTS');
    expect(result.id).toBe('12');
  });

  it('reads the inbox and its facet counts from the plugin', async () => {
    const stub = useWordPress([
      {
        path: EVIDENCE_PATH,
        body: {
          items: [storedRecord()],
          total: 1,
          countsByType: { catalog_qa: 1 },
          countsByStatus: { new: 1 },
        },
      },
    ]);

    const result = await listEvidence({ type: 'catalog_qa', limit: 10 });

    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.countsByType.catalog_qa).toBe(1);
    expect(stub.callsTo(EVIDENCE_PATH)[0].query.get('type')).toBe('catalog_qa');
  });

  it('moves a review status on the store row', async () => {
    const stub = useWordPress([
      {
        method: 'POST',
        path: `${EVIDENCE_PATH}/status`,
        body: { ok: true, record: storedRecord({ status: 'accepted', review_note: 'Fix it' }) },
      },
    ]);

    const result = await updateEvidenceStatus('12', 'accepted', 'Fix it');

    expect(result.ok).toBe(true);
    expect(result.record?.status).toBe('accepted');
    const [sent] = stub.callsTo(`${EVIDENCE_PATH}/status`, 'POST');
    expect(sent.body).toEqual({ id: 12, status: 'accepted', review_note: 'Fix it' });
  });

  it('holds a finding in memory when WordPress cannot be reached, and says so', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    useWordPress([{ path: EVIDENCE_PATH, status: 500, body: { message: 'boom' } }]);

    const result = await insertEvidence({ ...payload, dedupe_key: 'wp_test_dedupe_fallback' });

    expect(result.status).toBe('CREATED');
    // Never silent: a fallback that answers normally with nothing stored is how an
    // outage turns into "we saved it".
    expect(warn).toHaveBeenCalled();
    expect(String(warn.mock.calls[0][0])).toContain('held in memory only');
    warn.mockRestore();
  });

  it('does not ask WordPress for an id it could never hold', async () => {
    const stub = useWordPress([]);
    const result = await updateEvidenceStatus('mem_1234_abcd', 'reviewed');

    expect(result.ok).toBe(false);
    expect(stub.calls).toHaveLength(0);
  });
});
