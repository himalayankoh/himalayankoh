// ============================================================================
// LUXEDGE — CATALOG TABLE COLUMN ORDER
//
// The Products listing lets the seller drag columns to reorder them. The
// order is persisted server-side (per admin, shared across devices) via
// /api/admin/table-columns, with localStorage as the offline/first-paint
// fallback. Helpers take a Storage-like object so they are unit-testable
// without a browser.
// ============================================================================
import { getFreshAccessToken } from '../../services/wordpressAdminAuth';

const SERVER_URL = '/api/admin/table-columns';

export const CATALOG_COLUMN_KEYS = [
  'product',
  'category',
  'status',
  'price',
  'margin',
  'stock',
  'views',
  'interest',
  'age',
  'promotion',
  'readiness',
  'actions',
] as const;

export type CatalogColumnKey = (typeof CATALOG_COLUMN_KEYS)[number];

export const CATALOG_COLUMN_LABELS: Record<CatalogColumnKey, string> = {
  product: 'Product',
  category: 'Category / Species',
  status: 'Status',
  price: 'Price',
  margin: 'Margin',
  stock: 'Stock',
  views: 'Views',
  interest: 'Interest',
  age: 'Listing Age',
  promotion: 'Promotion',
  readiness: 'Readiness',
  actions: 'Actions',
};

export const CATALOG_COLUMN_STORAGE_KEY = 'luxedge_catalog_columns_v1';

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

// ============================================================================
// CATALOG TABLE COLUMN WIDTHS
//
// The same table lets the seller resize a column by dragging the separator in
// its header. Widths are a per-device display preference kept in localStorage
// (the server render always starts from the defaults, exactly like the column
// order), and they are clamped so a column can never be dragged into a sliver
// its own header cannot be read from.
// ============================================================================

export type CatalogColumnWidths = Record<CatalogColumnKey, number>;

/** Starting widths: wide enough for the product title and the analytics
 *  columns that carry a value plus a unit, narrow for the icon-only ones. */
export const CATALOG_DEFAULT_WIDTHS: CatalogColumnWidths = {
  product: 300,
  category: 150,
  status: 120,
  price: 110,
  margin: 100,
  stock: 100,
  views: 80,
  interest: 90,
  age: 130,
  promotion: 120,
  readiness: 130,
  actions: 64,
};

/** Narrowest a column can be dragged — below this its header label is unreadable. */
export const CATALOG_MIN_COLUMN_WIDTH = 56;
/** Widest a column can be dragged — past this the table is one column of scroll. */
export const CATALOG_MAX_COLUMN_WIDTH = 720;
/** Width reserved for the row-selection checkbox column, which is not resizable. */
export const CATALOG_SELECTION_WIDTH = 40;

export const CATALOG_WIDTH_STORAGE_KEY = 'luxedge_catalog_widths_v1';

/** Rounds and clamps a dragged width into the allowed band. */
export function clampColumnWidth(width: number): number {
  if (!Number.isFinite(width)) return CATALOG_MIN_COLUMN_WIDTH;
  return Math.max(CATALOG_MIN_COLUMN_WIDTH, Math.min(CATALOG_MAX_COLUMN_WIDTH, Math.round(width)));
}

export function defaultCatalogWidths(): CatalogColumnWidths {
  return { ...CATALOG_DEFAULT_WIDTHS };
}

/** Load the persisted widths; anything unknown, non-numeric or out of band falls
 *  back to that column's default so a corrupted/older row can never break the table. */
