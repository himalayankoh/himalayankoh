/**
 * The storefront's shelves: what the shop sells, sorted into the rows a shopper
 * actually looks at.
 *
 * This is the *taxonomy* half of the niche — the labels, the `?category=` keys and
 * the rule that decides which shelf a product belongs on. It contains no list of
 * things the store does **not** sell; that judgement lives in `./niche.ts`, which
 * is only imported by the seam that reads a catalog. Keeping the two apart is what
 * lets the filter rail, the grid, the hub pages and the sitemap share one taxonomy
 * without any of them carrying the denylist.
 *
 * Every section is a shelf of salt. The niche has no bath line or gift sets yet,
 * and an empty shelf is not created here to make the rail look complete.
 */

/** The fields placement is judged on: a product's name, and its category label. */
export interface NicheCheckInput {
  /**
   * The catalog record's own id, when the source reports one.
   *
   * The guard judges text, but the owner also rejects specific *records* —
   * carry-over products that are perfectly pink-salt-shaped and simply are not
   * wanted (see `OWNER_REJECTED_PRODUCT_IDS` in `./niche.ts`). An id is the only
   * thing about those that is stable: they can be renamed, and a rename must not
   * bring one back.
   */
  id?: number | string | null;
  /**
   * The owner's explicit storefront approval for this record.
   *
   * The other half of the owner's decision, recorded on the product itself (see
   * `_himalayan_koh_niche_approved` in `lib/woo/productPayload.ts`). The term
   * guard judges *text* — and the shop's own livestock-shaped lines fail it even
   * though the owner sells them. A SKU approval covers the lines on the owner's
   * price list; this covers the ones the owner approves individually from the
   * console, without a rename and without editing a code list. A refusal (id) is
   * still checked first, so an approval can never re-admit a rejected record.
   */
  ownerApproved?: boolean | null;
  /**
   * The record's SKU, when the source reports one.
   *
   * This is the key the *owner* uses: `Himalayan Salt Products Price List.xlsx`
   * authorises the catalog by SKU, and those SKUs are the ones that carry the
   * salt-lick and salt-block lines — names the term guard would otherwise refuse
   * for containing the word "lick". Approval is therefore keyed on the SKU (see
   * `OWNER_APPROVED_SKUS` in `./niche.ts`), which is also the only product field
   * that stays stable across a rename.
   */
  sku?: string | null;
  name: string;
  /** The product's category label, when the source reports one. */
  category?: string | null;
  /**
   * The product's own copy, when the source ships it to the browser.
   *
   * A description is judged by the guard (`./niche.ts`) for the same reason the
   * name is: it is *rendered*. Staging carried a neutrally named pouch product
   * whose description opened "Elevate Livestock Well-being ... your animals", and
   * that copy reached the catalogue payload of every visitor while the name alone
   * looked in-niche.
   */
  description?: string | null;
}

export type NicheSectionKey =
  | 'edible-pink-salt'
  | 'cooking-serving'
  | 'licks-blocks'
  | 'lamps-decor'
  | 'bulk';

export interface NicheSection {
  key: NicheSectionKey;
  label: string;
  /** What the section holds, in the store's own words. */
  description: string;
  /** Public navigation visibility only; Woo records remain untouched. */
  visibleInStorefront: boolean;
}

export const NICHE_SECTIONS: readonly NicheSection[] = [
  {
    key: 'edible-pink-salt',
    label: 'Edible Pink Salt',
    description: 'Fine and coarse pink salt for the kitchen, in jars, pouches and larger bags.',
    visibleInStorefront: true,
  },
  {
    key: 'cooking-serving',
    label: 'Cooking & Serving',
    description: 'Salt blocks and plates for grilling, chilling and serving at the table.',
    visibleInStorefront: true,
  },
  {
    key: 'licks-blocks',
    label: 'Salt Licks & Blocks',
    description: 'Solid pink salt licks and blocks in the sizes the owner price list covers.',
    visibleInStorefront: true,
  },
  {
    key: 'lamps-decor',
    label: 'Salt Lamps & Décor',
    description: 'Hand-carved pink salt lamps and decorative pieces for the home.',
    visibleInStorefront: true,
  },
  {
    key: 'bulk',
    label: 'Bulk & Wholesale',
    description: 'Larger bags and pouches for kitchens, retailers and gifting at volume.',
    // Temporary public-nav hold: keep Woo products/category intact and visible in All.
    visibleInStorefront: false,
  },
];

const SECTION_BY_KEY = new Map(NICHE_SECTIONS.map((section) => [section.key, section]));

export function nicheSection(key: NicheSectionKey): NicheSection {
  const section = SECTION_BY_KEY.get(key);
  if (!section) throw new Error(`Unknown niche section: ${key}`);
  return section;
}

/**
 * Which public section a product belongs to, from its name and category.
 * Returns `null` when nothing matches — an unplaced product is listed under All
 * rather than being filed somewhere it does not belong.
 */
export function nicheSectionKeyFor(input: NicheCheckInput): NicheSectionKey | null {
  const haystack = `${input.name} ${input.category ?? ''}`.toLowerCase();

  // Every section is a shelf of salt. A product with no salt in its name is
  // unplaced rather than filed by its category alone — "Bulk Order" is a way of
  // buying, not a product.
  if (!/\bsalt\b|\blamp|\blantern\b/.test(haystack)) return null;

  if (/\blamp|lantern|decor|décor|holder|candle|tealight|carved\b/.test(haystack)) return 'lamps-decor';
  // Checked before the block rule: "Salt Lick" names a mineral lick line, and the
  // owner list carries it under its own heading (`Salt Licks`), not under cooking.
  if (/\blick|licks\b/.test(haystack)) return 'licks-blocks';
  if (/\bblock|plate|slab|grill|plank\b/.test(haystack)) return 'cooking-serving';
  if (/\bbulk|wholesale|25 kg|25kg|50 lb|45 lbs|45lb|18 lbs|18lb|pallet\b/.test(haystack)) return 'bulk';
  return 'edible-pink-salt';
}
