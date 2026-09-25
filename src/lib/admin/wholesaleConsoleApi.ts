/**
 * The wholesale console's browser client — **browser** code.
 *
 * Same shape as `consoleApi`: the WordPress application password is server-only, so
 * every read and write goes through an authenticated `/api/admin/wholesale/*` route,
 * and a refusal **throws with the server's own message** rather than being smoothed
 * into an empty list. A supplier cost that failed to save must read as a failure, not
 * as a form that silently kept its old value.
 *
 * The workspace read is deliberately one call: thirteen tabs over six reference sets
 * would otherwise be thirteen chances to disagree about which container profiles
 * exist.
 */

import { getAccessToken } from '@/services/wordpressAdminAuth';

/** A stored wholesale row, as the plugin returns it. */
export type WholesaleRow = Record<string, unknown>;

/** The record types the admin API accepts. Mirrors the plugin's allowlist. */
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

async function authHeaders(): Promise<Record<string, string>> {
  const token = getAccessToken();
  if (!token) throw new Error('Your admin session has expired. Sign in again.');
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function parse<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => ({}))) as { error?: string } & Record<string, unknown>;
  if (!response.ok) throw new Error(body.error || `The server answered HTTP ${response.status}.`);
  return body as T;
}

async function get<T>(path: string): Promise<T> {
  return parse<T>(await fetch(path, { headers: await authHeaders(), cache: 'no-store' }));
}

async function send<T>(path: string, body: unknown, method: 'POST' | 'DELETE' = 'POST'): Promise<T> {
  return parse<T>(await fetch(path, { method, headers: await authHeaders(), body: JSON.stringify(body) }));
}

/* ------------------------------------------------------------------ */
/* Readings                                                            */
/* ------------------------------------------------------------------ */

export interface WholesaleWorkspace {
  products: WholesaleRow[];
  tiers: WholesaleRow[];
  containerProfiles: WholesaleRow[];
  costProfiles: WholesaleRow[];
  freightRates: WholesaleRow[];
  origins: WholesaleRow[];
  suppliers: WholesaleRow[];
  portCharges: WholesaleRow[];
  applications: WholesaleRow[];
  accounts: WholesaleRow[];
  quotes: WholesaleRow[];
  orders: WholesaleRow[];
  audit: WholesaleRow[];
  /**
   * Whether a live ocean-freight provider can be asked, and what is missing if not.
   * Null only when the settings store itself could not be read.
   */
  freightProvider: {
    provider: 'manual' | 'freightos';
    requested: string;
    ready: boolean;
    missing: string[];
    source: 'settings' | 'environment' | 'none';
    summary: string;
  } | null;
  vocabulary: {
    applicationStatuses: string[];
    quoteStatuses: string[];
    orderStatuses: string[];
    incoterms: string[];
    chargeKeys: string[];
    pluginVersion: string | null;
    /** The plugin's declared schema version, and whether any table is missing. */
    pluginDbVersion: string | null;
    installedDbVersion: string | null;
    missingTables: string[];
    schemaError: string;
  };
}

/** Everything the workspace renders, in one authenticated read. */
export async function fetchWholesaleWorkspace(): Promise<WholesaleWorkspace> {
  return get<WholesaleWorkspace>('/api/admin/wholesale/workspace');
}

export interface WholesaleOverview {
  applications: { pending: number; more_info: number; approved: number; rejected: number; total: number; by_status: Record<string, number> };
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
  container_utilisation: Array<{
    container: string;
    orders: number;
    measured: number;
    avgWeightUtilizationPct: number | null;
    avgVolumeUtilizationPct: number | null;
  }>;
  audit: { recent: WholesaleRow[] };
  definitions: Record<string, string>;
}

export async function fetchWholesaleOverview(): Promise<WholesaleOverview> {
  return get<WholesaleOverview>('/api/admin/wholesale/overview');
}

export interface WholesaleRecordList {
  resource: string;
  items: WholesaleRow[];
  count: number;
}

/** Lists one record type, with the filters the plugin understands. */
export async function listWholesaleResource(
  resource: WholesaleResource,
  filters: Record<string, string | number | boolean> = {}
): Promise<WholesaleRecordList> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === '') continue;
    params.set(key, String(value));
  }
  const query = params.toString();
  return get<WholesaleRecordList>(`/api/admin/wholesale/${resource}${query ? `?${query}` : ''}`);
}

/* ------------------------------------------------------------------ */
/* Writes                                                              */
/* ------------------------------------------------------------------ */

/**
 * Creates (`id` absent) or updates (`id` given) one record.
 *
 * The audit actor is the admin session's, filled in by the route — nowhere in this
 * client can a screen name who made a change.
 */
