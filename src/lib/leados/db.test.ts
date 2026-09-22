import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWordPressStub, type WordPressStub, type WordPressStubRoute } from '@/lib/backend/wordpressTestServer';

// The WordPress base URL is resolved once, at module load, so it must be set
// before `./db` is imported.
vi.hoisted(() => {
  process.env.WORDPRESS_BASE_URL = 'https://himalayankoh.test/staging';
  process.env.WORDPRESS_ADMIN_USER = 'app-admin';
  process.env.WORDPRESS_ADMIN_APP_PASSWORD = 'abcd EFGH ijkl MNOP qrst UVWX';
});

import {
  HK_DEFAULT_PROJECT_ID,
  HK_DEFAULT_WORKSPACE_ID,
  deleteSavedLead,
  ensureDefaultProject,
  getLeadOSOverviewStats,
  getProjectById,
  listProjects,
  listSavedLeads,
  recordAuditEntry,
  recordSearchExecution,
  saveLeadToLibrary,
  updateSavedLead,
} from './db';
import type { NormalizedLead } from './types';

const EXPECTED_BASIC = `Basic ${Buffer.from('app-admin:abcdEFGHijklMNOPqrstUVWX').toString('base64')}`;

const realFetch = globalThis.fetch;

function useWordPress(routes: WordPressStubRoute[]): WordPressStub {
  const stub = createWordPressStub(routes);
  globalThis.fetch = stub.fetch as unknown as typeof fetch;
  return stub;
}

/** A row as MySQL returns it: numeric strings for decimals and bool-ish ints. */
function leadRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'lead-1',
    workspace_id: HK_DEFAULT_WORKSPACE_ID,
    business_name: 'Lone Star Farm & Feed',
    category: 'Feed Store',
    address: null,
    city: 'Houston',
    region: 'Texas',
    country: 'United States',
    website: 'https://example.com',
    phone: '713-555-0199',
    email: 'sales@example.com',
    email_source: 'discovered_osm',
    latitude: '29.7604000',
    longitude: null,
    osm_type: 'node',
    osm_id: '12345678',
    osm_url: 'https://www.openstreetmap.org/node/12345678',
    data_source: 'openstreetmap',
    opportunity_score: '88.50',
    opportunity_signals: ['high commercial priority'],
    status: 'contacted',
    starred: '1',
    tags: ['Feed Store'],
    notes: 'Called 3 Feb',
    discovered_at: '2026-02-01 09:00:00',
    created_at: '2026-02-01 09:00:00',
    updated_at: '2026-02-03 09:00:00',
    leados_project_leads: [{ project_id: 'project-2', project_fit_score: '72.00' }],
    ...overrides,
  };
}

function projectRow(overrides: Record<string, unknown> = {}) {
  return {
    id: HK_DEFAULT_PROJECT_ID,
    workspace_id: HK_DEFAULT_WORKSPACE_ID,
    name: 'Himalayan Koh — B2B Salt & Minerals',
    website: null,
    short_description: null,
    product_service: null,
    target_customer_description: null,
    industries: ['Agriculture'],
    business_categories: ['Feed Store', 'Pet Shop'],
    preferred_locations: [],
    countries: [],
    target_business_size: null,
    positive_keywords: [],
    negative_keywords: [],
    ideal_customer_profile: null,
    notes: null,
    status: 'active',
    created_at: '2026-01-01 00:00:00',
    updated_at: '2026-01-01 00:00:00',
    lead_count: 2,
    ...overrides,
  };
}

const sampleLead: NormalizedLead = {
  businessName: 'Lone Star Farm & Feed',
  category: 'Feed Store',
  address: null,
  city: 'Houston',
  region: 'Texas',
  country: 'United States',
  website: 'https://example.com',
  phone: '713-555-0199',
  email: 'sales@example.com',
  latitude: 29.7604,
  longitude: -95.3698,
  osmType: 'node',
  osmId: '12345678',
  osmUrl: 'https://www.openstreetmap.org/node/12345678',
  dataSource: 'openstreetmap',
};