export function loadCatalogWidths(storage?: StorageLike | null): CatalogColumnWidths {
  const widths = defaultCatalogWidths();
  if (!storage) return widths;
  let parsed: unknown;
  try {
    const raw = storage.getItem(CATALOG_WIDTH_STORAGE_KEY);
    if (!raw) return widths;
    parsed = JSON.parse(raw);
  } catch {
    return widths;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return widths;
  const stored = parsed as Record<string, unknown>;
  for (const key of CATALOG_COLUMN_KEYS) {
    const value = stored[key];
    if (typeof value === 'number' && Number.isFinite(value)) widths[key] = clampColumnWidth(value);
  }
  return widths;
}

/** Persist the widths (best-effort — storage failures are non-fatal). */
export function saveCatalogWidths(widths: CatalogColumnWidths, storage?: StorageLike | null): void {
  if (!storage) return;
  try {
    storage.setItem(CATALOG_WIDTH_STORAGE_KEY, JSON.stringify(widths));
  } catch {
    // Quota/private-mode storage failures must never break the table.
  }
}

/** True when every column still sits at its default width (so the "Reset"
 *  control can stay out of the way until it is useful). */
export function isDefaultCatalogWidths(widths: CatalogColumnWidths): boolean {
  return CATALOG_COLUMN_KEYS.every((key) => widths[key] === CATALOG_DEFAULT_WIDTHS[key]);
}

/** The table's own width: every column plus the checkbox column. Applied as the
 *  table's `min-width`, so narrowing a column narrows the scroll area instead of
 *  squashing the columns below the widths the admin chose. */
export function catalogTableWidth(widths: CatalogColumnWidths): number {
  return CATALOG_COLUMN_KEYS.reduce(
    (total, key) => total + (widths[key] ?? CATALOG_DEFAULT_WIDTHS[key]),
    CATALOG_SELECTION_WIDTH,
  );
}

/** Load the persisted column order; corrupted/unknown entries are dropped
 *  and any missing columns are appended in their default position. */
export function loadCatalogColumns(storage?: StorageLike | null): CatalogColumnKey[] {
  if (!storage) return [...CATALOG_COLUMN_KEYS];
  let parsed: unknown;
  try {
    const raw = storage.getItem(CATALOG_COLUMN_STORAGE_KEY);
    if (!raw) return [...CATALOG_COLUMN_KEYS];
    parsed = JSON.parse(raw);
  } catch {
    return [...CATALOG_COLUMN_KEYS];
  }
  if (!Array.isArray(parsed)) return [...CATALOG_COLUMN_KEYS];
  const known = new Set<string>(CATALOG_COLUMN_KEYS);
  const ordered: CatalogColumnKey[] = [];
  const seen = new Set<string>();
  for (const k of parsed) {
    if (typeof k === 'string' && known.has(k) && !seen.has(k)) {
      seen.add(k);
      ordered.push(k as CatalogColumnKey);
    }
  }
  // Anything missing from the stored list keeps its default position at the end.
  for (const k of CATALOG_COLUMN_KEYS) {
    if (!seen.has(k)) ordered.push(k);
  }
  return ordered;
}

/** Persist the current column order (best-effort — storage failures are non-fatal). */
export function saveCatalogColumns(order: CatalogColumnKey[], storage?: StorageLike | null): void {
  if (!storage) return;
  try {
    storage.setItem(CATALOG_COLUMN_STORAGE_KEY, JSON.stringify(order));
  } catch {
    // Quota/private-mode storage failures must never break the table.
  }
}

/** Move `from` to the index of `to` (dropping the dragged column on a target). */
export function moveColumn(order: CatalogColumnKey[], from: string, to: string): CatalogColumnKey[] {
  if (from === to) return order;
  const next = [...order];
  const fromIdx = next.indexOf(from as CatalogColumnKey);
  const toIdx = next.indexOf(to as CatalogColumnKey);
  if (fromIdx === -1 || toIdx === -1) return order;
  next.splice(fromIdx, 1);
  next.splice(toIdx, 0, from as CatalogColumnKey);
  return next;
}

/**
 * Load the column order saved for THIS admin on the server (shared across
 * devices). Returns null when the server has never saved an order for this
 * admin, and returns the DEFAULT order on any failure so the table never
 * blocks on the network.
 */
export async function loadServerColumns(): Promise<CatalogColumnKey[] | null> {
  try {
    const token = await getFreshAccessToken();
    const r = await fetch(SERVER_URL, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) return null;
    const j = (await r.json()) as { columns?: unknown };
    if (!Array.isArray(j.columns)) return null;
    // Sanitize exactly like the local loader (drop unknown/dupes, append missing).
    const known = new Set<string>(CATALOG_COLUMN_KEYS);
    const ordered: CatalogColumnKey[] = [];
    const seen = new Set<string>();
    for (const k of j.columns) {
      if (typeof k === 'string' && known.has(k) && !seen.has(k)) {
        seen.add(k);
        ordered.push(k as CatalogColumnKey);
      }
    }
    for (const k of CATALOG_COLUMN_KEYS) {
      if (!seen.has(k)) ordered.push(k);
    }
    return ordered;
  } catch {
    return null;
  }
}

/** Persist the column order to the server for this admin (fire-and-forget,
 *  non-fatal). Returns true on success. */
export async function saveServerColumns(order: CatalogColumnKey[]): Promise<boolean> {
  try {
    const token = await getFreshAccessToken();
    const r = await fetch(SERVER_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ columns: order }),
    });
    return r.ok;
  } catch {
    return false;
  }
}