export async function saveWholesaleRecord(
  resource: WholesaleResource,
  data: Record<string, unknown>,
  id?: number
): Promise<WholesaleRow> {
  const result = await send<{ record: WholesaleRow }>(`/api/admin/wholesale/${resource}`, { id, data });
  return result.record;
}

export async function removeWholesaleRecord(resource: WholesaleResource, id: number): Promise<void> {
  const params = new URLSearchParams({ id: String(id) });
  await parse(
    await fetch(`/api/admin/wholesale/${resource}?${params.toString()}`, {
      method: 'DELETE',
      headers: await authHeaders(),
    })
  );
}

/* ------------------------------------------------------------------ */
/* The calculator and the commercial actions                            */
/* ------------------------------------------------------------------ */

export interface WholesaleCalculationRequest {
  accountId?: number;
  lines: Array<{ productRowId: number; units?: number; pallets?: number }>;
  containerProfileId: number;
  containers?: number;
  costProfileId: number;
  freightRateId?: number | null;
  incoterm: string;
  currency?: string;
  fx?: Array<{ from: string; to: string; rate: number; source?: 'manual' | 'api'; retrievedAt?: string }>;
  marginPct?: number | null;
  sellPricePerUnit?: number | null;
  includeDestination?: boolean;
  includeDuty?: boolean;
  destinationCountry?: string;
  destinationPort?: string;
  save?: {
    quoteId?: number;
    accountId?: number;
    status?: string;
    notes?: string;
    validUntil?: string;
    pricingBasis?: string;
  } | null;
}

export interface WholesaleCalculationResponse {
  calculation: {
    lines: Array<{
      productRowId: number;
      name: string;
      wholesaleSku: string;
      units: number;
      cartons: number;
      pallets: number;
      palletsFull: number;
      unitsOnLastPallet: number;
      unitsPerPallet: number;
      cartonsPerPallet: number;
      cartonsPerLayer: number;
      layers: number;
      weightLimited: boolean;
      netWeightKg: number;
      grossWeightKg: number;
      cbm: number;
      unitCost: number;
      tierMinUnits: number | null;
      merchandiseCost: number;
      assumptions: string[];
    }>;
    totals: {
      merchandise: number;
      packaging: number;
      inlandTransport: number;
      originCharges: number;
      oceanFreight: number;
      insurance: number;
      destinationCharges: number;
      duty: number;
      total: number;
      perUnit: number;
      perCarton: number;
      perPallet: number;
      perKg: number;
      perContainer: number;
      currency: string;
    };
    costLines: Array<{ key: string; label: string; amount: number; included: boolean; beyondBasis: boolean; note?: string }>;
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
    mixed: { units: number; cartons: number; pallets: number; netWeightKg: number; grossWeightKg: number; cargoCbm: number; cbm: number; merchandiseCost: number };
    sell: { costPerUnit: number; sellPricePerUnit: number; marginPct: number; markupPct: number; grossProfitPerUnit: number } | null;
    assumptions: string[];
    warnings: string[];
    container: { rowId: number; id: string; name: string };
    costProfile: { rowId: number; id: string; name: string };
    freight: { rowId: number; provider: string; source: string; currency: string; oceanFreight: number; surcharges: Array<{ label: string; amount: number }>; validUntil: string | null } | null;
    incoterm: string;
    currency: string;
    containers: number;
    provenance: {
      costProfileId: number;
      costProfileName: string;
      containerProfileId: number;
      freightSource: string;
      freightProvider: string | null;
      fx: unknown[];
    };
  };
  quote?: WholesaleRow;
  reference?: string;
}

/** Runs the engine. With `save` present the calculation is also frozen as a quote. */
export async function calculateWholesale(body: WholesaleCalculationRequest): Promise<WholesaleCalculationResponse> {
  return send<WholesaleCalculationResponse>('/api/admin/wholesale/calculate', body);
}

export interface DecisionResult {
  application: WholesaleRow;
  account: WholesaleRow | null;
  /** Whether the buyer got a WordPress sign-in account, and what was said about it. */
  buyerUser?: {
    created: boolean;
    emailed: boolean;
    userId: number;
    role: string;
    message: string;
  } | null;
}

/** Approves or rejects an application. An approval also creates the buyer's account. */
export async function decideWholesaleApplication(body: {
  applicationId: number;
  decision: string;
  note?: string;
}): Promise<DecisionResult> {
  return send<DecisionResult>('/api/admin/wholesale/decide', body);
}

export interface ConversionResult {
  order: WholesaleRow;
  reference: string;
  quoteStatus: string;
}

