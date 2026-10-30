import { describe, it, expect, beforeEach } from 'vitest';
import { validateEvidencePayload } from './evidenceContract';
import { insertEvidence, listEvidence, updateEvidenceStatus } from './evidenceStore';
import { verifyHermesAuth } from './auth';
import { PROJECT_SLUG } from '../../services/salmanOs/contract';

describe('Hermes / Salman OS / n8n Evidence Contract Validation', () => {
  const validPayload = {
    source: 'hermes',
    type: 'product',
    entity: {
      sku: 'HK-ROCK-45',
      slug: 'himalayan-rock-salt-45-lbs',
    },
    title: 'High Demand for Mineral Salt Lick Blocks in Fall',
    summary: 'Observed 34% surge in agricultural search volume for Himalayan mineral salt blocks.',
    evidence: [
      {
        url: 'https://example.com/market-report',
        label: 'Agritech Trends 2026',
        observation: 'Equine owners stocking up for winter',
      },
    ],
    confidence: 88,
    priority: 'high',
    recommended_action: 'Highlight weather resistance of 45 lbs block in marketing',
    observed_at: '2026-09-19T10:00:00.000Z',
    dedupe_key: 'hermes_prod_hk_rock_45_20260919',
    metadata: {
      searchVolumeDelta: '+34%',
    },
  };

  it('accepts a fully compliant normalized evidence payload', () => {
    const res = validateEvidencePayload(validPayload);
    expect(res.ok).toBe(true);
    expect(res.errors).toHaveLength(0);
    expect(res.data?.source).toBe('hermes');
    expect(res.data?.type).toBe('product');
    expect(res.data?.confidence).toBe(88);
    expect(res.data?.priority).toBe('high');
    expect(res.data?.dedupe_key).toBe('hermes_prod_hk_rock_45_20260919');
  });

  it('rejects unsupported source values', () => {
    const res = validateEvidencePayload({
      ...validPayload,
      source: 'unauthorized-bot',
    });
    expect(res.ok).toBe(false);
    expect(res.errors[0]).toContain('Invalid source');
  });

  it('rejects unsupported evidence types', () => {
    const res = validateEvidencePayload({
      ...validPayload,
      type: 'direct_cart_injection',
    });
    expect(res.ok).toBe(false);
    expect(res.errors[0]).toContain('Invalid type');
  });

  it('rejects missing or empty dedupe_key', () => {
    const res1 = validateEvidencePayload({
      ...validPayload,
      dedupe_key: '',
    });
    expect(res1.ok).toBe(false);

    const res2 = validateEvidencePayload({
      ...validPayload,
      dedupe_key: undefined,
    });
    expect(res2.ok).toBe(false);
  });

  it('rejects invalid confidence outside 0-100', () => {
    const resNegative = validateEvidencePayload({
      ...validPayload,
      confidence: -5,
    });
    expect(resNegative.ok).toBe(false);

    const resOver = validateEvidencePayload({
      ...validPayload,
      confidence: 105,
    });
    expect(resOver.ok).toBe(false);

    const resNaN = validateEvidencePayload({
      ...validPayload,
      confidence: 'not-a-number',
    });
    expect(resNaN.ok).toBe(false);
  });

  it('rejects malformed observed_at timestamps', () => {
    const res = validateEvidencePayload({
      ...validPayload,
      observed_at: 'not-a-timestamp',
    });
    expect(res.ok).toBe(false);
    expect(res.errors[0]).toContain('observed_at');
  });

  it('rejects invalid priority', () => {
    const res = validateEvidencePayload({
      ...validPayload,
      priority: 'urgent_now',
    });
    expect(res.ok).toBe(false);
    expect(res.errors[0]).toContain('Invalid priority');
  });
});

describe('Hermes Evidence Idempotency & Deduplication', () => {
  const testKey = `test_dedupe_${Date.now()}_${Math.random()}`;

  const item = {
    source: 'n8n' as const,
    type: 'catalog_qa' as const,
    title: 'Duplicate Alt Tag Detected on Product Images',
    summary: 'Automated crawl found 3 images sharing generic alt text',
    confidence: 95,
    priority: 'medium' as const,
    observed_at: new Date().toISOString(),
    dedupe_key: testKey,
    evidence: [],
    metadata: {},
  };

  it('stores first submission as CREATED', async () => {
    const res1 = await insertEvidence(item);
    expect(res1.status).toBe('CREATED');
    expect(res1.dedupe_key).toBe(testKey);
    expect(res1.id).toBeDefined();
  });

  it('returns ALREADY_EXISTS on duplicate dedupe_key submission without duplicating', async () => {
    const res2 = await insertEvidence(item);
    expect(res2.status).toBe('ALREADY_EXISTS');
    expect(res2.dedupe_key).toBe(testKey);
  });

  it('supports updating status on evidence', async () => {
    const insertRes = await insertEvidence({
      ...item,
      dedupe_key: `${testKey}_update`,
    });
    expect(insertRes.status).toBe('CREATED');

    const updateRes = await updateEvidenceStatus(insertRes.id, 'accepted', 'Approved for fix');
    expect(updateRes.ok).toBe(true);
    expect(updateRes.record?.status).toBe('accepted');
    expect(updateRes.record?.review_note).toBe('Approved for fix');
  });

  it('filters evidence by type and status', async () => {
    const listRes = await listEvidence({
      type: 'catalog_qa',
      limit: 10,
    });
    expect(listRes.items).toBeInstanceOf(Array);
    expect(listRes.countsByType).toBeDefined();
  });
});

describe('Hermes Ingest Auth', () => {
  const testSecret = 'hk_test_secret_token_1234567890';

  beforeEach(() => {
    process.env.HERMES_INGEST_TOKEN = testSecret;
  });

  it('rejects requests with missing authentication headers with 401', async () => {
    const req = new Request('https://preview.himalayankoh.com/api/hermes/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await verifyHermesAuth(req);
    expect(res.ok).toBe(false);
    expect(res.status).toBe(401);
  });

  it('rejects requests with invalid token with 403', async () => {
    const req = new Request('https://preview.himalayankoh.com/api/hermes/ingest', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer wrong_token_value',
      },
    });
    const res = await verifyHermesAuth(req);
    expect(res.ok).toBe(false);
    expect(res.status).toBe(403);
  });

  it('accepts requests with valid Bearer token', async () => {
    const req = new Request('https://preview.himalayankoh.com/api/hermes/ingest', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${testSecret}`,
      },
    });
    const res = await verifyHermesAuth(req);
    expect(res.ok).toBe(true);
  });

  it('accepts requests with valid x-hermes-token header', async () => {
    const req = new Request('https://preview.himalayankoh.com/api/hermes/ingest', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-hermes-token': testSecret,
      },
    });
    const res = await verifyHermesAuth(req);
    expect(res.ok).toBe(true);
  });
});

describe('Salman OS Himalayan Koh Configuration', () => {
  it('uses himalayan-koh as target project slug', () => {
    expect(PROJECT_SLUG).toBe('himalayan-koh');
  });
});
