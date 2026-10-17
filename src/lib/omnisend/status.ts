/**
 * What the Omnisend card is allowed to say.
 *
 * The card used to decide between two words — "configured" and "not configured" —
 * from a settings helper that answers `null` for both "the owner has not saved a
 * key" and "WordPress did not answer". So a database hiccup printed *Not
 * Configured* about a key that was sitting in the database, and the owner re-pasted
 * a working credential for no reason.
 *
 * This module owns the difference. It asks the settings store for the key *and the
 * reason it could not be read*, asks Omnisend whether that key authenticates, and
 * reduces the two answers to one of the states below. Every caller that shows a
 * badge reads the same reduction, so the Settings screen and the Marketing screen
 * cannot disagree.
 *
 * Nothing here returns a credential, a contact's email address, or a campaign's
 * contents. Counts and statuses are what a status screen needs.
 */

import { resolveOmnisendCredential } from './client';

const ACCOUNTS_URL = 'https://api.omnisend.com/v3/accounts';
const CONTACTS_URL = 'https://api.omnisend.com/v3/contacts';
const CAMPAIGNS_URL = 'https://api.omnisend.com/v3/campaigns';

/** Provider calls are measured in seconds, not minutes; a status screen must answer. */
const PROVIDER_TIMEOUT_MS = 8_000;

export type OmnisendState =
  /** Omnisend authenticated the stored key and returned a brand. */
  | 'connected'
  /** A key is stored but the provider could not be asked (outage or timeout). */
  | 'configured_unverified'
  /** The provider answered 401: the key it holds is not accepted. */
  | 'invalid_key'
  /** The provider answered 403: the key is real but lacks a required scope. */
  | 'insufficient_permissions'
  /** Omnisend answered 5xx or did not answer in time. */
  | 'provider_unavailable'
  /** The WordPress settings store could not be read, and no Worker secret exists. */
  | 'wordpress_unavailable'
  /** The key would come from the environment, which this deployment has not set. */
  | 'deployment_unconfigured'
  /** The store answered and holds no key. */
  | 'missing';

export interface OmnisendCampaignSummary {
  id: string;
  name: string;
  status: string;
  createdAt: string | null;
}

export interface OmnisendStatus {
  state: OmnisendState;
  /** True only when Omnisend itself authenticated the key on this request. */
  connected: boolean;
  /** True when a credential exists — from WordPress or the Worker environment. */
  configured: boolean;
  /** Where the credential came from. Never the credential itself. */
  source: 'wordpress' | 'env' | null;
  message: string;
  /** What the owner can do next, in their words. */
  action: string | null;
  /** True for states a Retry can plausibly resolve on its own. */
  retryable: boolean;
  brandID: string | null;
  accountName: string | null;
  website: string | null;
  domainVerified: boolean | null;
  apiKeyPermissions: Record<string, boolean> | null;
  contactsCount: number | null;
  subscribedCount: number | null;
  unsubscribedCount: number | null;
  campaigns: OmnisendCampaignSummary[];
  campaignsDraftCount: number | null;
  lastChecked: string;
  /** The HTTP status Omnisend answered with, when it answered. */
  providerStatus: number | null;
}

function base(state: OmnisendState, message: string, action: string | null, retryable: boolean): OmnisendStatus {
  return {
    state,
    connected: false,
    configured: false,
    source: null,
    message,
    action,
    retryable,
    brandID: null,
    accountName: null,
    website: null,
    domainVerified: null,
    apiKeyPermissions: null,
    contactsCount: null,
    subscribedCount: null,
    unsubscribedCount: null,
    campaigns: [],
    campaignsDraftCount: null,
    lastChecked: new Date().toISOString(),
    providerStatus: null,
  };
}

function countFrom(payload: unknown): number | null {
  const paging = (payload as { paging?: { total?: unknown } } | null)?.paging;
  const total = paging?.total;
  return typeof total === 'number' && Number.isFinite(total) ? total : null;
}

async function providerGet(url: string, apiKey: string): Promise<{ status: number; body: unknown; failed: boolean }> {
  try {
    const res = await fetch(url, {
      headers: { 'X-API-KEY': apiKey, Accept: 'application/json' },
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
      cache: 'no-store',
    });
    const body = await res.json().catch(() => null);
    return { status: res.status, body, failed: false };
  } catch {
    // A timeout and a DNS failure are the same thing to the owner: Omnisend did
    // not answer. Neither is a verdict on the key, so neither is reported as one.
    return { status: 0, body: null, failed: true };
  }
}

/**
 * Reads the connection state. `fresh` bypasses the settings cache, which is what
 * the Save and Test paths use so a just-saved key is judged on its own behalf.
 */
