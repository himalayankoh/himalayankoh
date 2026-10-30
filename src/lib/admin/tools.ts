/**
 * The pure logic behind the admin's tool screens.
 *
 * These functions had started life inside their view files, which made them
 * untestable (no DOM test environment here) even though none of them touches the
 * DOM: a UTM link, a variant matrix, an import URL check and a listing-defect
 * judgement are all plain arithmetic and string work. Moving them here keeps the
 * views as rendering — and lets the edge cases that actually matter (empty input,
 * the store's own host, a matrix that would explode, a field the source cannot
 * report) be pinned by tests.
 *
 * Nothing in this module fetches, reads a credential, or asserts a status.
 */

import type { AdminCatalogRow } from '../backend';
import { prohibitedClaimReason } from '../products/claims';

/* ------------------------------------------------------------------ */
/* Campaign links                                                      */
/* ------------------------------------------------------------------ */

/** The storefront origin a shared link must point at — never the preview host. */
export const STORE_ORIGIN = 'https://himalayankoh.com';

/**
 * Lower-cases and hyphenates a tag value so `Winter Restock` and
 * `winter-restock` cannot become two campaigns in a report.
 */
export function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export interface CampaignLinkInput {
  /** A storefront path; a bare `products` is normalised to `/products`. */
  path: string;
  source: string;
  medium: string;
  campaign: string;
  origin?: string;
}

/**
 * Builds a tagged production URL. Empty tags are omitted rather than emitted
 * blank (a `utm_source=` with no value is worse than no parameter: analytics
 * records it as a distinct source).
 */
export function taggedCampaignUrl({
  path,
  source,
  medium,
  campaign,
  origin = STORE_ORIGIN,
}: CampaignLinkInput): string {
  const trimmed = path.trim() || '/';
  const normalisedPath = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;

  const params = new URLSearchParams();
  const tags: Array<[string, string]> = [
    ['utm_source', slugify(source)],
    ['utm_medium', slugify(medium)],
    ['utm_campaign', slugify(campaign)],
  ];
  for (const [key, value] of tags) {
    if (value) params.set(key, value);
  }

  const query = params.toString();
  return `${origin.replace(/\/+$/, '')}${normalisedPath}${query ? `?${query}` : ''}`;
}

/* ------------------------------------------------------------------ */
/* External-source validation                                          */
/* ------------------------------------------------------------------ */

export interface SourceInspection {
  ok: boolean;
  message: string;
  host?: string;
}

const OWN_HOST_PATTERN = /(^|\.)himalayankoh\.com$/i;

function inspectAbsoluteUrl(raw: string, emptyMessage: string, ownMessage: string): SourceInspection {
  const value = raw.trim();
  if (!value) return { ok: false, message: emptyMessage };

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, message: 'That is not a complete URL — include https://.' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, message: 'Only http and https URLs can be used.' };
  }
  if (OWN_HOST_PATTERN.test(url.hostname)) {
    return { ok: false, message: ownMessage };
  }
  return { ok: true, message: `Will read ${url.hostname}`, host: url.hostname };
}

/** Validates a product URL an import would read. */
export function inspectImportUrl(raw: string): SourceInspection {
  return inspectAbsoluteUrl(
    raw,
    'Paste the product URL to start.',
    'That is this store. Import is for a supplier or market listing.'
  );
}

/** Validates a supplier/market URL a scout pass would watch. */
export function inspectWatchUrl(raw: string): SourceInspection {
  return inspectAbsoluteUrl(
    raw,
    'Enter a supplier, market or category URL to watch.',
    'That is this store. Scouting watches other people’s listings.'
  );
}

/* ------------------------------------------------------------------ */
/* Variants                                                            */
/* ------------------------------------------------------------------ */

export interface VariantAxis {
  /** The attribute name, e.g. `Weight`. */
  name: string;
  /** Raw comma-separated values, exactly as typed. */
  values: string;
}

/** A hard ceiling on generated rows: 4 axes of 10 values is already 10,000 products. */
export const MAX_VARIANT_COMBINATIONS = 200;

interface ParsedAxis {
  name: string;
  values: string[];
}

