/**
 * Omnisend Email Marketing & Customer Sync Client
 *
 * Provides contact creation, updating, tagging, and automated event syncing
 * via Omnisend's official v3 API (https://api.omnisend.com/v3).
 *
 * Respects Omnisend Free Tier limits (500 emails/month, 250 contacts) and
 * operates non-blockingly so external service hiccups never compromise the user experience.
 */

import { getSettingWithStatus, type SettingReadFailure } from '@/lib/settings/serverSettings';

const OMNISEND_API_BASE = 'https://api.omnisend.com/v3';
const TIMEOUT_MS = 8000;

export interface OmnisendContactInput {
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  status?: 'subscribed' | 'unsubscribed' | 'nonSubscribed';
  tags?: string[];
  customProperties?: Record<string, unknown>;
}

export interface OmnisendResult {
  ok: boolean;
  contactId?: string;
  error?: string;
  skipped?: boolean;
}

/**
 * The credential, and why it is missing when it is.
 *
 * A caller that only needs the key uses `resolveOmnisendApiKey`. A caller that has to
 * explain the connection uses this, because "no key" has three different causes and
 * only one of them is the owner's to fix.
 */
export interface OmnisendCredential {
  key: string | null;
  source: 'wordpress' | 'env' | null;
  /** Set when the WordPress read failed; null when the store answered. */
  storeFailure: SettingReadFailure | null;
}

export async function resolveOmnisendCredential(options: { fresh?: boolean } = {}): Promise<OmnisendCredential> {
  const fromSettings = await getSettingWithStatus('omnisend', 'api_key', { fresh: options.fresh });
  const stored = fromSettings.value?.trim() ?? '';
  if (stored) return { key: stored, source: 'wordpress', storeFailure: null };

  // The Worker secret is a deliberate fallback: a deployment can hold the key in
  // its environment and still show the same state on the same screen.
  const fromEnv = process.env.OMNISEND_API_KEY?.trim();
  if (fromEnv) return { key: fromEnv, source: 'env', storeFailure: fromSettings.failure };

  return { key: null, source: null, storeFailure: fromSettings.failure };
}

/**
 * Resolves the active Omnisend API key from WordPress options or process environment.
 */
export async function resolveOmnisendApiKey(): Promise<string | null> {
  return (await resolveOmnisendCredential()).key;
}

/**
 * Creates or updates a contact in Omnisend.
 * Fails safely and non-blockingly if Omnisend is offline or unconfigured.
 */
export async function createOrUpdateContact(input: OmnisendContactInput): Promise<OmnisendResult> {
  const email = (input.email || '').trim().toLowerCase();
  if (!email || !email.includes('@')) {
    return { ok: false, error: 'Invalid email address.' };
  }

  const apiKey = await resolveOmnisendApiKey();
  if (!apiKey) {
    return { ok: false, skipped: true, error: 'Omnisend API key not configured.' };
  }

  const payload: Record<string, unknown> = {
    email,
    status: input.status || 'subscribed',
    statusDate: new Date().toISOString(),
  };

  if (input.firstName) payload.firstName = input.firstName.trim();
  if (input.lastName) payload.lastName = input.lastName.trim();
  if (input.phone) payload.phone = input.phone.trim();
  if (Array.isArray(input.tags) && input.tags.length > 0) {
    payload.tags = Array.from(new Set(input.tags.map((t) => t.trim().toLowerCase())));
  }
  if (input.customProperties && Object.keys(input.customProperties).length > 0) {
    payload.customProperties = input.customProperties;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const res = await fetch(`${OMNISEND_API_BASE}/contacts`, {
      method: 'POST',
      headers: {
        'X-API-KEY': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return { ok: false, error: `Omnisend HTTP ${res.status}: ${errText}` };
    }

    const data = (await res.json().catch(() => ({}))) as { contactID?: string };
    return { ok: true, contactId: data.contactID };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Omnisend fetch error: ${errorMsg}` };
  }
}

/**
 * Synchronizes a newsletter subscriber to Omnisend with the 'newsletter' tag.
 */
export async function syncNewsletterSubscriber(email: string, source = 'footer'): Promise<OmnisendResult> {
  return createOrUpdateContact({
    email,
    status: 'subscribed',
    tags: ['newsletter', `source:${source}`, 'himalayan-koh'],
    customProperties: {
      signup_source: source,
      signup_date: new Date().toISOString(),
    },
  });
}

/**
 * Synchronizes a contact form submission to Omnisend with contact tags.
 */
export async function syncContactSubmission(submission: {
  name: string;
  email: string;
  phone?: string;
  subject: string;
  message: string;
}): Promise<OmnisendResult> {
  const parts = (submission.name || '').trim().split(/\s+/).filter(Boolean);
  const firstName = parts[0] || '';
  const lastName = parts.slice(1).join(' ') || '';

  return createOrUpdateContact({
    email: submission.email,
    firstName,
    lastName,
    phone: submission.phone,
    status: 'nonSubscribed',
    tags: ['contact_form', 'website_inquiry', 'himalayan-koh'],
    customProperties: {
      latest_inquiry_subject: submission.subject,
      inquiry_date: new Date().toISOString(),
    },
  });
}

/**
 * Synchronizes a customer order to Omnisend with e-commerce tags.
 */
export async function syncOrderCustomer(order: {
  email: string;
  name?: string;
  phone?: string;
  orderNumber: string;
  total: number;
}): Promise<OmnisendResult> {
  const parts = (order.name || '').trim().split(/\s+/).filter(Boolean);
  const firstName = parts[0] || '';
  const lastName = parts.slice(1).join(' ') || '';

  return createOrUpdateContact({
    email: order.email,
    firstName,
    lastName,
    phone: order.phone,
    status: 'subscribed',
    tags: ['customer', 'ecom_buyer', 'himalayan-koh'],
    customProperties: {
      last_order_number: order.orderNumber,
      last_order_total: order.total,
      last_order_date: new Date().toISOString(),
    },
  });
}

/**
 * Synchronizes an outbound LeadOS CRM prospect to Omnisend.
 */
export async function syncLeadOSProspect(lead: {
  email: string;
  businessName?: string;
  contactName?: string;
  phone?: string;
  city?: string;
  state?: string;
}): Promise<OmnisendResult> {
  const parts = (lead.contactName || '').trim().split(/\s+/).filter(Boolean);
  const firstName = parts[0] || lead.businessName || '';
  const lastName = parts.slice(1).join(' ') || '';

  return createOrUpdateContact({
    email: lead.email,
    firstName,
    lastName,
    phone: lead.phone,
    status: 'nonSubscribed',
    tags: ['leados_prospect', 'wholesale_lead', `state:${(lead.state || 'US').toLowerCase()}`],
    customProperties: {
      business_name: lead.businessName || '',
      city: lead.city || '',
      state: lead.state || '',
      lead_source: 'leados_autonomous_scanner',
    },
  });
}
