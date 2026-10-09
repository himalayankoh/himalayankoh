/**
 * The storefront's catalog policy: what the shop sells, and what it refuses.
 *
 * Himalayan Koh is a Himalayan pink salt store — edible grades, cooking and
 * serving pieces, salt licks and blocks, lamps and décor, and bulk salt. It does
 * not sell the *animal-feed trade*: the retired records name their animal ("Salt
 * Licks for Horses", "Salt Block for Deer") and the WordPress taxonomy still
 * carries an `animal feed` category.
 *
 * The policy has two directions, and the order they are asked in is the whole
 * design:
 *
 * 1. **The launch admission first.** `LIVE_LAUNCH_PRODUCT_IDS` names the live
 *    records the owner admitted to the launch storefront. It is the most recent
 *    owner decision about named records, so it is asked before the older lists.
 * 2. **Refusals next.** `OWNER_REJECTED_PRODUCT_IDS` names records the owner has
 *    looked at and refused. A refusal outranks an approval, so a SKU can never
 *    re-admit one.
 * 3. **Approvals next, keyed on SKU.** `OWNER_APPROVED_SKUS` is the owner's price
 *    list. An authorised SKU is in the catalog whatever its name says, which is
 *    what lets the shop sell its own Salt Licks range.
 * 4. **The term guard last**, as a residual net for records the owner has not
 *    spoken about yet.
 *
 * That order was not the original design. The guard used to answer only "does
 * this text name an animal", and the owner's own salt-lick line answers yes — so
 * the storefront refused products the shop actually sells. A positive list is the
 * honest encoding of "the owner sells these", and the term list alone can never
 * express it.
 *
 * WooCommerce stays the owner of the catalog: the owner archives refused products
 * and categories there. This module is the *storefront* policy that holds in the
 * meantime. It is applied at the catalog seam (`lib/backend/products.ts`) and the
 * blog seam (`lib/catalog/nicheBlog.ts`), so that homepage, search, related
 * products, category pages, sitemap and schema all inherit one judgement instead
 * of each filtering for itself — and so that nothing off-policy is ever handed to
 * a renderer or sent to a browser.
 *
 * Two deliberate properties:
 *
 * 1. **It is a named list, not a classifier.** A product leaves this guard by
 *    being renamed, recategorised or archived — a human action with a human
 *    reason — not by scoring well.
 * 2. **It does not hide anything from the admin.** The console keeps reading the
 *    unfiltered catalog, because the owner has to *see* a refused product in
 *    order to archive it. Filtering it out there would make the product
 *    invisible to the only person who can fix it.
 *
 * The taxonomy — the shelves the shop *does* have — lives in `./nicheSections.ts`,
 * which carries no denylist and is safe to use from the browser.
 */

import {
  NICHE_SECTIONS,
  nicheSectionKeyFor,
  type NicheCheckInput,
  type NicheSection,
  type NicheSectionKey,
} from './nicheSections';

/**
 * The live records the owner admitted to the storefront for the 2026-10-09 launch.
 *
 * This is the one place the shop's *policy* and the live install's *data* are
 * reconciled by hand, and it exists because they were answering different
 * questions. The policy above was written against the curated launch catalogue
 * (the authorised SKU line, `HK-LFH-*`, `HK-ESF-*`, `HK-LFC-45lbs` …), which lives
 * on the staging install. The live install is the legacy catalogue: the same goods
 * in substance — the 45 lb bulk bag, the licks, the 18 lb cattle rock, the 6 lb
 * pouches, the 16 oz jar — but published years ago without SKUs, under names that
 * name the animal they are for.
 *
 * Applied unchanged to the live catalogue, that policy withheld **every** product
 * (12 of 13 rows, measured 2026-10-09) and the storefront served nothing. The
 * owner's decision the same day was to launch on the live catalogue, showing its
 * correctly priced and in-stock records rather than an empty shop.
 *
 * So this list is a **named owner decision about named records**, which is the same
 * shape as `OWNER_APPROVED_SKUS` and for the same reason: membership is not
 * derivable from a name or a price. It is deliberately not a rule like "admit any
 * priced record in stock" — that classifier would also re-admit the next livestock
 * record the owner prices, and the whole point of the term guard is that the shop
 * decides, not the catalogue.
 *
 * What this list does not do:
 *
 *  - It does not repeal the niche. Every other record is judged exactly as before:
 *    seven live rows stay refused by the lists and the term guard below (six for
 *    being off-brand — the Himalayan Chef jars and the salt-lamp ionizer — and the
 *    deer block for naming its animal), and one more is kept by the guard but
 *    withheld by the public contract for having no price or copy.
 *  - It does not make these listings *eligible*. It only clears the niche guard;
 *    the public contract still decides what may be served, which is why the
 *    unpriced rows stay hidden whatever this list says.
 *
 * The live install traded these goods — 14 orders, the most recent in April 2026,
 * are the livestock records — so admitting them re-opens the shop's own trade
 * rather than introducing a new line.
 *
 * Each entry is the WooCommerce id, with the price and stock as measured on
 * 2026-10-09. **Delete an id when the live record is archived, or when the curated
 * SKU catalogue replaces it on the live install** — this list is a bridge to that
 * publication, not a permanent part of the policy.
 */
