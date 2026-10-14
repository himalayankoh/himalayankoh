/**
 * LeadOS persistence — WordPress, not Supabase.
 *
 * Every function here used to build a Supabase query against `leados_*` tables,
 * with an in-memory Map as a silent fallback when the tables had not been
 * migrated. Both are gone:
 *
 *  - The data now lives in custom tables on WordPress, behind our own
 *    `leados/v1` REST namespace. The WordPress side is
 *    `wordpress/himalayan-koh-leados.php` — schema and endpoints in one file —
 *    and the endpoint contract is documented in
 *    `docs/LEADOS-WORDPRESS-CONTRACT.md`.
 *  - The in-memory fallback is gone deliberately. It made a broken deployment
 *    look like a working one: leads appeared saved, then vanished on the next
 *    request. A failure now surfaces as an error the caller can show.
 *
 * The exported names and signatures are unchanged, so the eight
 * `/api/admin/leados/*` routes that use this module needed no edit at all.
 *
 * Rows come back with the same snake_case keys the Supabase version produced, so
 * the row→record mapping below is the same code that was already written and
 * reviewed rather than a second dialect to maintain.
 *
 * Server-only: the WordPress credential it uses is an administrator application
 * password.
 */

import { WordPressApiError, wordpressRequest } from '@/lib/backend/wordpress';
import { requireWordPressCredentials } from '@/lib/backend/wordpressCredentials';
import type {
  LeadOSProject,
  SavedLeadRecord,
  NormalizedLead,
} from './types';
import { leadIdentity } from './intelligence';

export const HK_DEFAULT_WORKSPACE_ID = '00000000-0000-0000-0000-000000000001';
export const HK_DEFAULT_PROJECT_ID = '00000000-0000-0000-0000-000000000002';

/**
 * The default project's description, used for project-fit scoring before the
 * stored row is read. Kept as a constant because scoring must work even when the
 * WordPress read fails — an unreachable site should not change what "a good fit"
 * means.
 */
export const HK_DEFAULT_PROJECT: LeadOSProject = {
  id: HK_DEFAULT_PROJECT_ID,
  workspaceId: HK_DEFAULT_WORKSPACE_ID,
  name: 'Himalayan Koh — B2B Salt & Minerals',
  website: 'https://himalayankoh.com',
  shortDescription:
    'B2B inquiries for active Himalayan salt licks, livestock bags and the edible jar.',
  productService:
    'Active 2 lb and 30 lb salt licks, 6 lb livestock pouch, 45 lb livestock bag, and 16 oz edible jar. Private-label services require confirmation.',
  targetCustomerDescription:
    'Feed and farm supply retailers, livestock & equine ranches, animal health stores, food co-ops, and bulk spice/salt distributors.',
  industries: [
    'Agriculture',
    'Livestock & Equine',
    'Farm Supplies',
    'Wholesale & Distribution',
    'Specialty Retail',
  ],
  businessCategories: [
    'Feed Store',
    'Farm Supply',
    'Equestrian Store',
    'Veterinary',
    'Supermarket',
  ],
  preferredLocations: [
    'Texas',
    'Montana',
    'Wyoming',
    'Kansas',
    'Nebraska',
    'Oklahoma',
    'Colorado',
    'Iowa',
    'Kentucky',
  ],
  countries: ['United States', 'US'],
  targetBusinessSize: 'SMB to Mid-Market (Retailers, Distributors, Cooperatives)',
  positiveKeywords: [
    'salt lick',
    'feed',
    'farm',
    'tack',
    'equine',
    'livestock',
    'ranch',
    'mineral',
    'wholesale',
    'supply',
    'grain',
    'agriculture',
  ],
  negativeKeywords: ['fast food', 'convenience store', 'gas station', 'car repair', 'pharmacy'],
  idealCustomerProfile:
    'Commercial feed mills, farm supply cooperatives, independent tack & feed shops, livestock ranches, and specialty grocery distributors evaluating Himalayan mineral salt products.',
  notes: 'Authoritative Himalayan Koh B2B ICP project.',
  status: 'active',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  leadCount: 0,
};

