/**
 * The browser's wholesale session, and the one way a portal screen talks to the API.
 *
 * ## Its own storage key, deliberately
 *
 * A wholesale buyer and a retail shopper can be the same person, signed in as both.
 * They are different authorities — the wholesale session carries an account id and
 * can see tier prices and freight; the retail one cannot — so they live under
 * different keys and neither module can read the other's token by accident. Signing
 * out of the shop does not end a buyer's wholesale session, and vice versa, because
 * they are not the same relationship.
 *
 * ## What is stored
 *
 * A token, its expiry, and the buyer's display facts. No password is ever kept: it is
 * sent once to `/api/wholesale/login`, verified against WordPress there, and
 * discarded. The stored identity is only used to render a name before the server
 * answers — every decision is made from the token on the server.
 *
 * Isomorphic-safe: on the server every reader returns null, so an import from a
 * component does not need a `typeof window` guard at the call site.
 */

import type { QuoteConfidence } from './types';

/** The storage key, named so it is obviously not the retail or admin session. */
export const WHOLESALE_SESSION_STORAGE_KEY = 'hk_wholesale_session';

/** How close to expiry a token may get before we treat it as unusable. */
const EXPIRY_LEAD_MS = 60_000;

export interface WholesaleBuyer {
  accountId: number;
  ref: string;
  company: string;
  contactName: string;
  email: string;
  country: string;
  role: string;
  destinationCountry: string | null;
  destinationPort: string | null;
  paymentTerms: string | null;
  phone?: string | null;
  website?: string | null;
  businessType?: string | null;
  status?: string;
  approvedAt?: string | null;
}

export interface WholesaleSession {
  accessToken: string;
  expiresAt: number;
  buyer: WholesaleBuyer;
}

/* ------------------------------------------------------------------ */
/* Storage                                                             */
/* ------------------------------------------------------------------ */

export function readStoredWholesaleSession(): WholesaleSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(WHOLESALE_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as Partial<WholesaleSession>;
    if (
      typeof session.accessToken === 'string' &&
      session.accessToken &&
      typeof session.expiresAt === 'number' &&
      session.buyer &&
      Number.isInteger(Number(session.buyer.accountId))
    ) {
      return session as WholesaleSession;
    }
    return null;
  } catch {
    return null;
  }
}

function usable(session: WholesaleSession | null): session is WholesaleSession {
  return Boolean(session && session.expiresAt - Date.now() > EXPIRY_LEAD_MS);
}

/** The signed-in buyer, or null when there is no usable session. */
export function getWholesaleSession(): WholesaleSession | null {
  const session = readStoredWholesaleSession();
  return usable(session) ? session : null;
}

export function getWholesaleAccessToken(): string | null {
  return getWholesaleSession()?.accessToken ?? null;
}

function write(session: WholesaleSession): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(WHOLESALE_SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch {
    /* storage unavailable — the session simply will not survive a reload */
  }
}

