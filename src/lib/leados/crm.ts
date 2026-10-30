/**
 * CRM lead inbox — WordPress, not Supabase.
 *
 * The two `/api/crm/*` routes used to query `crm_leads` through the Supabase
 * admin client directly (they never went through `lib/supabase/api/crm.ts`).
 * They now read and write the same table on WordPress, behind the plugin's
 * `crm/v1/leads` route.
 *
 * Rows are normalised here rather than at each call site. MySQL hands back
 * booleans as the strings "0"/"1", and `"0"` is truthy in JavaScript — leaving
 * that to a caller is how a CSV export ends up claiming every lead used a
 * coupon. One place converts, so the export and the JSON view agree.
 *
 * Server-only: it uses the WordPress administrator application password.
 */

import { WordPressApiError, wordpressRequest } from '@/lib/backend/wordpress';
import { requireWordPressCredentials } from '@/lib/backend/wordpressCredentials';

type RawRow = Record<string, any>;

export interface CrmLeadFilters {
  search?: string;
  source?: string;
  couponUsed?: '0' | '1';
}

export interface CrmLead {
  id: number;
  email: string;
  name: string | null;
  phone: string | null;
  company: string | null;
  source: string | null;
  page_url: string | null;
  coupon_code: string | null;
  coupon_used: boolean;
  opted_in: boolean;
  status: string | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/** MySQL returns 0/1 (often as strings); the app wants a real boolean. */
function toBoolean(value: unknown): boolean {
  return value === true || value === 1 || value === '1';
}

function toCrmLead(row: RawRow): CrmLead {
  return {
    id: Number(row.id),
    email: String(row.email ?? ''),
    name: row.name ?? null,
    phone: row.phone ?? null,
    company: row.company ?? null,
    source: row.source ?? null,
    page_url: row.page_url ?? null,
    coupon_code: row.coupon_code ?? null,
    coupon_used: toBoolean(row.coupon_used),
    opted_in: toBoolean(row.opted_in),
    status: row.status ?? null,
    notes: row.notes ?? null,
    metadata: row.metadata && typeof row.metadata === 'object' ? row.metadata : {},
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? ''),
  };
}

function describe(label: string, error: unknown): Error {
  if (error instanceof WordPressApiError) {
    if (error.status === 401) {
      return new Error(
        `${label}: WordPress rejected the app credential. Check WORDPRESS_ADMIN_USER / WORDPRESS_ADMIN_APP_PASSWORD.`
      );
    }
    if (error.status === 404) {
      return new Error(`${label}: the crm/v1 namespace is missing. Is the LeadOS plugin active?`);
    }
    return new Error(`${label}: ${error.message}`);
  }
  return new Error(`${label}: ${error instanceof Error ? error.message : 'unexpected error'}`);
}

export interface NewCrmLead {
  email: string;
  name?: string | null;
  phone?: string | null;
  company?: string | null;
  source?: string | null;
  page_url?: string | null;
  coupon_code?: string | null;
  metadata?: Record<string, unknown>;
  opted_in?: boolean;
}

/** Records a captured lead. Throws an honest Error on failure. */
export async function createCrmLead(input: NewCrmLead): Promise<CrmLead> {
  try {
    const response = await wordpressRequest<{ lead?: RawRow }>('/crm/v1/leads', {
      method: 'POST',
      credentials: requireWordPressCredentials(),
      body: input,
    });
    if (!response?.lead) throw new Error('WordPress returned no lead.');
    return toCrmLead(response.lead);
  } catch (error) {
    throw describe('Failed to save lead', error);
  }
}

/** Lists captured leads, newest first, with the console's filters applied. */
export async function listCrmLeads(filters: CrmLeadFilters = {}): Promise<CrmLead[]> {
  try {
    const response = await wordpressRequest<{ leads?: RawRow[] }>('/crm/v1/leads', {
      credentials: requireWordPressCredentials(),
      params: {
        search: filters.search,
        source: filters.source,
        couponUsed: filters.couponUsed,
      },
    });
    if (!Array.isArray(response.leads)) throw new Error('WordPress returned an invalid lead list.');
    return response.leads.map(toCrmLead);
  } catch (error) {
    throw describe('Failed to list CRM leads', error);
  }
}
