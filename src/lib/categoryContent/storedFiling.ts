import type { NicheCheckInput } from '../catalog/nicheSections';
import type { CategoryContentKey } from './keys';

/**
 * The shelf a specific store record belongs on, recorded by the identifier the store
 * itself reports.
 *
 * ## The gap this closes
 *
 * Placement normally comes from the owner's filing in WooCommerce. Two of the five
 * records the launch catalogue can sell have no filing: the 6 lb livestock pouches
 * (id `2321`) and the 16 oz edible jar (id `2446`) both sit in WooCommerce's default
 * `Uncategorized` bucket, which `isUnfiledWooCategory` correctly reads as "the store
 * said nothing". With nothing to read, `productCategoryFilterKey` falls through to
 * the name rule — and the name rule reads *Himalayan Rock Salt Pouches in Fine and
 * Coarse Grain Sizes* as edible salt. So the livestock pouch was listed under **Edible
 * Pink Salt** and its breadcrumb said so, which put animal salt on the shelf a cook
 * browses and left the pouches off the shelf a ranch browses.
 *
 * ## Why an id, and not a wider rule
 *
 * Every entry is one *record*, named by the id that record reports. Nothing here reads
 * a product's words, so:
 *
 *  - rewriting a product's title cannot move it to another shelf;
 *  - a product nobody listed here can never be swept onto a shelf by a word that
 *    happens to match;
 *  - the entry names the record the owner is talking about, so it is reviewable by a
 *    human who has never read this codebase.
 *
 * The owner's own filing still outranks the table: `productCategoryFilterKey` consults
 * it only after WooCommerce has been read and said nothing. Filing the pouches under
 * `Live Stock` in WooCommerce therefore wins, and this entry becomes redundant —
 * which is the intended way for it to retire.
 *
 * ## What this deliberately does not do
 *
 * It does not edit WooCommerce. The store's own data is the owner's, and a navigation
 * fact about five records is not a reason to write to the live catalogue. It also does
 * not carry the three records the store *did* file (`animal feed`, ids `271`, `281`,
 * `291`): those already reach the Live Stock shelf through the owner's filing, and a
 * second copy of the answer here would be one more thing to keep in step.
 */

/**
 * The filing, keyed by store identifier.
 *
 * A key of digits is a **WooCommerce product id**; any other key is a **SKU**. Both are
 * accepted because both are stable across a rename, and the owner's own vocabulary for
 * a catalogue is its SKU list — but neither unfiled record currently carries a SKU, so
 * today's table is keyed by id. `SKU_BY_RECORD`-style growth needs no new mechanism:
 * add the SKU as a key and it is consulted too.
 */
export const SHELF_BY_RECORD: Readonly<Record<string, CategoryContentKey>> = {
  // `Himalayan Rock Salt Pouches in Fine and Coarse Grain Sizes - 6 lb` — the livestock
  // pouch. WooCommerce category: `Uncategorized`. Its own title says "pouches", which the
  // name rule reads as edible salt; the owner's filing for this record is the livestock
  // range (the catalogue migration manifest maps it to `Himalayan Pink Salt for Livestock
  // - 6 lb`, filed under `Live Stock`).
  '2321': 'live-stock',
  // `Himalayan Edible Pink Salt – 16 oz Jar | Fine Grain`. WooCommerce category:
  // `Uncategorized`. The name rule reaches the same answer; recorded anyway so the shelf
  // is a decision on file rather than a coincidence of vocabulary.
  '2446': 'edible-pink-salt',
};

/** The recorded shelf for a record, or `null` when the table says nothing about it. */
export function storedShelfKeyForProduct(product: NicheCheckInput): CategoryContentKey | null {
  const id = product.id === null || product.id === undefined ? '' : String(product.id).trim();
  if (id) {
    const byId = SHELF_BY_RECORD[id];
    if (byId) return byId;
  }

  const sku = (product.sku ?? '').trim();
  if (sku) {
    const bySku = SHELF_BY_RECORD[sku];
    if (bySku) return bySku;
  }

  return null;
}