// ---------------------------------------------------------------------------
// Request plumbing
// ---------------------------------------------------------------------------

type RawRow = Record<string, any>;

/** A WordPress read/write against the app's own namespace. */
export async function leadosRequest<T>(
  path: string,
  options: { method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: unknown; params?: Record<string, string | number | undefined>; timeoutMs?: number } = {}
): Promise<T> {
  return wordpressRequest<T>(`/leados/v1${path}`, {
    method: options.method ?? 'GET',
    body: options.body,
    params: options.params,
    credentials: requireWordPressCredentials(),
    timeoutMs: options.timeoutMs,
  });
}

/**
 * Turns a WordPress failure into the message the route layer already logs and
 * the console already shows. Kept per-operation so the text names the thing that
 * failed rather than "an error occurred".
 */
function describe(label: string, error: unknown): Error {
  if (error instanceof WordPressApiError) {
    if (error.status === 401) {
      return new Error(
        `${label} failed: WordPress rejected the app credential. Check WORDPRESS_ADMIN_USER / WORDPRESS_ADMIN_APP_PASSWORD.`
      );
    }
    if (error.status === 404) {
      return new Error(
        `${label} failed: the leados/v1 namespace is not available. Is the Himalayan Koh LeadOS plugin active on WordPress?`
      );
    }
    return new Error(`${label} failed: ${error.message}`);
  }
  return new Error(`${label} failed: ${error instanceof Error ? error.message : 'unexpected error'}`);
}

/** Business categories the ICP deliberately excludes, filtered wherever a project is read. */
function withoutPetCategories(categories: unknown): string[] {
  return (Array.isArray(categories) ? categories.map(String) : []).filter(
    (category) => !/pet\s*shop|pet\s*store/i.test(category)
  );
}

function toProject(row: RawRow): LeadOSProject {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    website: row.website,
    shortDescription: row.short_description,
    productService: row.product_service,
    targetCustomerDescription: row.target_customer_description,
    industries: row.industries || [],
    businessCategories: withoutPetCategories(row.business_categories),
    preferredLocations: row.preferred_locations || [],
    countries: row.countries || [],
    targetBusinessSize: row.target_business_size,
    positiveKeywords: row.positive_keywords || [],
    negativeKeywords: row.negative_keywords || [],
    idealCustomerProfile: row.ideal_customer_profile,
    notes: row.notes,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    leadCount: row.lead_count ?? 0,
  };
}

function toSavedLead(row: RawRow): SavedLeadRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    businessName: row.business_name,
    category: row.category,
    address: row.address,
    city: row.city,
    region: row.region,
    country: row.country,
    website: row.website,
    phone: row.phone,
    email: row.email,
    emailSource: row.email_source || (row.email ? 'discovered_osm' : undefined),
    research: row.research || {},
    dataSource: row.data_source,
    osmType: row.osm_type,
    osmId: row.osm_id,
    opportunityScore: row.opportunity_score === null || row.opportunity_score === undefined
      ? null
      : Number(row.opportunity_score),
    opportunitySignals: row.opportunity_signals || null,
    status: row.status,
    starred: Boolean(row.starred),
    tags: row.tags || null,
    notes: row.notes,
    osmUrl: row.osm_url,
    discoveredAt: row.discovered_at || row.created_at,
    createdAt: row.created_at,
    projects: (row.leados_project_leads || []).map((link: RawRow) => ({
      leadId: row.id,
      projectId: link.project_id,
      projectName: 'Project',
      projectFitScore: link.project_fit_score === null ? null : Number(link.project_fit_score),
    })),
  };
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

/**
 * Ensures the default workspace and project exist, returning the default project.
 * The rows are created by the plugin on activation; this call re-asserts them so
 * a plugin installed after the app was deployed, or a project deleted by hand,
 * still leaves the console working.
 */
