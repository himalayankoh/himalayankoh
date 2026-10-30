import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth/verifyAdminRequest', () => ({
  verifyAdminRequest: vi.fn(),
}));
vi.mock('@/lib/backend/wordpress', () => ({ wordpressRequest: vi.fn() }));
vi.mock('@/lib/wordpress/storefrontClient', () => ({ storefrontRequest: vi.fn() }));
vi.mock('@/lib/backend/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/backend/config')>();
  return {
    ...actual,
    backendConfig: { ...actual.backendConfig, wordpressApiRoot: 'https://wp.example.invalid/wp-json' },
  };
});
vi.mock('@/lib/backend/wordpressCredentials', () => ({
  requireWordPressCredentials: () => ({ username: 'test', password: 'test' }),
  hasWordPressCredentials: () => true,
  wordpressCredentials: () => ({ username: 'test', password: 'test' }),
  credentialsForRequest: () => null,
}));

import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import { wordpressRequest } from '@/lib/backend/wordpress';
import { storefrontRequest } from '@/lib/wordpress/storefrontClient';
import { invalidateCategory } from '@/lib/settings/serverSettings';
import { GET as readConsole } from './console/route';
import { GET as readOverview } from './overview/route';
import { GET as readWorkspace } from './workspace/route';

/**
 * What the wholesale console's read costs, pinned.
 *
 * ## Why this test exists
 *
 * The console was filled by two routes that, between them, asked WordPress for the order
 * book twice: once for the orders panel and once for the overview's utilisation
 * averages. Sharing that read is the whole point of the aggregate endpoint, and a saving
 * like that is only real if it is *counted* — the reads are cheap to add back by
 * accident, and nothing in a response body would show it had happened.
 *
 * So these tests count outbound reads at the two boundaries that reach WordPress (the
 * application-password client and the storefront client) and assert:
 *
 *   - every store is read once, and the order book exactly once;
 *   - the aggregate costs one read less than the two routes it replaces, and no more;
 *   - the counts are the plugin's own, never re-derived from the capped row reads
 *     (a count that can only be right when the table is small is a lie waiting to
 *     happen);
 *   - nothing is read before the caller has been verified, or when wholesale is off.
 */

const RESOURCES = [
  'products',
  'price_tiers',
  'container_profiles',
  'cost_profiles',
  'freight_rates',
  'origins',
  'suppliers',
  'port_charges',
  'applications',
  'accounts',
  'quotes',
  'orders',
  'audit',
] as const;

/** One order with a stored load plan, so the utilisation averages have something to average. */
const ORDER = {
  id: 7,
  ref: 'WS-0007',
  plan: { containerCode: '40HC', weightUtilizationPct: 80, volumeUtilizationPct: 60 },
};

/** Every count the plugin reports is deliberately unlike any row count below. */
const PLUGIN_OVERVIEW = {
  applications: { pending: 2, more_info: 1, approved: 9, rejected: 3, total: 15, by_status: { PENDING: 2 } },
  accounts: { active: 8, suspended: 1, total: 9 },
  quotes: {
    open: 4,
    draft: 5,
    accepted: 6,
    expired: 7,
    converted: 8,
    total: 312,
    by_status: { QUOTED: 4 },
    quoted_value: 12345.67,
    accepted_value: 7654.32,
  },
  orders: { total: 41, by_status: { CONFIRMED: 20 }, booked_value: 98765.43 },
  destinations: [{ country: 'United Kingdom', orders: 12 }],
  container_utilisation: [],
  audit: { recent: [] },
};

const PLUGIN_SETTINGS = {
  version: '1.4.9',
  db_version: '3',
  installed_db_version: '3',
  missing_tables: [],
  schema_error: '',
  incoterms: ['EXW'],
  application_statuses: ['PENDING'],
  quote_statuses: ['DRAFT'],
  order_statuses: ['DRAFT'],
  charge_keys: ['loading', 'documentation'],
};

/** Every outbound read the app made, in order — the measurement this file asserts on. */
let pluginReads: Array<{ path: string; resource?: string }> = [];
let settingsReads: string[] = [];

const resourcesRead = (name: string) => pluginReads.filter((read) => read.resource === name);
const upstreamReads = () => pluginReads.length + settingsReads.length;

function request(path: string) {
  return new Request(`https://preview.himalayankoh.com${path}`, { headers: { Authorization: 'Bearer t' } });
}

