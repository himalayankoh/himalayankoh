import { describe, it, expect } from 'vitest';
import {
  classifyMarketCategory,
  aggregateStateMarketData,
  MARKET_CATEGORIES,
  getGooglePlacesStatus,
  resolveStateTargetLocation,
  runAutonomousMarketScan,
  getJobHistory,
  getSchedulerStatus,
} from './market-scheduler';
import type { SavedLeadRecord } from './types';

describe('LeadOS 3.2 Market Scheduler & Intelligence', () => {
  it('correctly classifies commercial market categories', () => {
    // Agriculture & Livestock
    expect(
      classifyMarketCategory({
        category: 'Feed Store',
        businessName: 'Houston Grain & Tack',
      })
    ).toBe('agriculture');

    expect(
      classifyMarketCategory({
        category: 'Ranch',
        businessName: 'Silver Spur Equine Ranch',
      })
    ).toBe('agriculture');

    // Retail & Wholesale Salt
    expect(
      classifyMarketCategory({
        category: 'Wholesaler',
        businessName: 'Gulf Coast Salt & Mineral Wholesalers',
      })
    ).toBe('salt_wholesale');

    expect(
      classifyMarketCategory({
        category: 'Food Distributor',
        businessName: 'Texas Spice & Bulk Food Importers',
      })
    ).toBe('salt_wholesale');

    // Wellness & Lifestyle
    expect(
      classifyMarketCategory({
        category: 'Day Spa',
        businessName: 'Austin Himalayan Salt Cave & Spa',
      })
    ).toBe('wellness');

    expect(
      classifyMarketCategory({
        category: 'Wellness Center',
        businessName: 'Relaxation & Halotherapy Sanctuary',
      })
    ).toBe('wellness');
  });

  it('aggregates real state-level counts without fabricating statewide numbers', () => {
    const mockLeads: SavedLeadRecord[] = [
      {
        id: 'lead-1',
        workspaceId: 'ws-1',
        businessName: 'Pasturas Los Alazanes',
        category: 'Feed Store',
        address: '1821 S Corinth St, Dallas, TX 75203',
        city: 'Dallas',
        region: 'TX',
        country: 'US',
        website: 'https://pasturaslosalazanes.com',
        phone: '214-943-1111',
        email: 'info@pasturaslosalazanes.com',
        emailSource: 'discovered_osm',
        latitude: 32.74,
        longitude: -96.79,
        osmType: 'node',
        osmId: '101',
        osmUrl: null,
        dataSource: 'openstreetmap',
        research: {},
        opportunityScore: 88,
        opportunitySignals: ['Commercial feed store', 'Active phone and email'],
        tags: ['Feed Store'],
        status: 'qualified',
        starred: true,
        notes: null,
        discoveredAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'lead-2',
        workspaceId: 'ws-1',
        businessName: 'Wabash Feed & Garden',
        category: 'Feed Store',
        address: '4537 N Shepherd Dr, Houston, TX 77018',
        city: 'Houston',
        region: 'TX',
        country: 'US',
        website: 'https://wabashfeed.com',
        phone: '713-863-8322',
        email: null,
        emailSource: undefined,
        latitude: 29.83,
        longitude: -95.41,
        osmType: 'node',
        osmId: '102',
        osmUrl: null,
        dataSource: 'openstreetmap',
        research: {},
        opportunityScore: 82,
        opportunitySignals: ['Feed store'],
        tags: ['Feed Store'],
        status: 'new',
        starred: false,
        notes: null,
        discoveredAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'lead-3',
        workspaceId: 'ws-1',
        businessName: 'Excluded Dictionary Entry',
        category: 'Information',
        address: null,
        city: null,
        region: 'TX',
        country: 'US',
        website: 'https://merriam-webster.com',
        phone: null,
        email: null,
        emailSource: undefined,
        latitude: null,
        longitude: null,
        osmType: null,
        osmId: null,
        osmUrl: null,
        dataSource: 'searxng',
        research: {},
        opportunityScore: 0,
        opportunitySignals: [],
        tags: [],
        status: 'excluded', // Quarantined
        starred: false,
        notes: null,
        discoveredAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    const aggregated = aggregateStateMarketData(mockLeads);

    // Texas should have exactly 2 valid leads (lead-3 excluded)
    expect(aggregated['TX'].discoveredCount).toBe(2);
    expect(aggregated['TX'].qualifiedCount).toBe(2); // One is status=qualified, one has score=82 >= 60
    expect(aggregated['TX'].contactableCount).toBe(2);
    expect(aggregated['TX'].newCount).toBe(2);
    expect(aggregated['TX'].coverageStatus).toBe('partial');
    expect(aggregated['TX'].categoryBreakdown.agriculture).toBe(2);

    // Unscanned states should be marked 'not_scanned' and 0 discovered
    expect(aggregated['FL'].discoveredCount).toBe(0);
    expect(aggregated['FL'].coverageStatus).toBe('not_scanned');
    expect(aggregated['CA'].discoveredCount).toBe(0);
    expect(aggregated['CA'].coverageStatus).toBe('not_scanned');
  });

  it('keeps Google Places optional and disabled by default without paid credentials', () => {
    const status = getGooglePlacesStatus();
    expect(status.monthlyQuota).toBe(500);
    expect(status.costEstimatePerThousand).toBe(17.0);
    expect(status.notice).toContain('Free-first OpenStreetMap & Overpass active');
  });

  it('provides all 3 defined market category definitions', () => {
    expect(MARKET_CATEGORIES.agriculture.label).toBe('Agriculture & Livestock');
    expect(MARKET_CATEGORIES.salt_wholesale.label).toBe('Retail & Wholesale Salt');
    expect(MARKET_CATEGORIES.wellness.label).toBe('Wellness & Lifestyle');
    expect(MARKET_CATEGORIES.agriculture.osmTags.length).toBeGreaterThan(0);
  });

  it('accurately resolves geographic coordinates for US states without cross-state fallback', () => {
    // Texas
    const txLoc = resolveStateTargetLocation('TX');
    expect(txLoc).not.toBeNull();
    expect(txLoc!.metroName).toBe('Houston Metro');
    expect(txLoc!.lat).toBeCloseTo(29.76, 1);

    // Oklahoma must NOT return Texas coordinates
    const okLoc = resolveStateTargetLocation('OK');
    expect(okLoc).not.toBeNull();
    expect(okLoc!.metroName).toContain('Oklahoma City');
    expect(okLoc!.lat).toBeCloseTo(35.46, 1);
    expect(okLoc!.lat).not.toBe(txLoc!.lat);

    // California
    const caLoc = resolveStateTargetLocation('CA');
    expect(caLoc).not.toBeNull();
    expect(caLoc!.metroName).toContain('Fresno');
    expect(caLoc!.lon).toBeLessThan(-115);

    // Colorado
    const coLoc = resolveStateTargetLocation('CO');
    expect(coLoc).not.toBeNull();
    expect(coLoc!.metroName).toContain('Denver');

    // Invalid state must return null
    const invalidLoc = resolveStateTargetLocation('ZZ');
    expect(invalidLoc).toBeNull();
  });

  it('rejects autonomous scan when an invalid state cannot be resolved', async () => {
    const res = await runAutonomousMarketScan({ stateCode: 'ZZ' });
    expect(res.ok).toBe(false);
    expect(res.leadsDiscovered).toBe(0);
    expect(res.errors[0]).toContain('Geographic resolution failed');
  });

  it('tracks job history and scheduler status', () => {
    const jobs = getJobHistory();
    expect(Array.isArray(jobs)).toBe(true);

    const scheduler = getSchedulerStatus();
    expect(scheduler).toHaveProperty('activeJobs');
    expect(scheduler).toHaveProperty('nextScheduledRun');
    expect(scheduler.priorityStates).toContain('TX');
    expect(scheduler.priorityStates).toContain('OK');
  });
});