export async function ensureDefaultProject(): Promise<LeadOSProject> {
  try {
    const response = await leadosRequest<{ id?: string } | null>('/ensure-default', { method: 'POST' });
    if (!response || !response.id) {
      throw new Error('WordPress returned no project.');
    }
    return toProject(response as RawRow);
  } catch (error) {
    throw describe('LeadOS persistence unavailable', error);
  }
}

/** Lists every project in the workspace. */
export async function listProjects(): Promise<LeadOSProject[]> {
  try {
    const response = await leadosRequest<{ projects?: RawRow[] }>('/projects');
    return (response.projects || []).map(toProject);
  } catch (error) {
    throw describe('LeadOS project read', error);
  }
}

/** Gets a single project by ID, or null when it does not exist. */
export async function getProjectById(id: string): Promise<LeadOSProject | null> {
  try {
    const response = await leadosRequest<RawRow | null>(`/projects/${encodeURIComponent(id)}`);
    return response ? toProject(response) : null;
  } catch (error) {
    // A caller asking "what is project X?" is better served by null than by an
    // exception when the answer is simply "there is no such project".
    if (error instanceof WordPressApiError && error.status === 404) return null;
    throw describe('LeadOS project read', error);
  }
}

/** Creates or updates a project. */
export async function saveProject(
  project: Partial<LeadOSProject> & { name: string }
): Promise<LeadOSProject> {
  try {
    const response = await leadosRequest<RawRow>('/projects', {
      method: 'POST',
      body: {
        ...project,
        id: project.id || undefined,
        workspaceId: project.workspaceId || HK_DEFAULT_WORKSPACE_ID,
      },
    });
    return toProject(response);
  } catch (error) {
    throw describe('LeadOS project save', error);
  }
}

// ---------------------------------------------------------------------------
// Saved leads
// ---------------------------------------------------------------------------

/**
 * Saves a discovered lead to the Saved Leads library.
 *
 * De-duplication is the server's job: when the lead carries an OSM identity the
 * plugin updates the existing row and — deliberately — leaves the owner's status,
 * notes, stars and tags alone, so re-running a search cannot undo their triage.
 */
export async function saveLeadToLibrary(
  lead: NormalizedLead & {
    opportunityScore?: number;
    opportunitySignals?: string[];
    projectFitScore?: number;
    projectFitReasons?: string[];
    outreachAngles?: string[];
  },
  projectId?: string
): Promise<SavedLeadRecord> {
  const payload = {
    workspace_id: HK_DEFAULT_WORKSPACE_ID,
    business_name: lead.businessName,
    category: lead.category || null,
    address: lead.address || null,
    city: lead.city || null,
    region: lead.region || null,
    country: lead.country || null,
    website: lead.website || null,
    phone: lead.phone || null,
    email: lead.email || null,
    email_source: lead.emailSource || (lead.email ? 'discovered_osm' : null),
    latitude: lead.latitude,
    longitude: lead.longitude,
    osm_type: lead.osmType,
    osm_id: lead.osmId,
    osm_url: lead.osmUrl,
    data_source: lead.dataSource || 'openstreetmap',
    research: lead.research || {},
    opportunity_score: lead.opportunityScore ?? null,
    opportunity_signals: lead.opportunitySignals || [],
    tags: lead.category ? [lead.category] : [],
    project_fit_score: lead.projectFitScore ?? null,
    project_fit_reasons: lead.projectFitReasons || null,
    outreach_angles: lead.outreachAngles || null,
  };

  try {
    const response = await leadosRequest<{ lead?: RawRow }>('/leads', {
      method: 'POST',
      body: { lead: payload, projectId: projectId || null },
    });
    if (!response?.lead) throw new Error('WordPress returned no lead.');
    return toSavedLead(response.lead);
  } catch (error) {
    throw describe('LeadOS lead save', error);
  }
}

export interface BatchSaveResult {
  savedCount: number;
  failedCount: number;
  savedKeys: Set<string>;
  savedIds: string[];
  errors: string[];
}

