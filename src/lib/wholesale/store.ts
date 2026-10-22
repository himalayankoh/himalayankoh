/**
 * One request path for `hk-wholesale/v1`, the wholesale plugin's namespace.
 *
 * ## Server-only, and why
 *
 * The credential is an administrator application password — full site access. So
 * this module is imported only by route handlers, never by a component. The
 * browser's only door to wholesale is the app's own `/api/wholesale/*` (buyers)
 * and `/api/admin/wholesale/*` (the console), and both of those decide for
 * themselves who is asking. Nothing here ever sees a buyer-supplied account id:
 * the caller passes the id it derived from a verified session.
 *
 * ## Why one function for every table
 *
 * The plugin stores thirteen kinds of record behind one allowlisted endpoint, and
 * the allowlist is what decides what may be written — the name is a parameter, not
 * a path segment. Mirroring that shape here (rather than thirteen near-identical
 * functions) keeps one timeout, one failure mode and one place to add a resource.
 * `WholesaleResource` is the union, so a typo is a type error rather than a 400 at
 * runtime.
 *
 * ## Failure is stated, never softened
 *
 * A wholesale read that fails throws. The screens that call it decide whether to
 * show an empty state or an error, and they are given the plugin's own message to
 * show — a "0 buyers" that is really "WordPress is unreachable" is exactly the
 * kind of number this subsystem must not print.
 */

import { WordPressApiError, wordpressRequest, type QueryValue } from '@/lib/backend/wordpress';
import { requireWordPressCredentials } from '@/lib/backend/wordpressCredentials';
import { backendConfig } from '@/lib/backend/config';

const BASE = '/hk-wholesale/v1';

/**
 * How long one round trip to the plugin may take.
 *
 * Twenty seconds is generous for a single record and is meant to fail *fast*: a
 * WordPress that has not answered in twenty seconds is not going to. It is the right
 * ceiling for a read that the owner is waiting on by name (one product, one quote).
 */
export const WHOLESALE_READ_TIMEOUT_MS = 20_000;

/**
 * The ceiling for a read that fans out to every store at once.
 *
 * The console's workspace read is fourteen round trips to the plugin (thirteen record
 * sets plus the plugin's settings), and its first paint waits for all of them. Measured
 * against the staging host — roughly 1 s per REST call, and a burst of fourteen queues
 * to about 5 s — that aggregate call takes ~5 s warm and was measured at 17.5 s cold,
 * against the 20 s single-read ceiling. The result was a console that greeted its owner
 * with "WordPress request timed out after 20000ms" and nothing else, until it was tried
 * again.
 *
 * A per-request ceiling is the wrong shape for an aggregate: it is not fourteen reads
 * in sequence, it is one screen. So the fan-out is allowed the time fourteen round
 * trips can actually take, and a *single* record still fails fast on the shorter one.
 */
export const WHOLESALE_AGGREGATE_TIMEOUT_MS = 45_000;

/** Every record type the plugin stores. The plugin refuses anything else. */
export type WholesaleResource =
  | 'accounts'
  | 'applications'
  | 'products'
  | 'price_tiers'
  | 'suppliers'
  | 'origins'
  | 'cost_profiles'
  | 'freight_rates'
  | 'port_charges'
  | 'container_profiles'
  | 'quotes'
  | 'orders'
  | 'audit';

/** The resource names the admin API accepts, in one place. */
export const WHOLESALE_RESOURCES: readonly WholesaleResource[] = [
  'accounts',
  'applications',
  'products',
  'price_tiers',
  'suppliers',
  'origins',
  'cost_profiles',
  'freight_rates',
  'port_charges',
  'container_profiles',
  'quotes',
  'orders',
  'audit',
];

export function isWholesaleResource(value: string): value is WholesaleResource {
  return (WHOLESALE_RESOURCES as readonly string[]).includes(value);
}

/** A record as the plugin returns it: its own columns, JSON columns decoded. */
export type WholesaleRow = Record<string, unknown>;

/** The origin is not configured — said out loud rather than turned into an empty list. */
function assertConfigured(): void {
  if (!backendConfig.wordpressApiRoot) {
    throw new WordPressApiError({
      message:
        'WordPress is not configured for this deployment (WORDPRESS_BASE_URL is empty), so the wholesale endpoints cannot be reached.',
      path: BASE,
      status: 0,
    });
  }
}