describe('wholesale console reads', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pluginReads = [];
    settingsReads = [];
    // The freight provider's status is cached per process for a minute; clearing it here
    // keeps each test's read count about this code rather than about the test order.
    invalidateCategory('freight');

    vi.mocked(verifyAdminRequest).mockResolvedValue({
      ok: true,
      userId: 'owner',
      admin: { userId: 'owner', username: 'owner', email: 'owner@example.invalid', name: 'Owner' },
    });

    vi.mocked(wordpressRequest).mockImplementation(async (path: string, options?: { params?: Record<string, unknown> }) => {
      const resource = options?.params?.resource as string | undefined;
      pluginReads.push({ path, resource });
      if (path.endsWith('/records')) {
        if (resource === 'orders') return { resource, items: [ORDER], count: 1 } as never;
        return { resource, items: [], count: 0 } as never;
      }
      if (path.endsWith('/settings')) return PLUGIN_SETTINGS as never;
      if (path.endsWith('/overview')) return PLUGIN_OVERVIEW as never;
      throw new Error(`unexpected upstream path ${path}`);
    });

    vi.mocked(storefrontRequest).mockImplementation(async (path: string) => {
      settingsReads.push(path);
      return { category: 'freight', values: {} } as never;
    });
  });

  it('verifies the caller before it reads a single store', async () => {
    vi.mocked(verifyAdminRequest).mockResolvedValue({ ok: false, status: 401, error: 'Admin authentication required.' });

    expect((await readConsole(request('/api/admin/wholesale/console'))).status).toBe(401);
    expect(upstreamReads()).toBe(0);
  });

  it('says so when wholesale is switched off, instead of reading anything', async () => {
    process.env.WHOLESALE_ENABLED = 'false';
    try {
      expect((await readConsole(request('/api/admin/wholesale/console'))).status).toBe(503);
      expect(upstreamReads()).toBe(0);
    } finally {
      delete process.env.WHOLESALE_ENABLED;
    }
  });

  it('reads every store once and the order book exactly once', async () => {
    const response = await readConsole(request('/api/admin/wholesale/console'));
    expect(response.status).toBe(200);

    const resources = pluginReads.filter((read) => read.resource).map((read) => read.resource);
    expect([...resources].sort()).toEqual([...RESOURCES].sort());
    expect(resources.filter((name) => name === 'orders')).toHaveLength(1);

    // Thirteen records + the plugin's own settings + the plugin's COUNT summary, plus
    // the one freight-settings read the provider's status costs.
    expect(pluginReads.filter((read) => read.path.endsWith('/records'))).toHaveLength(13);
    expect(pluginReads.filter((read) => read.path.endsWith('/settings'))).toHaveLength(1);
    expect(pluginReads.filter((read) => read.path.endsWith('/overview'))).toHaveLength(1);
    expect(settingsReads).toHaveLength(1);
    expect(upstreamReads()).toBe(16);
  });

  it('costs one read less than the two routes it replaces, and no more', async () => {
    await readWorkspace(request('/api/admin/wholesale/workspace'));
    const workspaceReads = upstreamReads();
    expect(workspaceReads).toBe(15);

    pluginReads = [];
    settingsReads = [];
    await readOverview(request('/api/admin/wholesale/overview'));
    const overviewReads = upstreamReads();
    expect(overviewReads).toBe(2);
    expect(resourcesRead('orders')).toHaveLength(1);

    pluginReads = [];
    settingsReads = [];
    await readConsole(request('/api/admin/wholesale/console'));

    // The saving is the duplicated order book and nothing else: the same thirteen record
    // sets, the same plugin settings, the same COUNT summary, the same freight status.
    expect(upstreamReads()).toBe(workspaceReads + overviewReads - 1);
  });

  it('hands the order book it already read to the utilisation averages', async () => {
    const body = (await (await readConsole(request('/api/admin/wholesale/console'))).json()) as {
      workspace: { orders: unknown[] };
      overview: { container_utilisation: Array<Record<string, unknown>>; definitions: Record<string, string> };
    };

    expect(body.workspace.orders).toHaveLength(1);
    expect(body.overview.container_utilisation).toEqual([
      {
        container: '40HC',
        orders: 1,
        measured: 1,
        avgWeightUtilizationPct: 80,
        avgVolumeUtilizationPct: 60,
      },
    ]);
    expect(body.overview.definitions.booked_value).toContain('Wholesale orders');
  });

  it("reports the plugin's counts, never a count derived from the capped row reads", async () => {
    const body = (await (await readConsole(request('/api/admin/wholesale/console'))).json()) as {
      workspace: { quotes: unknown[]; orders: unknown[]; applications: unknown[] };
      overview: { quotes: { total: number; quoted_value: number }; orders: { total: number; booked_value: number } };
    };

    // The console holds one order row and no quotation rows at all; the plugin says 312
    // quotations and 41 orders. The smaller number is the one that would be printed if
    // the counts had been re-derived here, and it would be wrong.
    expect(body.workspace.orders).toHaveLength(1);
    expect(body.workspace.quotes).toHaveLength(0);
    expect(body.overview.orders.total).toBe(41);
    expect(body.overview.orders.booked_value).toBe(98765.43);
    expect(body.overview.quotes.total).toBe(312);
    expect(body.overview.quotes.quoted_value).toBe(12345.67);
  });

  it('carries the plugin vocabulary, including the plugin version and its charge keys', async () => {
    const body = (await (await readConsole(request('/api/admin/wholesale/console'))).json()) as {
      workspace: {
        vocabulary: {
          applicationStatuses: string[];
          quoteStatuses: string[];
          orderStatuses: string[];
          incoterms: string[];
          chargeKeys: string[];
          pluginVersion: string | null;
          installedDbVersion: string | null;
        };
      };
    };

    expect(body.workspace.vocabulary.pluginVersion).toBe('1.4.9');
    expect(body.workspace.vocabulary.installedDbVersion).toBe('3');
    expect(body.workspace.vocabulary.chargeKeys).toEqual(['loading', 'documentation']);
    // The console's own lifecycle lists, not the plugin's shorter ones: the dropdowns
    // must offer every status the console can set.
    expect(body.workspace.vocabulary.orderStatuses).toContain('AWAITING_DEPOSIT');
    expect(body.workspace.vocabulary.quoteStatuses).toContain('CONVERTED_TO_ORDER');
    expect(body.workspace.vocabulary.applicationStatuses).toContain('MORE_INFO_REQUIRED');
    expect(body.workspace.vocabulary.incoterms).toEqual(['EXW', 'FOB', 'CFR', 'CIF']);
  });

  it('still renders the records when the plugin cannot describe itself or the freight store is down', async () => {
    vi.mocked(wordpressRequest).mockImplementation(async (path: string, options?: { params?: Record<string, unknown> }) => {
      const resource = options?.params?.resource as string | undefined;
      pluginReads.push({ path, resource });
      if (path.endsWith('/records')) {
        return { resource, items: resource === 'orders' ? [ORDER] : [], count: 0 } as never;
      }
      if (path.endsWith('/overview')) return PLUGIN_OVERVIEW as never;
      if (path.endsWith('/settings')) throw new Error('the schema description is unavailable');
      throw new Error(`unexpected upstream path ${path}`);
    });
    vi.mocked(storefrontRequest).mockRejectedValue(new Error('the settings store is unavailable'));

    const response = await readConsole(request('/api/admin/wholesale/console'));
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      workspace: {
        orders: unknown[];
        freightProvider: { provider: string; ready: boolean; summary: string } | null;
        vocabulary: { pluginVersion: string | null; chargeKeys: string[]; missingTables: string[] };
      };
      overview: { container_utilisation: unknown[] };
    };
    // A plugin that cannot describe its schema, and a freight store that will not answer,
    // are reported as "not known" — not as a failed screen. The records it did answer with
    // are still the console's, which is the whole point of these two being optional.
    expect(body.workspace.vocabulary.pluginVersion).toBeNull();
    expect(body.workspace.vocabulary.chargeKeys).toEqual([]);
    expect(body.workspace.vocabulary.missingTables).toEqual([]);
    // The freight status is still answered: a settings store that will not say whether a
    // provider is configured is "not configured", and the console says so in words rather
    // than claiming live rates are available.
    expect(body.workspace.freightProvider?.provider).toBe('manual');
    expect(body.workspace.freightProvider?.ready).toBe(false);
    expect(body.workspace.freightProvider?.summary).toContain('No live freight provider is connected');
    expect(body.workspace.orders).toHaveLength(1);
    expect(body.overview.container_utilisation).toHaveLength(1);
  });

  it('reports a failed COUNT summary as a failure, because the counts cannot be guessed', async () => {
    vi.mocked(wordpressRequest).mockImplementation(async (path: string, options?: { params?: Record<string, unknown> }) => {
      const resource = options?.params?.resource as string | undefined;
      pluginReads.push({ path, resource });
      if (path.endsWith('/records')) return { resource, items: [], count: 0 } as never;
      if (path.endsWith('/settings')) return PLUGIN_SETTINGS as never;
      throw new Error('the COUNT summary is unavailable');
    });

    const response = await readConsole(request('/api/admin/wholesale/console'));
    expect(response.status).toBe(502);
    expect(((await response.json()) as { error: string }).error).toContain('could not be read');
  });

  it('reports a failed store read as a failure, not as an empty workspace', async () => {
    vi.mocked(wordpressRequest).mockRejectedValue(new Error('upstream refused'));

    const response = await readConsole(request('/api/admin/wholesale/console'));
    expect(response.status).toBe(502);
    const body = (await response.json()) as { error: string };
    expect(body.error).toContain('The wholesale workspace could not be read');
  });
});