/** Forgets this browser's wholesale session. The server token expires on its own. */
export function clearWholesaleSession(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(WHOLESALE_SESSION_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/* ------------------------------------------------------------------ */
/* Requests                                                            */
/* ------------------------------------------------------------------ */

const NETWORK_ERROR = 'Could not reach the wholesale service. Check your connection and try again.';

export interface PortalResult<T> {
  ok: boolean;
  data: T | null;
  error: string | null;
  status: number;
}

/**
 * A portal request, with the buyer's token attached.
 *
 * A 401 clears the stored session, because the only thing that produces one is a
 * session the server will not accept — there is nothing to retry. A 403 does *not*
 * clear it: that is an account-level answer (suspended, application not approved)
 * and the buyer should see the reason rather than be silently signed out.
 */
export async function portalRequest<T>(
  path: string,
  options: { method?: string; body?: unknown; keepOn401?: boolean } = {}
): Promise<PortalResult<T>> {
  const token = getWholesaleAccessToken();
  if (!token) {
    return { ok: false, data: null, error: 'Sign in to your wholesale account to continue.', status: 401 };
  }

  let response: Response;
  try {
    response = await fetch(path, {
      method: options.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      cache: 'no-store',
      credentials: 'same-origin',
    });
  } catch {
    return { ok: false, data: null, error: NETWORK_ERROR, status: 0 };
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    /* a non-JSON body falls through to the status message */
  }

  const record = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>;

  if (!response.ok) {
    if (response.status === 401 && !options.keepOn401) clearWholesaleSession();
    return {
      ok: false,
      data: null,
      error: typeof record.error === 'string' ? record.error : `That did not work (HTTP ${response.status}).`,
      status: response.status,
    };
  }

  return { ok: true, data: payload as T, error: null, status: response.status };
}

/* ------------------------------------------------------------------ */
/* Documents                                                           */
/* ------------------------------------------------------------------ */

/**
 * Fetches one of the buyer's own documents with their portal token.
 *
 * The route is authenticated, so a plain link cannot be used — the token has to travel
 * in a header. Fetching it here and handing the browser a blob keeps the token out of
 * the URL bar, out of browser history and out of any proxy log, which is where a
 * `?token=` would put it.
 */
async function fetchQuoteDocument(
  quoteId: number,
  kind: string,
  download: boolean
): Promise<{ blob: Blob; filename: string }> {
  const token = getWholesaleAccessToken();
  if (!token) throw new Error('Sign in to your wholesale account to open a quotation.');

  const response = await fetch(
    `/api/wholesale/quotes/${quoteId}/document?kind=${kind}${download ? '&download=1' : ''}`,
    { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', credentials: 'same-origin' }
  );

  if (!response.ok) {
    if (response.status === 401) clearWholesaleSession();
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || `That document is not available (HTTP ${response.status}).`);
  }

  const disposition = response.headers.get('Content-Disposition') || '';
  const filename = /filename="([^"]+)"/.exec(disposition)?.[1] || `quotation-${quoteId}.html`;
  return { blob: await response.blob(), filename };
}