/**
 * Genuine server-side batch upsert for Lead Library ingestion.
 * Sends 20-25 records per bounded HTTP request to the WordPress /leads/batch endpoint.
 * Features idempotency, duplicate detection, manual field preservation, per-record
 * reporting, and single retry of failed records.
 */
export async function saveLeadsBatchToLibrary(
  leads: Array<NormalizedLead & {
    opportunityScore?: number;
    opportunitySignals?: string[];
    projectFitScore?: number;
    projectFitReasons?: string[];
    outreachAngles?: string[];
  }>,
  projectId?: string,
  chunkSize = 25
): Promise<BatchSaveResult> {
  if (!leads.length) return { savedCount: 0, failedCount: 0, savedKeys: new Set(), savedIds: [], errors: [] };
  let totalSaved = 0;
  let totalFailed = 0;
  const savedKeys = new Set<string>();
  const savedIds: string[] = [];
  const errors: string[] = [];

  const boundedChunkSize = Math.min(Math.max(chunkSize, 1), 25);

  for (let i = 0; i < leads.length; i += boundedChunkSize) {
    const chunk = leads.slice(i, i + boundedChunkSize);
    const chunkPayload = chunk.map((lead) => ({
      workspace_id: HK_DEFAULT_WORKSPACE_ID,
      business_name: lead.businessName,
      category: lead.category || null,
      address: lead.address || null,
      city: lead.city || null,
      region: lead.region || null,
      country: lead.country || null,
      website: lead.website || null,
      phone: lead.phone || null,
      email: lead.email || null,
      email_source: lead.emailSource || (lead.email ? 'discovered_osm' : null),
      latitude: lead.latitude,
      longitude: lead.longitude,
      osm_type: lead.osmType,
      osm_id: lead.osmId,
      osm_url: lead.osmUrl,
      data_source: lead.dataSource || 'openstreetmap',
      research: lead.research || {},
      opportunity_score: lead.opportunityScore ?? null,
      opportunity_signals: lead.opportunitySignals || [],
      tags: lead.category ? [lead.category] : [],
      project_fit_score: lead.projectFitScore ?? null,
      project_fit_reasons: lead.projectFitReasons || null,
      outreach_angles: lead.outreachAngles || null,
    }));

    let handledBatch = false;
    try {
      const response = await leadosRequest<{
        ok: boolean;
        savedCount: number;
        failedCount: number;
        results: Array<{
          index: number;
          success: boolean;
          id?: string;
          dedupeKey?: string;
          businessName: string;
          error?: string;
        }>;
      }>('/leads/batch', {
        method: 'POST',
        body: { leads: chunkPayload, projectId: projectId || null },
      });

      if (response && Array.isArray(response.results)) {
        handledBatch = true;
        const failedIndices: number[] = [];
        for (const item of response.results) {
          const originalLead = chunk[item.index];
          if (item.success && item.id) {
            totalSaved++;
            savedIds.push(item.id);
            if (item.dedupeKey) savedKeys.add(item.dedupeKey);
            if (originalLead) savedKeys.add(leadIdentity(originalLead));
          } else {
            totalFailed++;
            failedIndices.push(item.index);
            errors.push(`${item.businessName || originalLead?.businessName || 'Lead'}: ${item.error || 'Batch save failed'}`);
          }
        }

        // Single retry for failed records
        if (failedIndices.length > 0) {
          for (const idx of failedIndices) {
            const lead = chunk[idx];
            if (!lead) continue;
            try {
              const res = await saveLeadToLibrary(lead, projectId);
              totalSaved++;
              totalFailed--;
              savedIds.push(res.id);
              savedKeys.add(leadIdentity(lead));
            } catch {
              // remains failed
            }
          }
        }
      }
    } catch {
      handledBatch = false;
    }

    if (!handledBatch) {
      // Fallback for instances where plugin is not yet updated to 2.1.0
      const results = await Promise.allSettled(
        chunk.map((lead) => saveLeadToLibrary(lead, projectId))
      );
      for (let idx = 0; idx < results.length; idx++) {
        const res = results[idx];
        const lead = chunk[idx];
        if (res.status === 'fulfilled') {
          totalSaved++;
          savedIds.push(res.value.id);
          savedKeys.add(leadIdentity(lead));
        } else {
          totalFailed++;
          errors.push(res.reason instanceof Error ? res.reason.message : String(res.reason));
        }
      }
    }
  }

  return {
    savedCount: totalSaved,
    failedCount: totalFailed,
    savedKeys,
    savedIds,
    errors,
  };
}