export const LIVE_LAUNCH_PRODUCT_IDS: readonly number[] = [
  // Bag of Himalayan Pink Salt for Livestock (45 lbs.) — $99.95, in stock
  271,
  // Himalayan Pink Salt Licks for Horses — $9.95, in stock
  281,
  // Himalayan Salt Rock for Cattle 18 Lbs Bag — $49.95, in stock
  291,
  // Himalayan Rock Salt Pouches in Fine and Coarse Grain Sizes - 6 lbs — $17.95, in stock
  2321,
  // Himalayan Edible Pink Salt – 16 oz Jar | Fine Grain — $9.95, in stock
  2446,
];

/** True when a record is one the owner admitted for the launch storefront. */
export function isLiveLaunchProduct(id: number | string | null | undefined): boolean {
  if (id === null || id === undefined || id === '') return false;
  const numeric = typeof id === 'number' ? id : Number(String(id));
  return Number.isFinite(numeric) && LIVE_LAUNCH_PRODUCT_IDS.includes(numeric);
}

/** Words that put a product outside the Himalayan pink salt niche. */
export const OFF_NICHE_TERMS: readonly string[] = [
  // Livestock
  'animal',
  'animals',
  'cattle',
  'bovine',
  'bull',
  'calf',
  'cow',
  'cows',
  'deer',
  'elk',
  'moose',
  'equine',
  'feed',
  'feedlot',
  'goat',
  'goats',
  'horse',
  'horses',
  'lamb',
  // NOTE: "lick" and "licks" are deliberately NOT terms here. They once were,
  // which made the guard refuse the shop's own authorised lines — the owner's
  // price list carries a Salt Licks range (`HK-LFH-*`) and a Salt Block range.
  // The term was doing two jobs: refusing the *word*, and refusing the
  // *animal-feed trade*. Only the second is real, and it is still caught — every
  // retired livestock record names its animal ("Salt Licks for Horses", "Salt
  // Block for Deer"), so 'horse' and 'deer' below exclude them without also
  // excluding the lines the owner sells. See `OWNER_APPROVED_SKUS`.
  'livestock',
  'pony',
  'poultry',
  'ranch',
  'sheep',
  'wildlife',
  // Pets
  'cat',
  'cats',
  'chicken',
  'chickens',
  'dog',
  'dogs',
  'guinea',
  'hamster',
  'kitten',
  'pet',
  'pets',
  'puppy',
  'rabbit',
  'rodent',
  // Birds and fish
  'aquarium',
  'bird',
  'birds',
];

const OFF_NICHE_PATTERN = new RegExp(`\\b(${OFF_NICHE_TERMS.join('|')})\\b`, 'i');

/**
 * The off-niche term a piece of text names, or `null` when it names none.
 *
 * Returned rather than reduced to a boolean because there is a second caller with
 * a second question: `middleware.ts` asks it about the *request URL*. Next
 * serialises the requested path and query into the response it streams, so a URL
 * that names an animal product comes back out in the raw HTML of a pink salt shop
 * — measured at three occurrences for `/products/salt-licks-for-horses` — even
 * though no such product was ever served. One denylist, asked about data at the
 * read seam and about URL text at the edge.
 */
export function offNicheTerm(text: string | null | undefined): string | null {
  if (!text) return null;
  const match = OFF_NICHE_PATTERN.exec(text);
  return match ? match[0].toLowerCase() : null;
}

/** True when the text names something outside the pink salt niche. */
export function isOffNicheText(text: string | null | undefined): boolean {
  return offNicheTerm(text) !== null;
}

