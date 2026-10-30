import { describe, expect, it } from 'vitest';
import {
  CATALOG_COLUMN_KEYS,
  CATALOG_DEFAULT_WIDTHS,
  CATALOG_MAX_COLUMN_WIDTH,
  CATALOG_MIN_COLUMN_WIDTH,
  CATALOG_SELECTION_WIDTH,
  CATALOG_WIDTH_STORAGE_KEY,
  catalogTableWidth,
  clampColumnWidth,
  isDefaultCatalogWidths,
  loadCatalogColumns,
  loadCatalogWidths,
  saveCatalogWidths,
} from './tableColumns';

describe('catalog column hydration state', () => {
  it('uses the same default order when browser storage is unavailable', () => {
    expect(loadCatalogColumns(null)).toEqual([...CATALOG_COLUMN_KEYS]);
  });

  it('restores a valid client preference without changing the server default', () => {
    const storage = {
      getItem: () => JSON.stringify(['price', 'product', 'price', 'unknown']),
      setItem: () => undefined,
    };

    expect(loadCatalogColumns(null)).toEqual([...CATALOG_COLUMN_KEYS]);
    expect(loadCatalogColumns(storage)).toEqual([
      'price',
      'product',
      ...CATALOG_COLUMN_KEYS.filter((key) => key !== 'price' && key !== 'product'),
    ]);
  });
});

describe('catalog column widths', () => {
  const storageWith = (value: unknown) => ({
    getItem: () => JSON.stringify(value),
    setItem: () => undefined,
  });

  it('starts every column at its default width when nothing is stored', () => {
    expect(loadCatalogWidths(null)).toEqual(CATALOG_DEFAULT_WIDTHS);
    expect(loadCatalogWidths({ getItem: () => null, setItem: () => undefined })).toEqual(CATALOG_DEFAULT_WIDTHS);
    expect(isDefaultCatalogWidths(loadCatalogWidths(null))).toBe(true);
  });

  it('restores a stored width and falls back per column for junk', () => {
    const widths = loadCatalogWidths(storageWith({ product: 420, price: 'wide', bogus: 900, stock: null }));
    expect(widths.product).toBe(420);
    expect(widths.price).toBe(CATALOG_DEFAULT_WIDTHS.price);
    expect(widths.stock).toBe(CATALOG_DEFAULT_WIDTHS.stock);
    expect(Object.keys(widths)).toEqual([...CATALOG_COLUMN_KEYS]);
    expect(isDefaultCatalogWidths(widths)).toBe(false);
  });

  it('keeps a dragged column inside the readable band', () => {
    expect(clampColumnWidth(4)).toBe(CATALOG_MIN_COLUMN_WIDTH);
    expect(clampColumnWidth(99999)).toBe(CATALOG_MAX_COLUMN_WIDTH);
    expect(clampColumnWidth(212.6)).toBe(213);
    expect(clampColumnWidth(Number.NaN)).toBe(CATALOG_MIN_COLUMN_WIDTH);

    const dragged = loadCatalogWidths(storageWith({ product: 3, actions: 5000 }));
    expect(dragged.product).toBe(CATALOG_MIN_COLUMN_WIDTH);
    expect(dragged.actions).toBe(CATALOG_MAX_COLUMN_WIDTH);
  });

  it('measures the whole table so narrowing columns narrows the scroll area', () => {
    const total = catalogTableWidth(CATALOG_DEFAULT_WIDTHS);
    const sum = CATALOG_COLUMN_KEYS.reduce((acc, key) => acc + CATALOG_DEFAULT_WIDTHS[key], 0);
    expect(total).toBe(sum + CATALOG_SELECTION_WIDTH);
    expect(catalogTableWidth({ ...CATALOG_DEFAULT_WIDTHS, product: 500 })).toBe(total + 200);
  });

  it('writes the widths under the versioned key', () => {
    const seen: Record<string, string> = {};
    saveCatalogWidths({ ...CATALOG_DEFAULT_WIDTHS, product: 333 }, {
      getItem: () => null,
      setItem: (key, value) => { seen[key] = value; },
    });
    expect(seen[CATALOG_WIDTH_STORAGE_KEY]).toBe(JSON.stringify({ ...CATALOG_DEFAULT_WIDTHS, product: 333 }));
  });
});
