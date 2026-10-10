/**
 * The app's server-side client for the site-content half of `hk-storefront/v1`.
 *
 * Everything the storefront used to keep in Supabase that is neither a WooCommerce
 * concern nor a customer's own account state is owned by WordPress now, and this is
 * the one module that talks to it:
 *
 *   - admin settings the console edits          → WordPress options
 *   - category-hub overrides                    → WordPress options
 *   - first-party storefront events             → a table (append-only)
 *   - newsletter subscribers, contact messages  → a table each
 *
 * ## The request itself lives elsewhere
 *
 * `lib/wordpress/storefrontClient.ts` owns the namespace, the credential and the
 * timeout, because the Hermes evidence store talks to the same namespace and one
 * shared request path beats two that drift.
 */

import { storefrontRequest as call } from './storefrontClient';
import { SETTINGS_REGISTRY } from '../settings/registry';

/**
 * A category key as both halves of this client spell it.
 *
 * WordPress sanitises the key it stores, so a key sent with capitals would be saved
 * under a different name than the one later requested and the override would look
 * lost. Normalising here — before the request — is what keeps a read and a write of
 * the same category talking about the same option.
 */
function normaliseCategoryKey(key: string): string {
  return String(key || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '');
}

// ---------------------------------------------------------------------------
// Settings (WordPress options, one option per category)
// ---------------------------------------------------------------------------

export interface SettingsCategoryResponse {
  category: string;
  values: Record<string, string | null>;
}

export const siteSettingsApi = {
  async read(category: string): Promise<Record<string, string | null>> {
    const response = await call<SettingsCategoryResponse>('/settings', {
      params: { category: normaliseCategoryKey(category) },
    });
    const values = response.values && typeof response.values === 'object' ? { ...response.values } : {};
    // WordPress sanitize_key lowercases persisted field names. Restore the
    // registered app spelling on reads so a successful save round-trips. Keep
    // unregistered collection keys intact and prefer the current stored value
    // over a legacy mixed-case duplicate.
    const fields = SETTINGS_REGISTRY.find(c => c.id === normaliseCategoryKey(category))?.fields ?? [];
    for (const field of fields) {
      const storedKey = field.key.toLowerCase();
      if (storedKey in values) values[field.key] = values[storedKey];
    }
    return values;
  },

  /**
   * Write a whole category at once.
   *
   * A form save is all-or-nothing: a per-key loop can leave half a form written,
   * which is the state that makes an owner stop trusting the screen.
   */
  async write(category: string, values: Record<string, string | null>): Promise<void> {
    await call<{ ok: boolean }>('/settings', {
      method: 'POST',
      body: { category: normaliseCategoryKey(category), values },
    });
  },

  /** Remove one stored value — a campaign record that no longer exists, say. */
  async remove(category: string, key: string): Promise<void> {
    await call<{ ok: boolean }>('/settings', {
      method: 'DELETE',
      params: { category: normaliseCategoryKey(category), key },
    });
  },
};

// ---------------------------------------------------------------------------
// Category hub overrides
// ---------------------------------------------------------------------------

/** The stored override, exactly as the plugin returned it. */
export type StoredHubOverride = {
  category_key: string;
  hero: unknown;
  seo: unknown;
  trust_points: unknown;
  is_published: boolean;
  updated_at: string;
};

export const categoryHubOverridesApi = {
  async get(key: string): Promise<StoredHubOverride | null> {
    const response = await call<{ override: StoredHubOverride | null }>('/category-hubs/one', {
      params: { key: normaliseCategoryKey(key) },
    });
    return response.override ?? null;
  },

  async list(): Promise<StoredHubOverride[]> {
    const response = await call<{ items: StoredHubOverride[] }>('/category-hubs');
    return Array.isArray(response.items) ? response.items : [];
  },

  async save(input: {
    category_key: string;
    hero: unknown;
    seo: unknown;
    trust_points: unknown;
    is_published: boolean;
  }): Promise<StoredHubOverride> {
    const response = await call<{ ok: boolean; override: StoredHubOverride }>('/category-hubs', {
      method: 'POST',
      body: { ...input, category_key: normaliseCategoryKey(input.category_key) },
    });
    return response.override;
  },
};

// ---------------------------------------------------------------------------
// First-party storefront events
// ---------------------------------------------------------------------------

/** One recorded event, as the plugin stores it. */
export interface SiteEventRecord {
  id: number;
  event: string;
  path: string;
  referrer: string;
  visitor_id: string;
  session_id: string;
  device: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  item_ids: string[];
  value: number | null;
  currency: string;
  occurred_at: string;
}

/** Events aggregated by path and name with 7/30/90-day windows. */
export interface SiteEventSummaryRow {
  path: string;
  event: string;
  total: number;
  w7: number;
  w30: number;
  w90: number;
}

export interface SiteEventInput {
  event: string;
  path: string;
  referrer?: string | null;
  visitor_id?: string | null;
  session_id?: string | null;
  device?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  item_ids?: string[];
  value?: number | null;
  currency?: string | null;
}

export const siteEventsApi = {
  async record(input: SiteEventInput): Promise<void> {
    await call<{ ok: boolean }>('/events', { method: 'POST', body: input });
  },

  /**
   * Aggregates in SQL rather than by shipping rows here to count them: the table
   * grows with traffic and every analytics screen asks for the same grouping.
   */
  async summary(events?: string[]): Promise<SiteEventSummaryRow[]> {
    const response = await call<{ summary: SiteEventSummaryRow[] }>('/events/summary', {
      params: { events: events && events.length ? events.join(',') : undefined },
    });
    return Array.isArray(response.summary) ? response.summary : [];
  },

  async list(options: { limit?: number; since?: string; events?: string[] } = {}): Promise<SiteEventRecord[]> {
    const response = await call<{ items: SiteEventRecord[] }>('/events', {
      params: {
        limit: options.limit,
        since: options.since,
        events: options.events && options.events.length ? options.events.join(',') : undefined,
      },
    });
    return Array.isArray(response.items) ? response.items : [];
  },
};

// ---------------------------------------------------------------------------
// Newsletter and contact
// ---------------------------------------------------------------------------

export interface NewsletterSubscriber {
  id: number;
  email: string;
  source: string;
  created_at: string;
}

export interface ContactSubmission {
  id: number;
  name: string;
  email: string;
  phone: string;
  subject: string;
  message: string;
  created_at: string;
}

export const newsletterApi = {
  /** Returns false when the address was already subscribed — reported, not hidden. */
  async subscribe(email: string, source: string): Promise<boolean> {
    const response = await call<{ ok: boolean; created: boolean }>('/newsletter', {
      method: 'POST',
      body: { email, source },
    });
    return response.created === true;
  },

  async list(limit = 200): Promise<NewsletterSubscriber[]> {
    const response = await call<{ items: NewsletterSubscriber[] }>('/newsletter', { params: { limit } });
    return Array.isArray(response.items) ? response.items : [];
  },
};

export const contactApi = {
  async submit(input: {
    name: string;
    email: string;
    phone?: string;
    subject: string;
    message: string;
  }): Promise<number> {
    const response = await call<{ ok: boolean; id: number }>('/contact', { method: 'POST', body: input });
    return response.id;
  },

  async list(limit = 200): Promise<ContactSubmission[]> {
    const response = await call<{ items: ContactSubmission[] }>('/contact', { params: { limit } });
    return Array.isArray(response.items) ? response.items : [];
  },
};