/** Axes with a name and at least one value, in the order given. */
export function usableAxes(axes: VariantAxis[]): ParsedAxis[] {
  return axes
    .map((axis) => ({
      name: axis.name.trim(),
      values: axis.values
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
    }))
    .filter((axis) => axis.name && axis.values.length > 0);
}

/**
 * The cartesian product of the given axes, each row reading `Name: value`.
 * Returns `[]` for no usable axis — an empty matrix, not a single empty row.
 */
export function variantCombinations(axes: VariantAxis[]): string[][] {
  const parsed = usableAxes(axes);
  if (parsed.length === 0) return [];

  return parsed.reduce<string[][]>(
    (acc, axis) => acc.flatMap((row) => axis.values.map((value) => [...row, `${axis.name}: ${value}`])),
    [[]]
  );
}

/** True when the matrix is larger than a single pass should write. */
export function isMatrixOverflow(combinationCount: number): boolean {
  return combinationCount > MAX_VARIANT_COMBINATIONS;
}

/* ------------------------------------------------------------------ */
/* Listing readiness                                                   */
/* ------------------------------------------------------------------ */

/**
 * The listing defects a person can fix on the product itself.
 *
 * `missing` on a row means "this source could not report the field at all", which
 * is a connection problem, not a bad listing — flagging it would send someone to
 * edit a product that is not broken. On the public WooCommerce Store API that
 * distinction matters most: price and SKU are unavailable for every product, so
 * treating them as defects would queue the entire catalog for a field no edit can
 * fix.
 */
export function listingDefects(row: AdminCatalogRow): string[] {
  const defects: string[] = [];
  const canReportPrice = !row.missing.includes('price');
  const canReportSku = !row.missing.includes('sku');

  if (canReportPrice && !row.price.trim()) defects.push('No price set');
  if (canReportSku && !row.sku) defects.push('No SKU set');
  if (!row.image) defects.push('No image');
  if (row.isListed === false) defects.push('Listing is inactive');
  if (row.isHiddenFromStorefront === true) defects.push('Hidden from the storefront');

  // A claim the salt cannot support is a defect of the listing, not of the copy
  // template, so it belongs on the row an operator is already reviewing. The rule
  // deliberately does not touch livestock words — see `lib/products/claims.ts` for
  // why that distinction is the whole point.
  const claim = prohibitedClaimReason(row.name);
  if (claim) defects.push(claim);
  return defects;
}

/** Fields this source cannot report at all, for the row to name as a gap. */
export function unavailableFields(row: AdminCatalogRow): string[] {
  const fields: string[] = [];
  if (row.missing.includes('price')) fields.push('price');
  if (row.missing.includes('sku')) fields.push('SKU');
  if (row.stockStatus === 'unknown') fields.push('stock');
  return fields;
}

/** A product is campaign-ready when its price is actually readable. */
export function isCampaignReady(row: AdminCatalogRow): boolean {
  return !row.missing.includes('price') && row.price.trim().length > 0;
}

/* ------------------------------------------------------------------ */
/* Shelf composition                                                   */
/* ------------------------------------------------------------------ */

export interface ShelfEntry {
  name: string;
  total: number;
  priced: number;
  stockKnown: number;
}

/** Per-category composition of a catalog page, thinnest shelf first. */
export function shelfComposition(rows: AdminCatalogRow[]): ShelfEntry[] {
  const byCategory = new Map<string, ShelfEntry>();
  for (const row of rows) {
    const name = row.categoryName ?? 'Uncategorised';
    const entry = byCategory.get(name) ?? { name, total: 0, priced: 0, stockKnown: 0 };
    entry.total += 1;
    if (isCampaignReady(row)) entry.priced += 1;
    if (row.stockStatus !== 'unknown') entry.stockKnown += 1;
    byCategory.set(name, entry);
  }
  return [...byCategory.values()].sort((a, b) => a.total - b.total || a.name.localeCompare(b.name));
}

/** How a category's depth reads: one or two products cannot carry a browse journey. */
export function shelfDepth(total: number): 'thin' | 'narrow' | 'deep' {
  if (total <= 2) return 'thin';
  if (total <= 5) return 'narrow';
  return 'deep';
}
