import { describe, expect, it } from 'vitest';

import { NICHE_SECTIONS, type NicheCheckInput } from '../catalog/nicheSections';
import { productCategoryFilterKey, productShelfKey } from './keys';
import { SHELF_BY_RECORD, storedShelfKeyForProduct } from './storedFiling';

/**
 * The recorded filing, pinned.
 *
 * `storedFiling.ts` exists for the two launch records WooCommerce never filed, and the
 * failures it prevents are quiet ones — a livestock pouch listed on the edible shelf, an
 * animal product in front of a cook — so they are worth a test rather than a comment.
 *
 * The two properties that make the table safe are what these cases check: every entry
 * names a real visible shelf (a typo would silently drop a product back to the name rule),
 * and the table is only ever consulted for a record the store said nothing about (the
 * owner's own filing must win, or the store's data stops being the source of truth).
 */
describe('SHELF_BY_RECORD', () => {
  const visibleShelfKeys = new Set(
    NICHE_SECTIONS.filter((section) => section.visibleInStorefront).map((section) => section.key)
  );

  it('files every entry on a shelf the storefront actually shows', () => {
    for (const [record, shelf] of Object.entries(SHELF_BY_RECORD)) {
      expect(visibleShelfKeys, `${record} -> ${shelf}`).toContain(shelf);
    }
  });

  it('keys every entry by a store identifier, never by a product title', () => {
    for (const record of Object.keys(SHELF_BY_RECORD)) {
      // An id is digits; a SKU is a word-ish token. A key with a space in it would be a
      // title, which is the input this table exists to stop trusting.
      expect(record, record).toMatch(/^[A-Za-z0-9-]+$/);
    }
  });

  it('names the two unfiled launch records and nothing else', () => {
    // The three records the store *did* file (`animal feed`, ids 271 / 281 / 291) are
    // deliberately absent: a second copy of an answer the store already gives is one more
    // thing to keep in step.
    expect(Object.keys(SHELF_BY_RECORD).sort()).toEqual(['2321', '2446']);
  });
});

describe('storedShelfKeyForProduct', () => {
  const record = (fields: Partial<NicheCheckInput> & { name: string }): NicheCheckInput =>
    ({ category: '', ...fields }) as NicheCheckInput;

  it('answers by product id', () => {
    expect(storedShelfKeyForProduct(record({ id: 2321, name: 'anything at all' }))).toBe('live-stock');
    expect(storedShelfKeyForProduct(record({ id: '2446', name: 'anything at all' }))).toBe(
      'edible-pink-salt'
    );
  });

  it('answers by SKU as well, so a SKU-keyed entry needs no new mechanism', () => {
    // Today's table is id-keyed (neither unfiled record carries a SKU); this pins that the
    // lookup the table is read through would honour one.
    expect(storedShelfKeyForProduct(record({ name: 'x', sku: '2321' }))).toBe('live-stock');
  });

  it('says nothing about a record it does not name', () => {
    expect(storedShelfKeyForProduct(record({ id: 9999, name: 'Himalayan Salt Lamp' }))).toBeNull();
    expect(storedShelfKeyForProduct(record({ id: null, name: 'Himalayan Salt Lamp' }))).toBeNull();
    expect(storedShelfKeyForProduct(record({ name: 'Himalayan Salt Lamp', sku: '   ' }))).toBeNull();
  });
});

describe('placement with the recorded filing in play', () => {
  it('reads the table only when the store filed the record nowhere', () => {
    // The store's own filing outranks the table: file the pouches under `Salt Licks` in
    // WooCommerce and that decision wins, because the store's data stays the source of truth.
    const refiled = { id: 2321, name: 'Himalayan Rock Salt Pouches', category: 'Salt Licks' };
    expect(productCategoryFilterKey(refiled)).toBe('licks-blocks');
    expect(productCategoryFilterKey({ ...refiled, category: 'animal feed' })).toBe('live-stock');

    // And inside the default bucket, which is what "not filed" arrives as.
    expect(productCategoryFilterKey({ ...refiled, category: 'Uncategorized' })).toBe('live-stock');
    expect(productCategoryFilterKey({ ...refiled, category: '' })).toBe('live-stock');
  });

  it('still shelves an unrecorded, unfiled record by its name', () => {
    const lamp = { id: 4242, name: 'Himalayan Salt Lamp', category: '' };
    expect(storedShelfKeyForProduct(lamp)).toBeNull();
    expect(productShelfKey(lamp)).toBe('lamps-decor');
    expect(productCategoryFilterKey(lamp)).toBe('lamps-decor');
  });
});