/**
 * Catalog records the owner has refused, whatever they happen to be called.
 *
 * The term guard above judges *text* — "is this copy about livestock". These are
 * a different question with a different answer: the owner looked at the current
 * live catalogue and named products that are not what Himalayan Koh sells now,
 * even though every one of them is genuine pink salt and passes the term guard
 * cleanly. They are Himalayan Chef jars (a different brand) and a salt lamp /
 * ionizer air purifier.
 *
 * Two reasons this is a list of ids rather than more denylist terms:
 *
 * 1. **A rename must not bring a rejected product back.** These are carry-over
 *    WooCommerce records, and the owner can retitle one in the console at any
 *    time. The id is the only stable thing about it.
 * 2. **The rule the owner gave is not derivable from the copy.** "Published in
 *    WooCommerce" is not evidence that a product belongs on this storefront —
 *    that assumption is exactly what put these five on the temporary build. A
 *    curated list is the honest encoding of an owner decision, and it is
 *    reported in `docs/` so the decision is reviewable rather than implicit.
 *
 * They are also set to `draft` on staging, so the store stops returning them at
 * all; this guard is what makes the exclusion hold if one is ever republished —
 * and it covers production-sourced records (271, 281, 286, 291), which are
 * livestock and are already caught by the term guard.
 *
 * The decision was about particular *records*, not about their wording. Every one
 * of the five legacy records added below is a pink-salt product in substance, and
 * two (`2446`, `2321`) closely resemble authorised SKUs — renaming them would not
 * have made them wanted, because what retires them is the owner's price list
 * covering the same goods. Hiding them in WooCommerce removes them from the store
 * today; this list is what keeps them out if one is ever republished.
 */
export const OWNER_REJECTED_PRODUCT_IDS: readonly number[] = [
  // Himalayan Chef Himalayan Pink Salt Fine Grain, Jar-1 lbs
  2185,
  // Himalayan Chef Himalayan Pink Salt Coarse Grain, Jar-1 lbs
  2192,
  // HIMALAYAN CRYSTAL ROCK SALT LAMP IONIZER AIR PURIFIER (publish + draft copies)
  2292,
  2294,
  2295,

  // Legacy carry-over records the owner hid on 2026-09-18. All five were public on
  // the temporary build; the authorised SKUs above are the catalog that replaced
  // them. They stay in WooCommerce (draft, ids and history intact) — only their
  // storefront visibility is refused.
  //
  // NOTE (2026-10-09): two of the five — `2321` (Rock Salt Pouches, 6 lbs) and
  // `2446` (Edible Pink Salt, 16 oz jar) — are no longer refused. They are the two
  // most on-brand records on the live install, and the owner re-admitted them for
  // the launch storefront because the authorised SKU line that was meant to replace
  // them is published on staging, not on live. They are named in
  // `LIVE_LAUNCH_PRODUCT_IDS` above; the remaining three are still refused here.
  // SALT LICKS
  2352,
  // HIMALAYAN ROCK SALT BAG 18 LBS
  2372,
  // Himalayan Koh Authentic Pure Natural Halal Unprocessed ... Edible Pink Cooking Salt
  2461,
];

/**
 * The SKUs the owner has authorised for sale.
 *
 * Source: `Himalayan Salt Products Price List.xlsx`, supplied by the owner. This
 * is the **positive** half of the catalog policy and it is the half that decides
 * membership: the shop sells these SKUs. The term guard is now only a residual
 * safety net for records the owner has not spoken about.
 *
 * That inversion matters. The guard used to answer "does this text name an
 * animal", and the owner's own salt-lick range answers yes — which is how the
 * storefront came to refuse products the shop actually sells. An approved SKU is
 * an explicit human decision, so it outranks the text guard (but not a rejection:
 * see `isNicheProduct`).
 *
 * A SKU is the key rather than an id because the owner's list is keyed by SKU and
 * a SKU survives a retitle in the console.
 */
export const OWNER_APPROVED_SKUS: readonly string[] = [
  // Edible salt
  'HK-ESF-16oz',
  'HK-ESC-16oz',
  'HK-ESF-3lbs',
  'HK-ESF-6lbs',
  // Salt blocks
  'HK-BFD-8-4-1',
  'HK-LB-30LBS',
  // Salt licks
  'HK-LFH-2lbs',
  'HK-LFH-4lbs',
  'HK-LFH-6lbs',
  'HK-LFH-14lbs',
  'HK-LFH-30lbs',
  // Granular salt pouches
  'HK-SFL-F-3lbs',
  'HK-SFL-C-3lbs',
  'HK-SFL-F-6lbs',
  'HK-SFL-C-6lbs',
  // Bulk / rock salt
  'HK-SFL-F-45lbs',
  'HK-SFL-M-45lbs',
  'HK-SFL-C-45lbs',
  'HK-LFC-45lbs',
];

const APPROVED_SKU_SET = new Set(OWNER_APPROVED_SKUS.map((sku) => sku.toLowerCase()));

/** True when a catalog record carries an owner-authorised SKU. */
export function isOwnerApprovedSku(sku: string | null | undefined): boolean {
  if (!sku) return false;
  return APPROVED_SKU_SET.has(String(sku).trim().toLowerCase());
}

