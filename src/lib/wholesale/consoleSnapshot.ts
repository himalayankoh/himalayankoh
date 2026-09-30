/**
 * The wholesale console's picture of the business, assembled from reads that are
 * each asked for exactly once.
 *
 * ## Why the fan-out lives here and not in a route
 *
 * The console used to load through two authenticated routes: `…/wholesale/workspace`
 * (the thirteen record sets plus the plugin's own settings and the freight provider's
 * status) and `…/wholesale/overview` (the plugin's `COUNT` summary). Between them they
 * issued **seventeen** round trips to WordPress, and one of those reads was the *same
 * read twice*: both routes asked for `orders?limit=200`. So the order book crossed the
 * wire to the Worker twice and was decoded twice — once for the panel that lists orders,
 * and once for the container-utilisation averages the overview paints.
 *
 * A duplicated read is work, not information. On a host that serves two or three PHP
 * requests at a time, a wasted round trip is a slot the screen's real reads queue
 * behind. And two routes meant two independent pictures of one business: the count of
 * quotations on the Overview tab and the rows on the Quotations tab could disagree if a
 * quotation was raised between the two reads.
 *
 * So the fan-out is stated once, here. The console's single read and the two narrower
 * routes are all built from it, and the order book is read once and handed to both the
 * orders list and the utilisation averages.
 *
 * ## What is deliberately *not* shared
 *
 * The overview's counts stay the plugin's own `COUNT`/`SUM` queries. They are measured
 * across every row in the table, while the console's row reads are capped at 200 — so
 * deriving "312 quotations" from "the 200 I happen to hold here" would turn an honest
 * count into an undercount, and a quotation the owner cannot see is worse than one
 * slower request. That read costs one round trip and buys correctness.
 *
 * ## Nothing here calculates anything
 *
 * Prices, tiers, pallet and container maths, mixed-container rules, freight, packing,
 * commissions and quotation totals belong to the engine (`lib/wholesale/engine`) and to
 * the plugin. This module moves rows and re-states counts the plugin already measured.
 * The one arithmetic it does do — averaging the utilisation figures out of each order's
 * stored load plan — is the sum the overview route has always done, moved here so both
 * callers get the same answer.
 *
 * Server-only: it reads WordPress with an administrator application password.
 */

import {
  listWholesaleRecords,
  readWholesaleOverview,
  readWholesalePluginSettings,
  WHOLESALE_AGGREGATE_TIMEOUT_MS,
  type WholesaleOverview,
  type WholesalePluginSettings,
  type WholesaleRow,
} from './store';
import { freightProviderStatus, type FreightProviderStatus } from './freightProvider';
import type { ApplicationStatus, Incoterm, QuoteStatus } from './types';

/**
 * The lifecycle vocabularies the console offers, one list each, shared with the plugin.
 *
 * They are declared here rather than in each route because the console renders them as
 * dropdowns beside records the plugin will validate against its own copy: two lists that
 * drift would offer a status the write then rejects.
 */
export const WHOLESALE_APPLICATION_STATUSES: ApplicationStatus[] = [
  'PENDING',
  'APPROVED',
  'REJECTED',
  'MORE_INFO_REQUIRED',
  'SUSPENDED',
];

export const WHOLESALE_QUOTE_STATUSES: QuoteStatus[] = [
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'QUOTED',
  'ACCEPTED',
  'REJECTED',
  'EXPIRED',
  'CONVERTED_TO_ORDER',
];

export const WHOLESALE_ORDER_STATUSES: string[] = [
  'DRAFT',
  'AWAITING_DEPOSIT',
  'CONFIRMED',
  'IN_PRODUCTION',
  'READY_TO_SHIP',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
];

export const WHOLESALE_INCOTERMS: Incoterm[] = ['EXW', 'FOB', 'CFR', 'CIF'];

/**
 * Which figures are asked-for and which are agreed.
 *
 * Sent with the overview so the console cannot label a pipeline number as revenue, and
 * so the two words mean the same thing on every screen that shows them.
 */
export const WHOLESALE_OVERVIEW_DEFINITIONS: Record<string, string> = {
  quoted_value: 'Quotations with our team or sent, not yet accepted.',
  accepted_value: 'Accepted quotations that are not yet orders.',
  booked_value: 'Wholesale orders raised, at their quoted value.',
};