/** Raises a wholesale order from an accepted quotation. Records terms; charges nobody. */
export async function convertWholesaleQuote(body: {
  quoteId: number;
  paymentTerms?: { label?: string; depositPct?: number; balancePct?: number; detail?: string };
  notes?: string;
}): Promise<ConversionResult> {
  return send<ConversionResult>('/api/admin/wholesale/convert', body);
}

/* ------------------------------------------------------------------ */
/* The quotation document                                              */
/* ------------------------------------------------------------------ */

/**
 * Fetches a quotation document with the session's own credential.
 *
 * Not a plain link: the route requires the admin bearer token, and a browser
 * navigation cannot carry one. So the document is fetched here — with the header —
 * and handed to the browser as a blob, which is what makes the print and download
 * buttons work without putting a token in a URL (where it would land in history and
 * in any proxy log).
 */
async function fetchDocument(quoteId: number, kind: string, download: boolean): Promise<{ blob: Blob; filename: string }> {
  const response = await fetch(
    `/api/admin/wholesale/quote-document?id=${quoteId}&kind=${kind}${download ? '&download=1' : ''}`,
    { headers: await authHeaders(), cache: 'no-store' }
  );

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || `The document could not be produced (HTTP ${response.status}).`);
  }

  const disposition = response.headers.get('Content-Disposition') || '';
  const filename = /filename="([^"]+)"/.exec(disposition)?.[1] || `quotation-${quoteId}.html`;
  return { blob: await response.blob(), filename };
}

/** Opens the quotation in a new tab, ready to print or save as PDF. */
export async function openWholesaleQuoteDocument(quoteId: number, kind = 'QUOTATION'): Promise<void> {
  // The tab is opened on the click itself, before the fetch: a popup blocked because
  // it arrived after an await is the difference between "the button works" and "nothing
  // happened". Its address is filled in once the document is in hand.
  const tab = window.open('', '_blank');
  try {
    const { blob } = await fetchDocument(quoteId, kind, false);
    const url = URL.createObjectURL(blob);
    if (tab) tab.location.href = url;
    else window.open(url, '_blank', 'noopener,noreferrer');
    // The tab needs the object URL to stay alive while it loads; a minute is plenty.
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (error) {
    tab?.close();
    throw error;
  }
}

/** Saves the quotation as a file, to attach to an email. */
export async function downloadWholesaleQuoteDocument(quoteId: number, kind = 'QUOTATION'): Promise<void> {
  const { blob, filename } = await fetchDocument(quoteId, kind, true);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/* ------------------------------------------------------------------ */
/* Profit                                                              */
/* ------------------------------------------------------------------ */

export interface WholesaleProfitBreakdown {
  currency: string;
  sellTotal: number;
  costTotal: number;
  freightTotal: number;
  otherCosts: number;
  totalCost: number;
  grossProfit: number;
  grossMarginPct: number;
  markupPct: number;
  commissionPct: number;
  commissionAmount: number;
  commissionBasis: 'NONE' | 'GROSS_PROFIT_SHARE' | 'FIXED_AMOUNT';
  dealerName: string | null;
  hkNetProfit: number;
  hkNetMarginPct: number;
  priced: boolean;
  assumptions: string[];
}

export interface WholesaleProfitResponse {
  summary: {
    currency: string;
    orders: number;
    pricedOrders: number;
    sellTotal: number;
    totalCost: number;
    grossProfit: number;
    dealerCommission: number;
    hkNetProfit: number;
    grossMarginPct: number;
    hkNetMarginPct: number;
    lossMaking: string[];
    unpriced: string[];
    assumptions: string[];
  };
  orders: Array<{
    orderId: number;
    reference: string;
    accountId: number;
    accountName: string;
    status: string;
    dealerName: string | null;
    breakdown: WholesaleProfitBreakdown;
  }>;
  formula: string[];
  note: string;
}

/** Every order's margin, and the totals, computed on the server. */
export async function fetchWholesaleProfit(orderId?: number): Promise<WholesaleProfitResponse> {
  return get<WholesaleProfitResponse>(`/api/admin/wholesale/profit${orderId ? `?orderId=${orderId}` : ''}`);
}

/**
 * Records the cost/freight/commission figures against an order and returns the
 * recomputed breakdown. The sell total is not among the accepted fields: that is the
 * price the buyer agreed to.
 */
export async function saveWholesaleProfit(body: {
  orderId: number;
  costTotal?: number;
  freightTotal?: number;
  otherCosts?: number;
  commissionPct?: number;
  commissionAmount?: number | null;
  reason?: string;
}): Promise<{ order: WholesaleRow; breakdown: WholesaleProfitBreakdown }> {
  return send<{ order: WholesaleRow; breakdown: WholesaleProfitBreakdown }>('/api/admin/wholesale/profit', body);
}