describe('LeadOS data layer — request plumbing', () => {
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('authenticates as the app administrator against the staging install', async () => {
    const wp = useWordPress([{ path: '/leados/v1/projects', body: { projects: [] } }]);

    await listProjects();

    const [call] = wp.callsTo('/leados/v1/projects', 'GET');
    expect(call.headers.Authorization).toBe(EXPECTED_BASIC);
    expect(call.url).toContain('https://himalayankoh.test/staging/wp-json/leados/v1/projects');
  });

  it('names the credential when WordPress refuses it', async () => {
    useWordPress([
      {
        path: '/leados/v1/leads',
        status: 401,
        body: { code: 'rest_forbidden', message: 'Sorry, you are not allowed to do that.' },
      },
    ]);

    await expect(listSavedLeads()).rejects.toThrow(/WORDPRESS_ADMIN_USER/);
  });

  it('names the plugin when the namespace is missing', async () => {
    useWordPress([]);

    await expect(listSavedLeads()).rejects.toThrow(/Himalayan Koh LeadOS plugin/);
  });

  it('returns null for a project WordPress does not have, instead of throwing', async () => {
    useWordPress([]);

    await expect(getProjectById('missing')).resolves.toBeNull();
  });
});

describe('LeadOS data layer — saving a discovered lead', () => {
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('sends the OSM identity the server de-duplicates on', async () => {
    const wp = useWordPress([
      { path: '/leados/v1/leads', method: 'POST', body: { lead: leadRow() } },
    ]);

    await saveLeadToLibrary(
      { ...sampleLead, opportunityScore: 88.5, opportunitySignals: ['high commercial priority'] },
      'project-2'
    );

    const [call] = wp.callsTo('/leados/v1/leads', 'POST');
    const body = call.body as { lead: Record<string, unknown>; projectId: string };

    expect(body.projectId).toBe('project-2');
    expect(body.lead.osm_type).toBe('node');
    expect(body.lead.osm_id).toBe('12345678');
    expect(body.lead.data_source).toBe('openstreetmap');
    expect(body.lead.workspace_id).toBe(HK_DEFAULT_WORKSPACE_ID);
    expect(body.lead.opportunity_signals).toEqual(['high commercial priority']);
  });

  it('defaults the source to openstreetmap and derives email_source from the address', async () => {
    const wp = useWordPress([
      { path: '/leados/v1/leads', method: 'POST', body: { lead: leadRow() } },
    ]);

    await saveLeadToLibrary({ ...sampleLead, dataSource: '', emailSource: undefined });

    const [call] = wp.callsTo('/leados/v1/leads', 'POST');
    const lead = (call.body as { lead: Record<string, unknown> }).lead;
    expect(lead.data_source).toBe('openstreetmap');
    expect(lead.email_source).toBe('discovered_osm');
  });

  it('coerces a JsonResponse id back to a string and maps the stored row', async () => {
    useWordPress([{ path: '/leados/v1/leads', method: 'POST', body: { lead: leadRow() } }]);

    const saved = await saveLeadToLibrary(sampleLead);

    expect(saved.id).toBe('lead-1');
    expect(saved.businessName).toBe('Lone Star Farm & Feed');
    expect(saved.opportunityScore).toBe(88.5);
    expect(saved.projects?.[0]).toEqual({
      leadId: 'lead-1',
      projectId: 'project-2',
      projectName: 'Project',
      projectFitScore: 72,
    });
  });

  /**
   * De-duplication is decided server-side (see the `leados/v1/import` comments and
   * the plugin's save handler). What the client owes is fidelity: when the server
   * answers with a row that already existed, the owner's triage must come back
   * intact rather than being overwritten with the "new lead" defaults.
   */
  it('surfaces the pre-existing triage when the server matched an existing lead', async () => {
    useWordPress([
      {
        path: '/leados/v1/leads',
        method: 'POST',
        // Same lead, already triaged by the owner.
        body: {
          lead: leadRow({
            id: 'existing-lead-7',
            status: 'qualified',
            starred: '1',
            notes: 'Spoke to the buyer — wants pricing',
            tags: ['Feed Store', 'high-priority'],
          }),
        },
      },
    ]);

    const saved = await saveLeadToLibrary(sampleLead);

    expect(saved.id).toBe('existing-lead-7');
    expect(saved.status).toBe('qualified');
    expect(saved.starred).toBe(true);
    expect(saved.notes).toBe('Spoke to the buyer — wants pricing');
    expect(saved.tags).toEqual(['Feed Store', 'high-priority']);
  });

  it('reports a lead-less response as a failure rather than a silent success', async () => {
    useWordPress([{ path: '/leados/v1/leads', method: 'POST', body: {} }]);

    await expect(saveLeadToLibrary(sampleLead)).rejects.toThrow(/returned no lead/);
  });
});