async function wholesaleRequest<T>(
  path: string,
  options: {
    method?: 'GET' | 'POST' | 'DELETE';
    params?: Record<string, QueryValue>;
    body?: unknown;
    timeoutMs?: number;
  } = {}
): Promise<T> {
  assertConfigured();
  const method = options.method ?? 'GET';

  /**
   * Every trade read is unique in its URL, on purpose.
   *
   * A staging run proved why: the same `?email_verification_token=…` URL answered
   * from a cache with the row as it was *before* the token was cleared, so a
   * single-use confirmation link worked three times in a row. The plugin now sends
   * `Cache-Control: no-store`, but nothing in this app should depend on every cache
   * between it and WordPress honouring a header. A cache-busting parameter is the one
   * defence that does not need the middlebox to cooperate, and the wholesale
   * namespace is small enough that it costs nothing.
   */
  const params: Record<string, QueryValue> = { ...(options.params ?? {}) };
  if (method === 'GET') {
    params._hk_cb = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  }

  return wordpressRequest<T>(`${BASE}${path}`, {
    method,
    params,
    body: options.body,
    credentials: requireWordPressCredentials(),
    timeoutMs: options.timeoutMs ?? WHOLESALE_READ_TIMEOUT_MS,
  });
}

/* ------------------------------------------------------------------ */
/* Records                                                             */
/* ------------------------------------------------------------------ */

/** Filters the plugin understands. An unknown key is ignored by it, not an error. */
export interface WholesaleFilters {
  id?: number;
  email?: string;
  status?: string;
  code?: string;
  side?: string;
  origin_port?: string;
  destination_port?: string;
  container_type?: string;
  wholesale_sku?: string;
  /** A quotation or order reference as a person quotes it in an email. */
  ref?: string;
  /** Which entity an audit row is about (`quotes`, `orders`, `accounts`). */
  entity?: string;
  /** The audit action, for narrowing a history to one kind of event. */
  action?: string;
  account_id?: number;
  product_id?: number;
  woo_product_id?: number;
  origin_id?: number;
  supplier_id?: number;
  /** The row an audit entry is about. */
  entity_id?: number;
  /** The dealer an order belongs to. */
  dealer_id?: number;
  /**
   * The single-use token in an applicant's confirmation email.
   *
   * Used by `/api/wholesale/verify-email` with this module's administrator
   * credential — the token is looked up server-side, so the plugin needs no public
   * endpoint and the wholesale namespace stays entirely behind `manage_options`.
   */
  email_verification_token?: string;
  quote_id?: number;
  active?: boolean;
  limit?: number;
  order?: string;
}

export async function listWholesaleRecords<R = WholesaleRow>(
  resource: WholesaleResource,
  filters: WholesaleFilters = {},
  /** A longer ceiling, for the screens that read every store in one go. */
  options: { timeoutMs?: number } = {}
): Promise<R[]> {
  const params: Record<string, QueryValue> = { resource };
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === '') continue;
    params[key] = value as QueryValue;
  }
  const result = await wholesaleRequest<{ items?: R[] }>('/records', { params, timeoutMs: options.timeoutMs });
  return result.items ?? [];
}

export async function getWholesaleRecord<R = WholesaleRow>(
  resource: WholesaleResource,
  id: number
): Promise<R> {
  const result = await wholesaleRequest<{ record: R }>('/records/one', {
    params: { resource, id },
  });
  return result.record;
}

/**
 * Creates (`id` absent) or updates (`id` given) one record.
 *
 * `actor` is written to the audit trail. It is the console user's identity, which
 * the admin route took from the verified session — never something the client
 * typed.
 */
export async function upsertWholesaleRecord<R = WholesaleRow>(
  resource: WholesaleResource,
  data: Record<string, unknown>,
  options: { id?: number; actor?: string } = {}
): Promise<R> {
  const result = await wholesaleRequest<{ record: R }>('/records', {
    method: 'POST',
    body: { resource, id: options.id ?? 0, data, actor: options.actor ?? '' },
  });
  return result.record;
}

export async function deleteWholesaleRecord(
  resource: WholesaleResource,
  id: number
): Promise<{ deleted: boolean }> {
  return wholesaleRequest<{ deleted: boolean }>('/records', {
    method: 'DELETE',
    params: { resource, id },
  });
}

/* ------------------------------------------------------------------ */
/* Applications, accounts, catalog, overview                           */
/* ------------------------------------------------------------------ */

export interface WholesaleApplicationResult {
  record: WholesaleRow;
  reference: string;
}

/** Submits (or re-submits) an application. Idempotent per email in the plugin. */
export async function submitWholesaleApplication(
  data: Record<string, unknown>
): Promise<WholesaleApplicationResult> {
  return wholesaleRequest<WholesaleApplicationResult>('/apply', { method: 'POST', body: data });
}

