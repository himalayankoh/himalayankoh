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

  it('tracks job history and scheduler status with persistent indicators', () => {
    const jobs = getJobHistory();
    expect(Array.isArray(jobs)).toBe(true);

    const scheduler = getSchedulerStatus();
    expect(scheduler).toHaveProperty('activeJobs');
    expect(scheduler).toHaveProperty('nextScheduledRun');
    expect(scheduler.priorityStates).toContain('TX');
    expect(scheduler.priorityStates).toContain('OK');
    expect(scheduler.registered).toBe(true);
    expect(scheduler.cronHook).toBe('hk_leados_market_discovery_cron');
    expect(scheduler.persistentBackend).toContain('WordPress MySQL');
    expect(scheduler.browserClosedExecution).toBe(true);
    expect(scheduler).toHaveProperty('executionEvidence');
    expect(typeof scheduler.executionEvidence).toBe('string');
    expect(scheduler).toHaveProperty('heartbeatAgeMinutes');
  });

  it('aggregates accurate state counts across the entire library via dbSummary', () => {
    const mockDbSummary = {
      ok: true,
      totalLeads: 120,
      byState: [
        {
          region: 'TX',
          total: 45,
          qualified: 28,
          new_count: 12,
          contactable: 35,
          last_updated: '2026-10-15T07:00:00Z',
        },
        {
          region: 'FL',
          total: 30,
          qualified: 18,
          new_count: 8,
          contactable: 22,
          last_updated: '2026-10-15T06:00:00Z',
        },
      ],
      byCategory: [
        { category: 'Feed Store', total: 50 },
        { category: 'Salt Wholesaler', total: 40 },
      ],
      byStatus: [
        { status: 'qualified', total: 46 },
        { status: 'new', total: 74 },
      ],
    };

    // Even with an empty fetched page of pins, global state statistics are 100% accurate
    const aggregated = aggregateStateMarketData([], mockDbSummary);

    expect(aggregated['TX'].discoveredCount).toBe(45);
    expect(aggregated['TX'].qualifiedCount).toBe(28);
    expect(aggregated['TX'].newCount).toBe(12);
    expect(aggregated['TX'].contactableCount).toBe(35);
    expect(aggregated['TX'].lastScanTimestamp).toBe('2026-10-15T07:00:00Z');

    expect(aggregated['FL'].discoveredCount).toBe(30);
    expect(aggregated['FL'].qualifiedCount).toBe(18);

    expect(aggregated['OK'].discoveredCount).toBe(0);
    expect(aggregated['OK'].coverageStatus).toBe('not_scanned');
  });

  it('prevents concurrent duplicate jobs when a scan is in progress', async () => {
    // Add a running job to history
    const runningJob = {
      jobId: 'job-tx-test-running',
      stateCode: 'TX',
      stateName: 'Texas',
      metroHub: 'Houston',
      categoryKey: 'agriculture' as const,
      status: 'running' as const,
      priority: 1,
      scheduledAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      completedAt: null,
      discoveredCount: 0,
      newSavedCount: 0,
      existingUpdatedCount: 0,
      failedCount: 0,
      provider: 'OpenStreetMap / Overpass',
      retryCount: 0,
      maxRetries: 2,
      error: null,
      durationMs: 0,
      nextScheduledRun: null,
    };

    const { syncJobsWithDb, runScheduledAutonomousScan } = await import('./market-scheduler');
    syncJobsWithDb([runningJob]);

    const result = await runScheduledAutonomousScan();
    expect(result.ok).toBe(false);
    expect(result.jobId).toBe('blocked-concurrent');
    expect(result.errors[0]).toContain('already in progress');
  });
});

describe('LeadOS 3.2 Registered n8n Scheduled Discovery Workflow', () => {
  it('has a valid registered recurring n8n workflow file with 6-hour interval', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const workflowPath = join(process.cwd(), 'ops/leados/n8n-market-discovery.json');
    const content = JSON.parse(readFileSync(workflowPath, 'utf8'));

    expect(content.name).toContain('Autonomous Market Discovery');
    const trigger = content.nodes.find((n: any) => n.type === 'n8n-nodes-base.scheduleTrigger');
    expect(trigger).toBeDefined();
    expect(trigger.parameters.rule.interval[0].field).toBe('hours');
    expect(trigger.parameters.rule.interval[0].hoursInterval).toBe(6);

    const httpNode = content.nodes.find((n: any) => n.id === 'Trigger-market-scan');
    expect(httpNode).toBeDefined();
    expect(httpNode.parameters.jsonBody).toContain('run_scheduled_scan');
  });
});


