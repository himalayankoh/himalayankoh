import { describe, it, expect, beforeEach } from 'vitest';
import {
  buildCacheKey,
  getCachedLeads,
  setCachedLeads,
  invalidateLeadCache,
  recordLeadsMutation,
  getLastLeadsMutationTime,
  getCacheMetrics,
  getLeadFromIndex,
  getLeadByDomain,
} from './lead-cache';
import type { SavedLeadRecord } from './types';

const mockLead: SavedLeadRecord = {
  id: 'test-lead-123',
  workspaceId: '00000000-0000-0000-0000-000000000001',
  businessName: 'Lone Star Equine Feed & Salt',
  category: 'Agriculture & Livestock',
  address: '123 Ranch Trail',
  city: 'Weatherford',
  region: 'TX',
  country: 'US',
  website: 'https://www.lonestarfeedtx.com',
  phone: '+1 817-555-4321',
  email: 'contact@lonestarfeedtx.com',
  emailSource: 'company_website',
  latitude: 32.7593,
  longitude: -97.7972,
  osmType: 'node',
  osmId: '987654321',
  dataSource: 'openstreetmap',
  opportunityScore: 85,
  opportunitySignals: ['equine_feed', 'bulk_livestock'],
  status: 'qualified',
  starred: true,
  tags: ['quality:qualified_buyer', 'cat:agriculture'],
  notes: 'High volume buyer',
  discoveredAt: '2026-10-15T12:00:00Z',
  createdAt: '2026-10-15T12:00:00Z',
  updatedAt: '2026-10-15T12:00:00Z',
  research: {
    productInterest: 'Salt Licks',
    sources: [
      {
        url: 'https://www.lonestarfeedtx.com',
        retrievedAt: '2026-10-15T12:00:00Z',
        kind: 'website',
        status: 'verified',
        excerpt: 'Huge raw scrape payload with dozens of lines...',
      },
    ],
  },
};

describe('LeadOS 3.3 Lead Cache & Durable Research Database', () => {
  beforeEach(() => {
    invalidateLeadCache();
  });

  it('builds canonical normalized cache keys', () => {
    const key1 = buildCacheKey({ region: 'tx', search: 'Feed ', page: 1, limit: 50 });
    const key2 = buildCacheKey({ region: 'TX', search: 'feed', page: 1, limit: 50 });
    expect(key1).toBe(key2);
    expect(key1).toBe('leads:feed:TX::1:50');
  });

  it('populates cache and provides SWR memory read-through', () => {
    const key = buildCacheKey({ region: 'TX', limit: 50 });
    setCachedLeads(key, { leads: [mockLead], total: 1 });

    const cached = getCachedLeads(key);
    expect(cached.hit).toBe(true);
    expect(cached.isStale).toBe(false);
    expect(cached.data?.leads.length).toBe(1);
    expect(cached.data?.leads[0].businessName).toBe('Lone Star Equine Feed & Salt');

    // Index verification
    expect(getLeadFromIndex('test-lead-123')?.id).toBe('test-lead-123');
    expect(getLeadByDomain('lonestarfeedtx.com')?.id).toBe('test-lead-123');
  });

  it('strips heavy scrape blobs from list payloads to optimize transfer', () => {
    const key = buildCacheKey({ region: 'TX', limit: 50 });
    setCachedLeads(key, { leads: [mockLead], total: 1 });

    const cached = getCachedLeads(key);
    const item = cached.data?.leads[0];
    expect(item?.research).toBeDefined();
    // Sources array should be stripped to sourceCount for list view
    expect((item?.research as any).sources).toBeUndefined();
    expect((item?.research as any).sourceCount).toBe(1);
  });

  it('records mutation timestamps on lead changes for live map sync', () => {
    const beforeTime = getLastLeadsMutationTime();
    // Simulate slight time progression
    recordLeadsMutation();
    const afterTime = getLastLeadsMutationTime();

    expect(afterTime).toBeGreaterThanOrEqual(beforeTime);

    // Cache should be cleared
    const key = buildCacheKey({ region: 'TX', limit: 50 });
    const cached = getCachedLeads(key);
    expect(cached.hit).toBe(false);
  });

  it('reports performance metrics including hit ratio and durable status', () => {
    const key = buildCacheKey({ region: 'TX', limit: 50 });
    setCachedLeads(key, { leads: [mockLead], total: 1 });

    getCachedLeads(key); // Hit
    getCachedLeads('leads:unknown'); // Miss

    const metrics = getCacheMetrics();
    expect(metrics.hits).toBeGreaterThan(0);
    expect(metrics.misses).toBeGreaterThan(0);
    expect(metrics.durableDatabase).toBeDefined();
  });
});