/**
 * Ids awaiting an owner decision.
 *
 * `SALT LICKS` (2352) used to sit here because the owner had not said whether it
 * was sold for human use. The price list answers that: the Salt Licks range is
 * authorised (`HK-LFH-*`), so this is no longer an open question and the record
 * is no longer withheld. Kept as an empty list because the mechanism is still the
 * right place for the next record the owner wants held back.
 */
export const OWNER_REVIEW_PRODUCT_IDS: readonly number[] = [];

/** True when a catalog record is one the owner has refused. */
export function isOwnerRejectedProduct(id: number | string | null | undefined): boolean {
  if (id === null || id === undefined || id === '') return false;
  const numeric = typeof id === 'number' ? id : Number(String(id));
  return Number.isFinite(numeric) && OWNER_REJECTED_PRODUCT_IDS.includes(numeric);
}

/** True when a catalog record is withheld pending an owner decision. */
export function isOwnerReviewProduct(id: number | string | null | undefined): boolean {
  if (id === null || id === undefined || id === '') return false;
  const numeric = typeof id === 'number' ? id : Number(String(id));
  return Number.isFinite(numeric) && OWNER_REVIEW_PRODUCT_IDS.includes(numeric);
}

/**
 * True when a product belongs on the Himalayan Koh storefront.
 *
 * A product is judged on everything about it that a visitor would see: its name,
 * its category, and its own copy. Each of the three is load-bearing, and each was
 * found to be load-bearing by a real row — a lick is off-niche from its name
 * alone, a neutrally named item filed under `animal feed` is off-niche from its
 * category, and a neutrally named, neutrally filed pouch was off-niche only in its
 * description, which is what the catalogue payload shipped to the browser.
 *
 * A product whose copy addresses the animal trade is withheld until the copy is
 * rewritten in WooCommerce, which is a one-field edit for the owner and is
 * reported to them in the console. That is deliberately stricter than judging the
 * name alone, because a shop cannot claim to sell pink salt for the kitchen while
 * its own description sells it for a feed lot.
 */
export function isNicheProduct(input: NicheCheckInput): boolean {
  // The owner's launch admission for the live catalogue, checked first because it
  // is the most recent decision about these named records: the shop was serving
  // nothing at all on the live install, and the owner chose to launch on the live
  // records it actually stocks and sells. See `LIVE_LAUNCH_PRODUCT_IDS`.
  if (isLiveLaunchProduct(input.id)) return true;

  // An owner decision outranks the text guard, in both directions, and a refusal
  // is checked first: a SKU on the approved list must never be able to re-admit a
  // record the owner has explicitly rejected.
  if (isOwnerRejectedProduct(input.id) || isOwnerReviewProduct(input.id)) return false;

  // The owner's own approval, recorded on the product from the console. Same
  // standing as an authorised SKU — it is a human decision about a named record,
  // which is exactly what the text guard cannot express.
  if (input.ownerApproved === true) return true;

  // The positive half of the policy: the owner's own price list decides what this
  // shop sells, so an authorised SKU is in the catalog whatever its name says.
  if (isOwnerApprovedSku(input.sku)) return true;

  return (
    !isOffNicheText(input.name) &&
    !isOffNicheText(input.category ?? '') &&
    !isOffNicheText(input.description ?? '')
  );
}

/** True when a category may appear in public navigation. */
export function isNicheCategory(name: string): boolean {
  return !isOffNicheText(name);
}

/** Drops off-niche products, preserving order. */
export function filterNicheProducts<T extends NicheCheckInput>(products: T[]): T[] {
  return products.filter(isNicheProduct);
}

/** How many products a filter removed — the figure the seam reports as a warning. */
export function countOffNicheProducts<T extends NicheCheckInput>(products: T[]): number {
  return products.length - filterNicheProducts(products).length;
}

/**
 * The storefront's shelves that actually hold something, with real counts.
 *
 * Composed from the guard and the taxonomy rather than maintained as a third
 * list: a shelf appears here exactly when a product the guard keeps is placed on
 * it, so the rail can never offer a filter that renders empty.
 */
export function sectionsWithProducts<T extends NicheCheckInput>(
  products: T[]
): Array<NicheSection & { count: number }> {
  const counts = new Map<NicheSectionKey, number>();
  for (const product of filterNicheProducts(products)) {
    const key = nicheSectionKeyFor(product);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return NICHE_SECTIONS.filter((section) => (counts.get(section.key) ?? 0) > 0).map((section) => ({
    ...section,
    count: counts.get(section.key) ?? 0,
  }));
}