export async function readOmnisendStatus(options: { fresh?: boolean } = {}): Promise<OmnisendStatus> {
  const credential = await resolveOmnisendCredential({ fresh: options.fresh });

  if (!credential.key) {
    // Distinguish the three ways a key can be absent. They have different fixes,
    // and only one of them is "paste your key again".
    if (credential.storeFailure?.kind === 'deployment_unconfigured') {
      return base(
        'deployment_unconfigured',
        'This deployment has no WordPress origin configured, so the saved Omnisend key cannot be read.',
        'Set WORDPRESS_BASE_URL on the Worker and redeploy.',
        false,
      );
    }
    if (credential.storeFailure) {
      return {
        ...base(
          'wordpress_unavailable',
          'WordPress did not answer, so the saved Omnisend key could not be checked. This is not the same as a missing key.',
          'Retry in a moment. If it keeps happening, the WordPress origin needs attention.',
          true,
        ),
        retryable: true,
      };
    }
    return base(
      'missing',
      'No Omnisend API key is saved yet.',
      'Paste an API key from app.omnisend.com → Settings → API keys, then save.',
      false,
    );
  }

  const account = await providerGet(ACCOUNTS_URL, credential.key);

  if (account.failed) {
    return {
      ...base(
        'provider_unavailable',
        'The key is saved, but Omnisend did not answer in time. The saved key has not been changed.',
        'Retry. If Omnisend stays unreachable, check status.omnisend.com before changing the key.',
        true,
      ),
      configured: true,
      source: credential.source,
      retryable: true,
    };
  }

  if (account.status === 401) {
    return {
      ...base(
        'invalid_key',
        'Omnisend rejected the saved API key (HTTP 401).',
        'Create a new key in app.omnisend.com → Settings → API keys and save it here.',
        false,
      ),
      configured: true,
      source: credential.source,
      providerStatus: 401,
    };
  }

  if (account.status === 403) {
    return {
      ...base(
        'insufficient_permissions',
        'Omnisend accepted the key but refused this request (HTTP 403): the key is missing a scope it needs.',
        'Re-issue the key with contacts, campaigns and orders permissions.',
        false,
      ),
      configured: true,
      source: credential.source,
      providerStatus: 403,
    };
  }

  if (account.status !== 200) {
    return {
      ...base(
        'provider_unavailable',
        `Omnisend answered HTTP ${account.status} instead of the account record. The saved key has not been changed.`,
        'Retry shortly.',
        true,
      ),
      configured: true,
      source: credential.source,
      providerStatus: account.status,
    };
  }

  const accountBody = (account.body ?? {}) as {
    brandID?: unknown;
    name?: unknown;
    website?: unknown;
    verified?: unknown;
    apiKeyPermissions?: unknown;
  };
  const brandID = typeof accountBody.brandID === 'string' && accountBody.brandID.trim() ? accountBody.brandID : null;

  // A 200 with no brand is not the account record. Reporting it as connected would
  // be the same mistake as the old hardcoded fallback, only quieter.
  if (!brandID) {
    return {
      ...base(
        'provider_unavailable',
        'Omnisend answered, but the response did not contain the account record, so the connection is not verified.',
        'Retry. If it repeats, the API may be degraded.',
        true,
      ),
      configured: true,
      source: credential.source,
      providerStatus: 200,
    };
  }

  const [subscribed, unsubscribed, campaigns] = await Promise.all([
    providerGet(`${CONTACTS_URL}?status=subscribed&limit=1`, credential.key),
    providerGet(`${CONTACTS_URL}?status=unsubscribed&limit=1`, credential.key),
    providerGet(`${CAMPAIGNS_URL}?limit=10`, credential.key),
  ]);

  const campaignsBody = (campaigns.body ?? {}) as { campaigns?: unknown };
  const campaignRows = Array.isArray(campaignsBody.campaigns) ? campaignsBody.campaigns : [];
  const campaignSummaries: OmnisendCampaignSummary[] = campaignRows
    .map((row) => {
      const c = row as Record<string, unknown>;
      return {
        id: String(c.id ?? c.campaignID ?? ''),
        name: String(c.name ?? c.subject ?? ''),
        status: String(c.status ?? 'unknown'),
        createdAt: typeof c.createdAt === 'string' ? c.createdAt : null,
      };
    })
    .filter((c) => c.id !== '');

  const subscribedCount = subscribed.status === 200 ? countFrom(subscribed.body) : null;
  const unsubscribedCount = unsubscribed.status === 200 ? countFrom(unsubscribed.body) : null;
  const contactsCount = subscribedCount !== null && unsubscribedCount !== null ? subscribedCount + unsubscribedCount : null;

  const permissions = accountBody.apiKeyPermissions;
  const apiKeyPermissions =
    permissions && typeof permissions === 'object'
      ? Object.fromEntries(Object.entries(permissions as Record<string, unknown>).map(([k, v]) => [k, v === true]))
      : null;

  const status: OmnisendStatus = {
    ...base('connected', 'Omnisend authenticated the saved key.', null, false),
    connected: true,
    configured: true,
    source: credential.source,
    brandID,
    accountName: typeof accountBody.name === 'string' && accountBody.name.trim() ? accountBody.name : null,
    website: typeof accountBody.website === 'string' && accountBody.website.trim() ? accountBody.website : null,
    domainVerified: typeof accountBody.verified === 'boolean' ? accountBody.verified : null,
    apiKeyPermissions,
    contactsCount,
    subscribedCount,
    unsubscribedCount,
    campaigns: campaignSummaries,
    campaignsDraftCount: campaigns.status === 200 ? campaignSummaries.filter((c) => c.status === 'draft').length : null,
    providerStatus: 200,
  };

  // The account record's own verification flag is the only honest source for this.
  if (status.domainVerified === false) {
    status.message = 'Omnisend authenticated the saved key. The sending domain is not verified yet, so campaigns may not deliver.';
    status.action = 'Verify himalayankoh.com in Omnisend → Settings → Sender domains (SPF and DKIM records).';
  }

  return status;
}