export interface WholesaleDecisionResult {
  application: WholesaleRow;
  account: WholesaleRow | null;
  /**
   * What happened to the buyer's WordPress sign-in account.
   *
   * Approval creates one when the email had none, because a WordPress user is where
   * the password lives and an approved buyer with no user cannot sign in at all. It is
   * reported rather than assumed: "approved" and "can sign in" are different facts.
   */
  buyerUser?: {
    created: boolean;
    emailed: boolean;
    userId: number;
    role: string;
    message: string;
  } | null;
  /**
   * Set when a rejection or suspension also moved the buyer's account to SUSPENDED.
   * That is the row the buyer routes authorise against, so without it "suspend" was
   * a change to an application screen and nothing more.
   */
  accountSuspended?: boolean;
}

/** Approves/rejects an application and, on approval, creates the buyer's account. */
export async function decideWholesaleApplication(input: {
  applicationId: number;
  decision: string;
  note?: string;
  actor?: string;
}): Promise<WholesaleDecisionResult> {
  return wholesaleRequest<WholesaleDecisionResult>('/decide', {
    method: 'POST',
    body: {
      application_id: input.applicationId,
      decision: input.decision,
      note: input.note ?? '',
      actor: input.actor ?? '',
    },
  });
}

export interface WholesaleAccess {
  account: WholesaleRow | null;
  application: WholesaleRow | null;
  status: string;
}

/**
 * The wholesale access an email holds. Called after WordPress verified the
 * password, so this is a *lookup*, not an authorization.
 */
export async function readWholesaleAccess(email: string): Promise<WholesaleAccess> {
  return wholesaleRequest<WholesaleAccess>('/access', { params: { email } });
}

export interface WholesaleCatalogResponse {
  products: WholesaleRow[];
  tiers: WholesaleRow[];
}

/**
 * The wholesale master and its tiers, in one read.
 *
 * `timeoutMs` exists because this read is one of the four a pricing screen waits on
 * together: on a slow cPanel host the four parallel reads congest, and the heavy
 * `/catalog` query is the one that lands last. Leaving it at the single-record
 * ceiling while its siblings get the aggregate one meant an inquiry could be
 * refused with "timed out" on a host that was merely busy — a staging trial caught
 * exactly that.
 */
export async function readWholesaleCatalog(
  options: { activeOnly?: boolean; timeoutMs?: number } = {}
): Promise<WholesaleCatalogResponse> {
  return wholesaleRequest<WholesaleCatalogResponse>('/catalog', {
    params: { active: options.activeOnly === false ? '0' : '1' },
    timeoutMs: options.timeoutMs,
  });
}

/** The counts the wholesale overview shows. Every one is a COUNT in SQL. */
export interface WholesaleOverview {
  applications: {
    pending: number;
    more_info: number;
    approved: number;
    rejected: number;
    total: number;
    by_status: Record<string, number>;
  };
  accounts: { active: number; suspended: number; total: number };
  quotes: {
    open: number;
    draft: number;
    accepted: number;
    expired: number;
    converted: number;
    total: number;
    by_status: Record<string, number>;
    quoted_value: number;
    accepted_value: number;
  };
  orders: { total: number; by_status: Record<string, number>; booked_value: number };
  destinations: Array<{ country: string; orders: number }>;
  container_utilisation: unknown[];
  audit: { recent: WholesaleRow[] };
}

export async function readWholesaleOverview(
  options: { timeoutMs?: number } = {}
): Promise<WholesaleOverview> {
  // One round trip, but a heavy one: the plugin answers it with a dozen COUNT/SUM
  // queries in a single PHP request, so it is measured in aggregate-read time, not in
  // single-record time. It timed out at the short ceiling on a busy staging host and
  // took the whole console's first paint with it.
  return wholesaleRequest<WholesaleOverview>('/overview', { timeoutMs: options.timeoutMs });
}

export interface WholesalePluginSettings {
  version: string;
  /** The schema version this plugin's code expects, and the one the site installed. */
  db_version?: string;
  installed_db_version?: string;
  /**
   * A wholesale table the installer could not create.
   *
   * `dbDelta()` is silent about failure, so without this an operator sees only
   * "the record could not be stored" and has no way to tell a wanted table from a
   * missing one.
   */
  missing_tables?: string[];
  schema_error?: string;
  schema_checked_at?: string | null;
  incoterms: string[];
  application_statuses: string[];
  quote_statuses: string[];
  order_statuses: string[];
  charge_keys: string[];
}

export async function readWholesalePluginSettings(
  options: { timeoutMs?: number } = {}
): Promise<WholesalePluginSettings> {
  return wholesaleRequest<WholesalePluginSettings>('/settings', { timeoutMs: options.timeoutMs });
}