/** Opens the buyer's quotation in a new tab, ready to print or save as PDF. */
export async function openQuoteDocument(quoteId: number, kind = 'QUOTATION'): Promise<void> {
  // Opened on the click, before the fetch: a tab a popup blocker refuses is the
  // difference between the button working and nothing appearing to happen.
  const tab = window.open('', '_blank');
  try {
    const { blob } = await fetchQuoteDocument(quoteId, kind, false);
    const url = URL.createObjectURL(blob);
    if (tab) tab.location.href = url;
    else window.open(url, '_blank', 'noopener,noreferrer');
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (error) {
    tab?.close();
    throw error;
  }
}

/** Saves the buyer's quotation as a file, to keep or forward. */
export async function downloadQuoteDocument(quoteId: number, kind = 'QUOTATION'): Promise<void> {
  const { blob, filename } = await fetchQuoteDocument(quoteId, kind, true);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * The buyer accepting one of their own quotations.
 *
 * Throws with the server's own sentence on a refusal — not priced yet, already accepted,
 * expired — because those are the explanations the buyer needs, and a generic "that did
 * not work" would hide the one that says what to do next. Returns the updated quote so
 * the caller can render the new state without a second round trip.
 */
export async function acceptQuote(quoteId: number): Promise<PortalQuote> {
  const result = await portalRequest<{ accepted: boolean; quote: PortalQuote; message: string }>(
    `/api/wholesale/quotes/${quoteId}/accept`,
    { method: 'POST' }
  );
  if (!result.ok || !result.data?.quote) {
    throw new Error(result.error || 'The quotation could not be accepted.');
  }
  return result.data.quote;
}

/**
 * Sign in with the business email and the password WordPress holds.
 *
 * Throws an honest Error carrying the server's own message — wrong password, an
 * application still under review, no account for that email — rather than returning a
 * session-shaped object the portal would have to interpret.
 */
export async function signInWholesale(login: string, password: string): Promise<WholesaleSession> {
  const identifier = (login || '').trim();
  if (!identifier || !password) {
    throw new Error('Enter your email and password.');
  }

  let response: Response;
  try {
    response = await fetch('/api/wholesale/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login: identifier, password }),
      cache: 'no-store',
      credentials: 'same-origin',
    });
  } catch {
    throw new Error(NETWORK_ERROR);
  }

  const payload = (await response.json().catch(() => ({}))) as {
    token?: string;
    expiresAt?: number;
    buyer?: Partial<WholesaleBuyer>;
    error?: string;
  };

  if (!response.ok || !payload.token) {
    throw new Error(payload.error || `Sign-in did not work (HTTP ${response.status}).`);
  }

  const session: WholesaleSession = {
    accessToken: payload.token,
    expiresAt: typeof payload.expiresAt === 'number' && payload.expiresAt > Date.now() ? payload.expiresAt : Date.now() + 3_600_000,
    buyer: {
      accountId: Number(payload.buyer?.accountId ?? 0),
      ref: String(payload.buyer?.ref ?? ''),
      company: String(payload.buyer?.company ?? ''),
      contactName: String(payload.buyer?.contactName ?? ''),
      email: String(payload.buyer?.email ?? identifier),
      country: String(payload.buyer?.country ?? ''),
      role: String(payload.buyer?.role ?? 'wholesale_customer'),
      destinationCountry: (payload.buyer?.destinationCountry as string | null) ?? null,
      destinationPort: (payload.buyer?.destinationPort as string | null) ?? null,
      paymentTerms: (payload.buyer?.paymentTerms as string | null) ?? null,
    },
  };

  write(session);
  return session;
}

/* ------------------------------------------------------------------ */
/* Response shapes the portal screens consume                          */
/* ------------------------------------------------------------------ */

export interface PortalBuyerResponse {
  configured: boolean;
  authenticated: boolean;
  buyer?: WholesaleBuyer & { status?: string; approvedAt?: string | null };
}

export interface PortalCatalogItem {
  id: number;
  name: string;
  wholesaleSku: string;
  storefront: { productId: number | null; name: string | null; image: string | null; slug: string | null };
  moq: number;
  leadTimeDays: number;
  packaging: {
    unitsPerCarton: number;
    cartonsPerPallet: number;
    unitsPerPallet: number;
    palletGrossWeightKg: number;
    palletCbm: number;
  } | null;
  tiers: Array<{ minUnits: number; unitPrice: number; currency: string }>;
  fromUnitPrice: number | null;
  currency: string;
  estimateNote: string | null;
}

export interface PortalCatalogResponse {
  currency: string;
  items: PortalCatalogItem[];
  count: number;
  pricing: 'INDICATIVE';
  note: string | null;
}

export interface PortalPlanLine {
  productRowId: number;
  name: string;
  wholesaleSku: string;
  units: number;
  cartons: number;
  pallets: number;
  palletsFull: number;
  unitsOnLastPallet: number;
  netWeightKg: number;
  grossWeightKg: number;
  cbm: number;
  unitPrice: number | null;
  tierMinUnits: number | null;
  lineValue: number | null;
}

export interface PortalPlan {
  lines: PortalPlanLine[];
  totals: {
    units: number;
    cartons: number;
    pallets: number;
    netWeightKg: number;
    grossWeightKg: number;
    cbm: number;
    indicativeMerchandise: number | null;
    hasUnpricedLines: boolean;
  };
  fit: {
    practicalCbmLimit: number;
    weightUtilizationPct: number;
    volumeUtilizationPct: number;
    rawVolumeUtilizationPct: number;
    limitingFactor: 'WEIGHT' | 'VOLUME' | 'NONE';
    remainingWeightKg: number;
    remainingCbm: number;
    warnings: string[];
  };
  warnings: string[];
  assumptions: string[];
  container: { id: number; code: string; name: string };
  containers: number;
}

export interface PortalQuote {
  id: number;
  reference: string;
  status: string;
  confidence: QuoteConfidence;
  confidenceNote: string;
  incoterm: string;
  containers: number;
  currency: string;
  destinationCountry: string;
  destinationPort: string;
  lines: Array<{ name: string; wholesaleSku: string; units: number; cartons: number; pallets: number; unitPrice: number | null; lineTotal: number | null }>;
  totals: { units: number; cartons: number; pallets: number; netWeightKg: number; quotedTotal: number | null; perUnit: number | null };
  awaitingQuotation: boolean;
  validUntil: string | null;
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
  notes: string | null;
}

export interface PortalOrder {
  id: number;
  reference: string;
  status: string;
  incoterm: string;
  currency: string;
  destinationCountry: string;
  destinationPort: string;
  units: number;
  cartons: number;
  pallets: number;
  total: number | null;
  paidAmount: number;
  balanceDue: number | null;
  paymentTerms: string | null;
  depositPct: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}