/**
 * Fast bounded identity checker for candidate discovery leads.
 * Allows LeadOS to scale to tens of thousands of saved leads without
 * ever loading the full library into search requests.
 */
export async function checkSavedIdentities(
  candidates: Array<Pick<NormalizedLead, 'businessName' | 'website' | 'address' | 'city' | 'region'> & { osmType?: string | null; osmId?: string | null }>
): Promise<Map<string, { id: string; status: string }>> {
  const matchMap = new Map<string, { id: string; status: string }>();
  if (!candidates.length) return matchMap;

  try {
    const payload = candidates.slice(0, 250).map((c) => ({
      dedupeKey: leadIdentity(c),
      website: c.website || undefined,
      business_name: c.businessName,
      address: c.address || undefined,
      city: c.city || undefined,
      region: c.region || undefined,
      osm_type: c.osmType || undefined,
      osm_id: c.osmId || undefined,
    }));

    const response = await leadosRequest<{
      ok: boolean;
      matched: Array<{ id: string; dedupeKey: string; businessName: string; website: string; status: string }>;
    }>('/leads/check-identities', {
      method: 'POST',
      body: { candidates: payload },
    });

    if (response?.matched) {
      for (const m of response.matched) {
        if (m.dedupeKey) matchMap.set(m.dedupeKey, { id: m.id, status: m.status });
        if (m.businessName) matchMap.set(`name|${m.businessName.toLowerCase()}`, { id: m.id, status: m.status });
        if (m.website) {
          try {
            const host = new URL(m.website).hostname.replace(/^www\./, '').toLowerCase();
            matchMap.set(`host|${host}`, { id: m.id, status: m.status });
          } catch {
            // ignore
          }
        }
      }
      return matchMap;
    }
  } catch {
    // Continue to graceful fallback
  }

  // Graceful fallback: check bounded library (up to 100 leads) without throwing or crashing
  try {
    const fallback = await listSavedLeads({ limit: 100, page: 1 });
    for (const s of fallback.leads) {
      const idKey = leadIdentity(s);
      matchMap.set(idKey, { id: s.id, status: s.status });
      matchMap.set(`name|${s.businessName.toLowerCase()}`, { id: s.id, status: s.status });
      if (s.website) {
        try {
          const host = new URL(s.website).hostname.replace(/^www\./, '').toLowerCase();
          matchMap.set(`host|${host}`, { id: s.id, status: s.status });
        } catch {
          // ignore
        }
      }
    }
  } catch {
    // continue with empty map
  }

  return matchMap;
}

/** Lists saved leads with filtering and pagination. */
export async function listSavedLeads(options?: {
  search?: string;
  status?: string;
  projectId?: string;
  limit?: number;
  page?: number;
}): Promise<{ leads: SavedLeadRecord[]; total: number }> {
  try {
    const response = await leadosRequest<{ leads?: RawRow[]; total?: number }>('/leads', {
      params: {
        search: options?.search,
        status: options?.status,
        page: options?.page,
        limit: options?.limit,
      },
    });
    const leads = (response.leads || []).map(toSavedLead);
    return { leads, total: response.total ?? leads.length };
  } catch (error) {
    throw describe('LeadOS lead read', error);
  }
}