/**
 * Fourteen round trips, run together, allowed the time fourteen round trips take rather
 * than the time one record takes — see `WHOLESALE_AGGREGATE_TIMEOUT_MS`. A cold
 * WordPress made this screen time out at the single-read ceiling.
 */
const AGGREGATE = { timeoutMs: WHOLESALE_AGGREGATE_TIMEOUT_MS } as const;

/**
 * Every store the console reads, in the plugin's own row shapes.
 *
 * `plugin` and `freightProvider` are nullable because they are *reported* rather than
 * required: the console must still render its records when the plugin cannot describe
 * itself, and the freight provider's status is a fact about configuration, not a reason
 * to fail the screen.
 */
export interface WholesaleWorkspaceSources {
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
  plugin: WholesalePluginSettings | null;
  freightProvider: FreightProviderStatus | null;
}

/**
 * Reads every store the console shows — once each.
 *
 * Fourteen reads leave at the same moment rather than in a queue, because they are
 * independent tables and a waterfall here would be thirteen round trips deep.
 */
export async function readWholesaleWorkspaceSources(): Promise<WholesaleWorkspaceSources> {
  const [
    products,
    tiers,
    containerProfiles,
    costProfiles,
    freightRates,
    origins,
    suppliers,
    portCharges,
    applications,
    accounts,
    quotes,
    orders,
    audit,
    plugin,
    freightProvider,
  ] = await Promise.all([
    listWholesaleRecords('products', { limit: 500 }, AGGREGATE),
    listWholesaleRecords('price_tiers', { limit: 500 }, AGGREGATE),
    listWholesaleRecords('container_profiles', { limit: 100 }, AGGREGATE),
    listWholesaleRecords('cost_profiles', { limit: 200 }, AGGREGATE),
    listWholesaleRecords('freight_rates', { limit: 300, order: 'id' }, AGGREGATE),
    listWholesaleRecords('origins', { limit: 100 }, AGGREGATE),
    listWholesaleRecords('suppliers', { limit: 200 }, AGGREGATE),
    listWholesaleRecords('port_charges', { limit: 300 }, AGGREGATE),
    listWholesaleRecords('applications', { limit: 200 }, AGGREGATE),
    listWholesaleRecords('accounts', { limit: 200 }, AGGREGATE),
    listWholesaleRecords('quotes', { limit: 200 }, AGGREGATE),
    listWholesaleRecords('orders', { limit: 200 }, AGGREGATE),
    listWholesaleRecords('audit', { limit: 100, order: 'id' }, AGGREGATE),
    readWholesalePluginSettings(AGGREGATE).catch(() => null),
    freightProviderStatus().catch(() => null),
  ]);

  return {
    products,
    tiers,
    containerProfiles,
    costProfiles,
    freightRates,
    origins,
    suppliers,
    portCharges,
    applications,
    accounts,
    quotes,
    orders,
    audit,
    plugin,
    freightProvider,
  };
}

/**
 * How loaded the orders on the book are, averaged per container type.
 *
 * Computed from the load plan each order carries, so the figure describes what was
 * actually agreed rather than a fresh re-optimisation of today's prices. Orders with no
 * utilisation recorded are counted as "not measured" instead of as zero.
 */
export function containerUtilisation(orders: WholesaleRow[]) {
  const byContainer = new Map<string, { orders: number; weight: number[]; volume: number[]; measured: number }>();

  for (const order of orders) {
    const plan = (order.plan && typeof order.plan === 'object' ? order.plan : {}) as Record<string, unknown>;
    const code = String(plan.containerCode ?? '').trim() || 'unspecified';
    const entry = byContainer.get(code) ?? { orders: 0, weight: [], volume: [], measured: 0 };
    entry.orders += 1;

    const weight = Number(plan.weightUtilizationPct);
    const volume = Number(plan.volumeUtilizationPct);
    if (Number.isFinite(weight) && Number.isFinite(volume)) {
      entry.weight.push(weight);
      entry.volume.push(volume);
      entry.measured += 1;
    }
    byContainer.set(code, entry);
  }

  const average = (values: number[]) =>
    values.length ? Math.round((values.reduce((total, value) => total + value, 0) / values.length) * 10) / 10 : null;

  return [...byContainer.entries()]
    .map(([code, entry]) => ({
      container: code,
      orders: entry.orders,
      measured: entry.measured,
      avgWeightUtilizationPct: average(entry.weight),
      avgVolumeUtilizationPct: average(entry.volume),
    }))
    .sort((a, b) => b.orders - a.orders);
}

