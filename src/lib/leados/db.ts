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
  website: 'https://preview.himalayankoh.com',
  shortDescription:
    'Wholesale & B2B distribution of Himalayan rock salt animal licks and bulk culinary salt.',
  productService:
    'Natural animal mineral salt licks (rope, carved, block), bulk organic pink salt, spa/bath minerals.',
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
async function leadosRequest<T>(
  path: string,
  options: { method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: unknown; params?: Record<string, string | number | undefined> } = {}
): Promise<T> {
  return wordpressRequest<T>(`/leados/v1${path}`, {
    method: options.method ?? 'GET',
    body: options.body,
    params: options.params,
    credentials: requireWordPressCredentials(),
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
}): Promise<void> {
  try {
    await leadosRequest('/searches', { method: 'POST', body: entry });
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