/** One saved lead by id, or null. */
export async function getSavedLeadById(id: string): Promise<SavedLeadRecord | null> {
  try {
    const response = await leadosRequest<{ leads?: RawRow[] }>('/leads', {
      params: { id, limit: 1 },
    });
    const row = response.leads?.[0];
    return row ? toSavedLead(row) : null;
  } catch (error) {
    throw describe('LeadOS lead read', error);
  }
}

/** Updates status, notes, tags, stars or contact details on a saved lead. */
export async function updateSavedLead(
  id: string,
  patch: Partial<SavedLeadRecord>
): Promise<SavedLeadRecord | null> {
  try {
    const body: Record<string, unknown> = {};
    if (patch.status !== undefined) body.status = patch.status;
    if (patch.starred !== undefined) body.starred = patch.starred;
    if (patch.notes !== undefined) body.notes = patch.notes;
    if (patch.tags !== undefined) body.tags = patch.tags;
    if (patch.email !== undefined) {
      body.email = patch.email;
      body.emailSource = patch.emailSource || 'manually_entered';
    }
    if (patch.phone !== undefined) body.phone = patch.phone;
    if (patch.website !== undefined) body.website = patch.website;
    for (const field of ['address','city','region','country'] as const) if (patch[field] !== undefined) body[field] = patch[field];
    if (patch.research !== undefined) body.research = patch.research;

    const response = await leadosRequest<{ lead?: RawRow | null }>(
      `/leads/${encodeURIComponent(id)}`,
      { method: 'PATCH', body }
    );
    return response?.lead ? toSavedLead(response.lead) : null;
  } catch (error) {
    throw describe('LeadOS lead update', error);
  }
}

/** Deletes a saved lead. Returns false when it was already gone. */
export async function deleteSavedLead(id: string): Promise<boolean> {
  try {
    const response = await leadosRequest<{ deleted?: boolean }>(
      `/leads/${encodeURIComponent(id)}`,
      { method: 'DELETE' }
    );
    return Boolean(response?.deleted);
  } catch (error) {
    throw describe('LeadOS lead delete', error);
  }
}

/** Records a search execution into search history. */
export async function recordSearchExecution(entry: {
  category: string;
  location: string;
  resultsCount: number;
  executionId?: string;
  initialKeys?: string[];
}): Promise<void> {
  try {
    await leadosRequest(entry.executionId ? '/workflow' : '/searches', { method: 'POST', body: entry.executionId ? { action: 'search_history', id: entry.executionId, resultsCount: entry.resultsCount, ...(entry.initialKeys ? { initialKeys: entry.initialKeys } : {}) } : entry });
  } catch (error) {
    throw describe('LeadOS search history write', error);
  }
}

/** Writes one audit entry (outreach, status changes, …). */
export async function recordAuditEntry(entry: {
  action: string;
  entityType?: string;
  entityId?: string;
  details?: Record<string, unknown>;
}): Promise<void> {
  try {
    await leadosRequest('/audit', { method: 'POST', body: entry });
  } catch (error) {
    throw describe('LeadOS audit write', error);
  }
}

/** Dashboard overview stats. */
export async function getLeadOSOverviewStats() {
  try {
    const [statsResponse, projects] = await Promise.all([
      leadosRequest<{ stats?: Record<string, any> }>('/stats'),
      listProjects(),
    ]);
    const stats = statsResponse.stats || {};

    return {
      savedLeadsCount: stats.savedLeadsCount || 0,
      highOpportunityCount: stats.highOpportunityCount || 0,
      contactedCount: stats.contactedCount || 0,
      inPipelineCount: stats.inPipelineCount || 0,
      activeProjectsCount: stats.activeProjectsCount ?? projects.length,
      searchesCount: stats.searchesCount || 0,
      defaultProject:
        projects.find((project) => project.id === HK_DEFAULT_PROJECT_ID) || projects[0] || null,
      recentActivity: (stats.recentActivity || []).map((entry: RawRow) => ({
        description: String(entry.description || 'LeadOS activity'),
        time: entry.time,
      })),
    };
  } catch (error) {
    throw describe('LeadOS stats read', error);
  }
}