/** Everything the workspace renders, in the shape its panels already read. */
export interface WholesaleWorkspacePayload {
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
  freightProvider: WholesaleWorkspaceSources['freightProvider'];
  vocabulary: {
    applicationStatuses: ApplicationStatus[];
    quoteStatuses: QuoteStatus[];
    orderStatuses: string[];
    incoterms: Incoterm[];
    chargeKeys: string[];
    pluginVersion: string | null;
    /** The plugin's declared schema version, and the one the site installed. */
    pluginDbVersion: string | null;
    installedDbVersion: string | null;
    missingTables: string[];
    schemaError: string;
  };
}

/** The workspace read's own projection: raw rows, plus what the console needs to label them. */
export function wholesaleWorkspacePayload(sources: WholesaleWorkspaceSources): WholesaleWorkspacePayload {
  const { plugin } = sources;
  return {
    products: sources.products,
    tiers: sources.tiers,
    containerProfiles: sources.containerProfiles,
    costProfiles: sources.costProfiles,
    freightRates: sources.freightRates,
    origins: sources.origins,
    suppliers: sources.suppliers,
    portCharges: sources.portCharges,
    applications: sources.applications,
    accounts: sources.accounts,
    quotes: sources.quotes,
    orders: sources.orders,
    audit: sources.audit,
    freightProvider: sources.freightProvider,
    vocabulary: {
      applicationStatuses: WHOLESALE_APPLICATION_STATUSES,
      quoteStatuses: WHOLESALE_QUOTE_STATUSES,
      orderStatuses: WHOLESALE_ORDER_STATUSES,
      incoterms: WHOLESALE_INCOTERMS,
      chargeKeys: plugin?.charge_keys ?? [],
      pluginVersion: plugin?.version ?? null,
      // The plugin's own account of its schema: a table it could not create is the
      // difference between "this write was rejected" and "this store is incomplete".
      pluginDbVersion: plugin?.db_version ?? null,
      installedDbVersion: plugin?.installed_db_version ?? null,
      missingTables: plugin?.missing_tables ?? [],
      schemaError: plugin?.schema_error ?? '',
    },
  };
}

/** The overview read's projection: the plugin's counts, plus the two things SQL cannot say. */
export interface WholesaleOverviewPayload extends WholesaleOverview {
  container_utilisation: ReturnType<typeof containerUtilisation>;
  definitions: Record<string, string>;
}

/**
 * The counts, with the utilisation averages folded in.
 *
 * `orders` is passed in rather than read here: both callers already hold the order book,
 * and asking WordPress for it a second time is the duplication this module exists to
 * remove.
 */
export function wholesaleOverviewPayload(
  overview: WholesaleOverview,
  orders: WholesaleRow[]
): WholesaleOverviewPayload {
  return {
    ...overview,
    container_utilisation: containerUtilisation(orders),
    definitions: WHOLESALE_OVERVIEW_DEFINITIONS,
  };
}

/**
 * The whole console, in one read: sixteen upstream reads instead of seventeen, and no
 * read issued twice.
 *
 * The order book is read once, by `readWholesaleWorkspaceSources`, and the same rows are
 * handed to the overview's utilisation averages — which is the entire saving. The rest
 * of the fan-out is irreducible from this side: thirteen tables are thirteen reads,
 * because the plugin's record endpoint answers one resource per request.
 */
export async function readWholesaleConsole(): Promise<{
  workspace: WholesaleWorkspacePayload;
  overview: WholesaleOverviewPayload;
}> {
  const [sources, overview] = await Promise.all([
    readWholesaleWorkspaceSources(),
    readWholesaleOverview(AGGREGATE),
  ]);

  return {
    workspace: wholesaleWorkspacePayload(sources),
    overview: wholesaleOverviewPayload(overview, sources.orders),
  };
}