describe('LeadOS data layer — reading the library', () => {
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('maps rows, nested project links and the server total', async () => {
    useWordPress([
      {
        path: '/leados/v1/leads',
        body: { leads: [leadRow(), leadRow({ id: 'lead-2', starred: 0, notes: null })], total: 17 },
      },
    ]);

    const { leads, total } = await listSavedLeads();

    expect(total).toBe(17);
    expect(leads).toHaveLength(2);
    expect(leads[0].opportunityScore).toBe(88.5);
    expect(leads[0].starred).toBe(true);
    expect(leads[0].emailSource).toBe('discovered_osm');
    expect(leads[0].osmUrl).toBe('https://www.openstreetmap.org/node/12345678');
    expect(leads[1].starred).toBe(false);
    expect(leads[1].notes).toBeNull();
  });

  it('falls back to the row count when the server sends no total', async () => {
    useWordPress([{ path: '/leados/v1/leads', body: { leads: [leadRow()] } }]);

    const { total } = await listSavedLeads();

    expect(total).toBe(1);
  });

  it('sends search, status and paging as query parameters', async () => {
    const wp = useWordPress([{ path: '/leados/v1/leads', body: { leads: [] } }]);

    await listSavedLeads({ search: 'lone star', status: 'contacted', page: 3, limit: 25 });

    const [call] = wp.callsTo('/leados/v1/leads', 'GET');
    expect(call.query.get('search')).toBe('lone star');
    expect(call.query.get('status')).toBe('contacted');
    expect(call.query.get('page')).toBe('3');
    expect(call.query.get('limit')).toBe('25');
  });

  it('treats a null opportunity score as null rather than zero', async () => {
    useWordPress([
      { path: '/leados/v1/leads', body: { leads: [leadRow({ opportunity_score: null })] } },
    ]);

    const [lead] = (await listSavedLeads()).leads;

    expect(lead.opportunityScore).toBeNull();
  });
});

describe('LeadOS data layer — updating a saved lead', () => {
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('patches only the fields the console can edit', async () => {
    const wp = useWordPress([
      { path: '/leados/v1/leads/lead-1', method: 'PATCH', body: { lead: leadRow({ status: 'qualified' }) } },
    ]);

    const updated = await updateSavedLead('lead-1', {
      status: 'qualified',
      notes: 'good fit',
      // Not editable through this path — must not reach WordPress.
      opportunityScore: 99,
      businessName: 'Renamed',
    });

    const [call] = wp.callsTo('/leados/v1/leads/lead-1', 'PATCH');
    const body = call.body as Record<string, unknown>;
    expect(body).toEqual({ status: 'qualified', notes: 'good fit' });
    expect(body.opportunityScore).toBeUndefined();
    expect(body.business_name).toBeUndefined();
    expect(updated?.status).toBe('qualified');
  });

  it('records a hand-entered email as manually_entered', async () => {
    const wp = useWordPress([
      { path: '/leados/v1/leads/lead-1', method: 'PATCH', body: { lead: leadRow() } },
    ]);

    await updateSavedLead('lead-1', { email: 'buyer@feedstore.com' });

    const [call] = wp.callsTo('/leados/v1/leads/lead-1', 'PATCH');
    expect(call.body).toMatchObject({
      email: 'buyer@feedstore.com',
      emailSource: 'manually_entered',
    });
  });

  it('returns null when the lead is not in the active workspace', async () => {
    useWordPress([{ path: '/leados/v1/leads/gone', method: 'PATCH', body: { lead: null } }]);

    await expect(updateSavedLead('gone', { status: 'contacted' })).resolves.toBeNull();
  });

  it('deletes a lead and reports whether it existed', async () => {
    const wp = useWordPress([
      { path: '/leados/v1/leads/lead-1', method: 'DELETE', body: { deleted: true } },
      { path: '/leados/v1/leads/lead-2', method: 'DELETE', body: { deleted: false } },
    ]);

    await expect(deleteSavedLead('lead-1')).resolves.toBe(true);
    await expect(deleteSavedLead('lead-2')).resolves.toBe(false);
    expect(wp.callsTo('/leados/v1/leads/lead-1', 'DELETE')).toHaveLength(1);
  });

  it('URL-encodes an id before putting it on the path', async () => {
    const wp = useWordPress([
      { path: '/leados/v1/leads/lead%2F1', method: 'DELETE', body: { deleted: true } },
    ]);

    await deleteSavedLead('lead/1');

    // A slash in an id must not become a path separator.
    expect(wp.calls.map((call) => call.path)).toContain('/leados/v1/leads/lead%2F1');
  });
});

