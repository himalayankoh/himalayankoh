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
  | 'live-stock'
  | 'lamps-decor'
  | 'bulk';

export interface NicheSection {
  key: NicheSectionKey;
  label: string;
  /** What the section holds, in the store's own words. */
  description: string;
  /** Public navigation visibility only; Woo records remain untouched. */
  visibleInStorefront: boolean;
  /**
   * The store's own WooCommerce category names this shelf serves.
   *
   * The owner files a product into a category in WooCommerce and expects it to
   * appear under that category on the shop. This is the join between the two
   * vocabularies: a product whose WooCommerce category is named here is placed on
   * this shelf *before* the name rule is consulted, so the owner's filing wins.
   *
   * Keeping the two lists in one place is what stops the shop and WooCommerce
   * drifting: a category the owner renames stops matching here, which shows up as
   * a product falling back to the name rule rather than as a silently wrong shelf.
   */
  wooCategoryLabels?: readonly string[];
}

export const NICHE_SECTIONS: readonly NicheSection[] = [
  {
    key: 'edible-pink-salt',
    label: 'Edible Pink Salt',
    description: 'Fine and coarse pink salt for the kitchen, in jars, pouches and larger bags.',
    visibleInStorefront: true,
    wooCategoryLabels: ['Edible Pink Salt'],
  },
  {
    key: 'cooking-serving',
    label: 'Cooking & Serving',
    description: 'Salt blocks and plates for grilling, chilling and serving at the table.',
    visibleInStorefront: true,
    wooCategoryLabels: ['Cooking & Serving', 'Salt Blocks'],
  },
  {
    key: 'licks-blocks',
    label: 'Salt Licks',
    description: 'Solid pink salt licks and blocks in the sizes the owner price list covers.',
    visibleInStorefront: true,
    // The store's own term for this range is `Salt Licks`; the older label came
    // from the price list's heading for the same goods and still resolves here.
    wooCategoryLabels: ['Salt Licks', 'Salt Licks & Blocks'],
  },
  {
    key: 'live-stock',
    label: 'Live Stock',
    description: 'Himalayan pink salt bags and pouches filed in the livestock range.',
    visibleInStorefront: true,
    // `Animal Feed` is the live install's own name for this range (WooCommerce
    // category 58), and it is the category the store's three sellable livestock
    // records are actually filed under — the 45 lb bag for livestock, the licks for
    // horses and the 18 lb rock for cattle. Without it the owner's own filing matched
    // no shelf and those products surfaced under a pill carrying the raw WooCommerce
    // name (`animal feed`) with no shelf copy, while this shelf — the one the
    // homepage and the footer linked to — stayed empty.
    wooCategoryLabels: ['Live Stock', 'Livestock', 'Animal Feed'],
  },
  {
    key: 'lamps-decor',
    label: 'Salt Lamps & Décor',
    description: 'Hand-carved pink salt lamps and decorative pieces for the home.',
    visibleInStorefront: true,
    wooCategoryLabels: ['Salt Lamps & Décor', 'Salt Lamps'],
  },
  {
    key: 'bulk',
    label: 'Bulk and Rock Salt',
    description: 'Larger bags and pouches for kitchens, retailers and gifting at volume.',
    // Public since 2026-10-01: the owner filed a live product under this category
    // (`Bulk and Rock Salt`) and asked for the shop's filters to carry the
    // categories he sets in WooCommerce. The label matches that category, so it no
    // longer reads as the wholesale programme — wholesale is its own module.
    visibleInStorefront: true,
    wooCategoryLabels: ['Bulk and Rock Salt', 'Bulk & Wholesale', 'Bulk Order', 'Bulk'],
  },
];

const SHELF_BY_WOO_LABEL = new Map<string, NicheSectionKey>(
  NICHE_SECTIONS.flatMap((section) =>
    (section.wooCategoryLabels ?? []).map(
      (label) => [label.trim().toLowerCase(), section.key] as const
    )
  )
);

/**
 * The category WooCommerce creates for a product nobody has filed, spelled the ways
 * an install spells it. It is a bucket, never a shelf.
 *
 * WooCommerce 8.x still files a product under `Uncategorized` (id 75 on this
 * install) when the owner has not chosen a category, so the value arrives on a read
 * looking exactly like a category the owner did name. It is not one: treating it as
 * a filing is what put two of the owner's sellable products — the 16 oz jar and the
 * 6 lb pouches, both edible pink salt — behind a pill reading `Uncategorized` while
 * the Edible Pink Salt shelf, which the homepage and the footer link to, stayed
 * empty. Reading it as "no filing" hands those products to the name rule, which
 * shelves each one where its own title says it belongs.
 */
const UNFILED_WOO_CATEGORY_LABELS = new Set(['uncategorized', 'uncategorised']);

export function isUnfiledWooCategory(label: string | null | undefined): boolean {
  if (!label) return false;
  return UNFILED_WOO_CATEGORY_LABELS.has(label.trim().toLowerCase());
}

/**
 * The shelf a product is filed on by its WooCommerce category, or `null`.
 *
 * This is the owner's own decision in WooCommerce, translated into a shelf. It is
 * consulted after the rules that read a product's *kind* from its name (a lick is
 * a lick) and before the rules that only guess from a size in the title, so the
 * owner's filing settles everything the title does not already answer.
 */
export function nicheSectionKeyForWooCategory(
  label: string | null | undefined,
  productContext: string | NicheCheckInput = ''
): NicheSectionKey | null {
  if (!label) return null;
  const key = SHELF_BY_WOO_LABEL.get(label.trim().toLowerCase()) ?? null;
  // "Salt Blocks" is shared by cooking pieces and animal salt in WooCommerce.
  // Keep the latter on Salt Licks, even when the category is read before the name.
  if (key === 'cooking-serving') {
    const text = typeof productContext === 'string'
      ? productContext
      : `${productContext.name || ''} ${productContext.category || ''} ${productContext.description || ''} ${productContext.sku || ''}`;
    if (/\b(?:livestock|live\s+stock|animals?|horses?|deer|cattle|bovine|equine|goats?|sheeps?|licks?|wildlife|pasture|herd)\b/i.test(text)) {
      return 'licks-blocks';
    }
  }
  return key;
}

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

  // The *kind* of thing comes first, from the name, and it outranks the owner's
  // category, because that is what a shopper is looking for: a "Salt Lick" is a
  // lick wherever it is filed, and the staging catalogue really does carry one
  // filed under `Bulk Order`. Checked before the block rule because "Salt Lick"
  // names a mineral lick line, not a cooking piece.
  if (/\blamp|lantern|decor|décor|holder|candle|tealight|carved\b/.test(haystack)) return 'lamps-decor';
  if (/\blick|licks\b/.test(haystack)) return 'licks-blocks';
  
  if (/\bblock|plate|slab|grill|plank\b/.test(haystack)) {
    if (/\blivestock|live stock|animal|horse|deer|cattle\b/.test(haystack)) return 'licks-blocks';
    return 'cooking-serving';
  }

  // Then the owner's own filing. Asked before the size heuristic, because a size
  // in a title is a hint and a category is a decision: the owner filed "Bag of
  // Himalayan Pink Salt for Livestock (45 lbs.)" under `Edible Pink Salt`, so it
  // belongs with the edible salt rather than in the bulk bags.
  const filed = nicheSectionKeyForWooCategory(input.category ?? null, input.name);
  if (filed) return filed;

  if (/\bbulk|wholesale|25 kg|25kg|50 lb|45 lbs|45lb|18 lbs|18lb|pallet\b/.test(haystack)) return 'bulk';
  return 'edible-pink-salt';
}