describe('LeadOS data layer — history, audit and stats', () => {
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('records a search execution', async () => {
    const wp = useWordPress([{ path: '/leados/v1/searches', method: 'POST', body: { ok: true } }]);

    await recordSearchExecution({ category: 'Feed Store', location: 'Texas', resultsCount: 42 });

    const [call] = wp.callsTo('/leados/v1/searches', 'POST');
    expect(call.body).toEqual({ category: 'Feed Store', location: 'Texas', resultsCount: 42 });
  });

  it('sends the outreach audit entry with its entity reference', async () => {
    const wp = useWordPress([{ path: '/leados/v1/audit', method: 'POST', body: { ok: true } }]);

    await recordAuditEntry({
      action: 'outreach_delivered',
      entityType: 'lead',
      entityId: 'lead-1',
      details: { provider: 'smtp', subject: 'Salt licks' },
    });

    const [call] = wp.callsTo('/leados/v1/audit', 'POST');
    expect(call.body).toEqual({
      action: 'outreach_delivered',
      entityType: 'lead',
      entityId: 'lead-1',
      details: { provider: 'smtp', subject: 'Salt licks' },
    });
  });

  it('composes the overview from the stats and project endpoints', async () => {
    useWordPress([
      {
        path: '/leados/v1/stats',
        body: {
          stats: {
            savedLeadsCount: 12,
            highOpportunityCount: 4,
            contactedCount: 3,
            inPipelineCount: 5,
            searchesCount: 9,
            recentActivity: [{ description: 'lead_saved', time: '2026-02-01 09:00:00' }],
          },
        },
      },
      {
        path: '/leados/v1/projects',
        body: { projects: [projectRow({ id: 'other' }), projectRow()] },
      },
    ]);

    const stats = await getLeadOSOverviewStats();

    expect(stats.savedLeadsCount).toBe(12);
    expect(stats.highOpportunityCount).toBe(4);
    expect(stats.contactedCount).toBe(3);
    expect(stats.inPipelineCount).toBe(5);
    expect(stats.searchesCount).toBe(9);
    expect(stats.recentActivity).toEqual([
      { description: 'lead_saved', time: '2026-02-01 09:00:00' },
    ]);
    // The default project is selected by id, not by position.
    expect(stats.defaultProject?.id).toBe(HK_DEFAULT_PROJECT_ID);
    expect(stats.activeProjectsCount).toBe(2);
  });

  it('maps projects, dropping the categories the ICP excludes', async () => {
    useWordPress([{ path: '/leados/v1/projects', body: { projects: [projectRow()] } }]);

    const [project] = await listProjects();

    expect(project.leadCount).toBe(2);
    expect(project.businessCategories).toEqual(['Feed Store']);
    expect(project.businessCategories).not.toContain('Pet Shop');
  });

  it('re-asserts the default project and returns the stored row', async () => {
    const wp = useWordPress([
      { path: '/leados/v1/ensure-default', method: 'POST', body: projectRow() },
    ]);

    const project = await ensureDefaultProject();

    expect(project.id).toBe(HK_DEFAULT_PROJECT_ID);
    expect(wp.callsTo('/leados/v1/ensure-default', 'POST')).toHaveLength(1);
  });

  it('refuses a default project response that carries no id', async () => {
    useWordPress([{ path: '/leados/v1/ensure-default', method: 'POST', body: {} }]);

    await expect(ensureDefaultProject()).rejects.toThrow(/persistence unavailable/);
  });
});
