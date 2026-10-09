import { describe, expect, it } from 'vitest';
import {
  countOffNicheProducts,
  filterNicheProducts,
  isNicheCategory,
  isNicheProduct,
  isOffNicheText,
  isLiveLaunchProduct,
  isOwnerApprovedSku,
  isOwnerRejectedProduct,
  LIVE_LAUNCH_PRODUCT_IDS,
  OWNER_APPROVED_SKUS,
  OWNER_REJECTED_PRODUCT_IDS,
  sectionsWithProducts,
} from './niche';
import { nicheSectionKeyFor } from './nicheSections';

/**
 * The staging catalog as it actually stands (see the niche audit doc). These
 * cases are the real rows, not invented ones, so a change to the guard shows up
 * here as a change to what the storefront would serve.
 *
 * The description on row 2321 is the real one: a neutrally named, neutrally filed
 * pouch whose copy opens "Elevate Livestock Well-being ... your animals". It is the
 * reason the guard judges copy at all — it passed on name and category alone, and
 * its description was reaching the catalogue payload of every visitor.
 *
 * These rows deliberately carry no `id`: they exercise the *term* guard, which is
 * the net under the owner's positive list. The ids the owner has decided about are
 * a separate case, asserted below against `OWNER_REJECTED_PRODUCT_IDS`.
 */
const STAGING_CATALOG = [
  { name: 'Himalayan Koh Edible Pink Salt', category: 'Uncategorized' },
  { name: 'Himalayan Koh Edible Pink Salt Jar', category: 'Uncategorized' },
  { name: 'HIMALAYAN ROCK SALT BAG 18 LBS', category: 'Bulk Order' },
  { name: 'HIMALAYAN SALT POUCHES', category: 'Bulk Order' },
  {
    name: 'Himalayan Koh Pink Salt Pouches',
    category: 'Uncategorized',
    description:
      'Elevate Livestock Well-being with Our Himalayan Pink Salt Pouches. Choose between two grain sizes to suit the preferences and consumption patterns of your animals. The finer texture makes it an ideal choice for mixing with feed or including in water sources.',
  },
  {
    name: 'HIMALAYAN CRYSTAL ROCK SALT LAMP IONIZER AIR PURIFIER WITH DIMMABLE CORD',
    category: 'Uncategorized',
  },
  { name: 'Himalayan Chef Himalayan Pink Salt Coarse Grain, Jar-1 lbs', category: 'Uncategorized' },
  { name: 'Himalayan Chef Himalayan Pink Salt Fine Grain, Jar-1 lbs', category: 'Uncategorized' },
  { name: 'SALT LICKS', category: 'Bulk Order' },
  { name: 'Himalayan Pink Salt Block for Deer', category: 'animal feed' },
  { name: 'Himalayan Koh Salt Licks for Horses', category: 'animal feed' },
];

describe('isOffNicheText', () => {
  it('matches the animal terms the store does not sell', () => {
    for (const text of [
      'Himalayan Salt Licks for Horses',
      'Salt Block for Deer',
      'animal feed',
      'Salt for Cattle',
      'Dog Chew',
      'Cat Litter',
      'Poultry Grit',
      'Livestock Salt Lumps',
      'Wildlife Block',
      'Equine Mineral',
    ]) {
      expect(isOffNicheText(text), text).toBe(true);
    }
  });

  it('does not match these on a substring inside a longer word', () => {
    for (const text of [
      'Himalayan Pink Salt Coarse Grain, Jar-1 lbs',
      'Category Hub',
      'Cowhide Pattern Plate', // 'cow' inside a longer word
      'Petite Salt Jar', // 'pet' inside a longer word
      'Salt Lamp with Catania Cord', // 'cat' inside a longer word
      '',
      null,
      undefined,
    ]) {
      expect(isOffNicheText(text), String(text)).toBe(false);
    }
  });
});

describe('isNicheProduct', () => {
  it('keeps every genuine pink salt product in the current catalog', () => {
    const kept = filterNicheProducts(STAGING_CATALOG).map((product) => product.name);
    expect(kept).toHaveLength(8);
    expect(kept).toContain('Himalayan Koh Edible Pink Salt');
    expect(kept).toContain('HIMALAYAN CRYSTAL ROCK SALT LAMP IONIZER AIR PURIFIER WITH DIMMABLE CORD');
    expect(kept).toContain('HIMALAYAN ROCK SALT BAG 18 LBS');
  });

  it('drops the off-niche products, by name, category or copy', () => {
    expect(countOffNicheProducts(STAGING_CATALOG)).toBe(3);
    const kept = filterNicheProducts(STAGING_CATALOG).map((product) => product.name);
    // The shop's own salt-lick line is kept; the animal-feed records are not.
    expect(kept).toContain('SALT LICKS');
    expect(kept).not.toContain('Himalayan Pink Salt Block for Deer');
    expect(kept).not.toContain('Himalayan Koh Salt Licks for Horses');
    expect(kept).not.toContain('Himalayan Koh Pink Salt Pouches');
  });

  it('judges a neutrally named product by its category', () => {
    expect(isNicheProduct({ name: 'Pink Salt Block', category: 'animal feed' })).toBe(false);
    expect(isNicheProduct({ name: 'Pink Salt Block', category: 'Edible Pink Salt' })).toBe(true);
  });

  it('judges a neutrally named, neutrally filed product by its copy', () => {
    const nameAndCategoryOnly = { name: 'Himalayan Koh Pink Salt Pouches', category: 'Uncategorized' };
    expect(isNicheProduct(nameAndCategoryOnly)).toBe(true);
    expect(
      isNicheProduct({
        ...nameAndCategoryOnly,
        description: 'Our pouches suit your livestock and your animals, mixed with feed.',
      })
    ).toBe(false);
  });

  it('no longer refuses the word "lick", because the shop sells a Salt Licks range', () => {
    // The term guard used to carry 'lick'/'licks', which made it refuse the
    // owner's own authorised line. The animal-feed trade is still refused — the
    // retired records name their animal — so the word alone is not evidence.
    expect(isOffNicheText('SALT LICKS')).toBe(false);
    expect(isOffNicheText('Himalayan Salt Lick — 1 to 2 lbs')).toBe(false);
    expect(isOffNicheText('Himalayan Salt Licks for Horses')).toBe(true);
    expect(isOffNicheText('Salt Block for Deer')).toBe(true);
  });

  it('treats a missing category or description as no evidence of being off-niche', () => {
    expect(isNicheProduct({ name: 'Himalayan Pink Salt Jar', category: null })).toBe(true);
    expect(isNicheProduct({ name: 'Himalayan Pink Salt Jar', description: null })).toBe(true);
    expect(isNicheProduct({ name: 'Himalayan Pink Salt Jar', description: '' })).toBe(true);
  });
});

describe('owner catalog policy', () => {
  it('admits an authorised SKU whatever the name says', () => {
    // The owner's price list authorises the Salt Licks range, and "Salt Lick" is
    // exactly the kind of name the term guard exists to distrust — so approval has
    // to be a positive list that outranks it.
    expect(isOwnerApprovedSku('HK-LFH-2lbs')).toBe(true);
    expect(isOwnerApprovedSku('hk-lfh-2lbs')).toBe(true);
    expect(isOwnerApprovedSku(' HK-LFH-30lbs ')).toBe(true);
    expect(isOwnerApprovedSku('HK-NOT-A-REAL-SKU')).toBe(false);
    expect(isOwnerApprovedSku('')).toBe(false);
    expect(isOwnerApprovedSku(null)).toBe(false);

    // Every SKU on the owner list is admissible, even under an animal-feed
    // category — the SKU is the owner's decision about membership.
    for (const sku of OWNER_APPROVED_SKUS) {
      expect(isNicheProduct({ sku, name: 'Himalayan Salt Lick', category: 'animal feed' })).toBe(true);
    }
  });

  it('lets a refusal outrank an approval', () => {
    // Order of precedence is the design: the owner rejecting a specific record
    // must not be undone by a SKU that happens to be authorised.
    const rejected = OWNER_REJECTED_PRODUCT_IDS[0];
    expect(isNicheProduct({ id: rejected, sku: 'HK-ESF-16oz', name: 'Himalayan Pink Salt' })).toBe(false);
  });

  it('refuses every record the owner has rejected, by id and not by wording', () => {
    // Two owner decisions live in one list: the products they refused outright
    // (Himalayan Chef jars, the salt lamp) and the legacy carry-overs they hid on
    // 2026-09-18. Both are refused however they are named, because the decision
    // was about the record — the remaining three are pink-salt products in
    // substance and are refused all the same.
    //
    // `2321` and `2446` were on this list and are no longer: the owner re-admitted
    // them for the live launch on 2026-10-09 (see `LIVE_LAUNCH_PRODUCT_IDS`).
    const HIDDEN_LEGACY = [2352, 2372, 2461];
    for (const id of HIDDEN_LEGACY) {
      expect(OWNER_REJECTED_PRODUCT_IDS, `id ${id}`).toContain(id);
      expect(isNicheProduct({ id, name: 'Himalayan Pink Salt', category: 'Edible Pink Salt' })).toBe(
        false
      );
    }

    // A rename plus an authorised SKU is not enough to bring one back: that is
    // the case this list exists for, since any of them could be retitled in the
    // console.
    expect(
      isNicheProduct({
        id: 2352,
        sku: 'HK-LFH-2lbs',
        name: 'Himalayan Pink Salt Fine Grain',
        category: 'Edible Pink Salt',
      })
    ).toBe(false);
  });

  it('admits the live records the owner named for the launch storefront', () => {
    // The live install is the legacy catalogue, and the policy written for the
    // curated launch catalogue withheld every row of it. The owner's decision was
    // to launch on the live records the shop actually stocks — these five, which
    // are the only live rows both correctly priced and in stock.
    expect(LIVE_LAUNCH_PRODUCT_IDS).toEqual([271, 281, 291, 2321, 2446]);

    for (const id of LIVE_LAUNCH_PRODUCT_IDS) {
      expect(isLiveLaunchProduct(id), `id ${id}`).toBe(true);
      // Admitted however they are filed, and without a SKU: the live records carry
      // none, and the animal-feed category is exactly what the term guard refuses.
      expect(
        isNicheProduct({
          id,
          sku: null,
          name: 'Himalayan Pink Salt Licks for Horses',
          category: 'animal feed',
          description: 'Salt for your livestock and your animals.',
        }),
        `id ${id}`
      ).toBe(true);
    }

    // The admission is a list of named records, not a rule about their wording or
    // their neighbours: an adjacent id, and a livestock record with no admission,
    // are both still refused.
    expect(isLiveLaunchProduct(272)).toBe(false);
    expect(isLiveLaunchProduct('')).toBe(false);
    expect(isLiveLaunchProduct(null)).toBe(false);
    expect(
      isNicheProduct({ id: 272, name: 'Himalayan Pink Salt Licks for Horses', category: 'animal feed' })
    ).toBe(false);
    expect(
      isNicheProduct({ id: 286, name: 'Himalayan Pink Salt Block for Deer', category: 'animal feed' })
    ).toBe(false);
  });

  it('keeps the id on the record, so the guard survives in both directions', () => {
    // The guard reads ids as numbers or strings — WooCommerce supplies numbers
    // through REST and strings through the admin routes.
    expect(isOwnerRejectedProduct('2352')).toBe(true);
    expect(isOwnerRejectedProduct(2352)).toBe(true);
    expect(isOwnerRejectedProduct('')).toBe(false);
    expect(isOwnerRejectedProduct(null)).toBe(false);
    // An authorised product is not refused merely because it has an id.
    expect(isNicheProduct({ id: 3001, sku: 'HK-LFH-30lbs', name: 'Himalayan Salt Lick — 30 lbs' })).toBe(
      true
    );
  });

  it('still refuses the animal-feed records the owner never approved', () => {
    expect(isNicheProduct({ name: 'Himalayan Pink Salt Block for Deer', category: 'animal feed' })).toBe(false);
    expect(isNicheProduct({ name: 'Himalayan Koh Salt Licks for Horses' })).toBe(false);
    // No SKU on the retired records, which is why the term guard still earns its
    // place as the net underneath the positive list.
    expect(isNicheProduct({ sku: null, name: 'Himalayan Salt Licks for Horses' })).toBe(false);
  });
});

describe('isNicheCategory', () => {
  it('hides the animal-feed category and keeps the rest', () => {
    expect(isNicheCategory('animal feed')).toBe(false);
    expect(isNicheCategory('Bulk Order')).toBe(true);
    expect(isNicheCategory('Edible Pink Salt')).toBe(true);
    expect(isNicheCategory('Salt Lamps & Décor')).toBe(true);
  });
});

describe('nicheSectionKeyFor', () => {
  it('places lamps, blocks and bulk where a shopper would look', () => {
    expect(
      nicheSectionKeyFor({
        name: 'HIMALAYAN CRYSTAL ROCK SALT LAMP IONIZER',
        category: 'Uncategorized',
      })
    ).toBe('lamps-decor');
    expect(nicheSectionKeyFor({ name: 'Himalayan Pink Salt Block 30 lbs', category: null })).toBe(
      'cooking-serving'
    );
    expect(nicheSectionKeyFor({ name: 'HIMALAYAN ROCK SALT BAG 18 LBS', category: 'Bulk Order' })).toBe(
      'bulk'
    );
    expect(nicheSectionKeyFor({ name: 'Himalayan Pink Salt Fine Grain Jar', category: null })).toBe(
      'edible-pink-salt'
    );
  });

  it('returns nothing for a product with no salt in it at all', () => {
    expect(nicheSectionKeyFor({ name: 'Canvas Tote Bag', category: 'Bulk Order' })).toBeNull();
    expect(nicheSectionKeyFor({ name: 'Shipping Box', category: 'Uncategorized' })).toBeNull();
  });

  /**
   * The owner's filing decides, from the real staging rows.
   *
   * Both of these were placed wrongly before: the 45 lb bag was read as bulk from
   * its size while the owner had filed it under `Edible Pink Salt`, and the 30 lb
   * cattle bag fell through to edible salt even though the owner filed it under
   * `Bulk and Rock Salt`. A shopper clicking either category found the wrong grid.
   */
  it('files a product by the owner\u2019s WooCommerce category over a size in its title', () => {
    expect(
      nicheSectionKeyFor({
        name: 'Bag of Himalayan Pink Salt for Livestock (45 lbs.)',
        category: 'Edible Pink Salt',
      })
    ).toBe('edible-pink-salt');
    expect(
      nicheSectionKeyFor({
        name: 'Himalayan Salt Rock for Cattle 30 Lbs Bag',
        category: 'Bulk and Rock Salt',
      })
    ).toBe('bulk');
  });

  it('keeps a named kind on its own shelf even when the category is vague', () => {
    // A licks product filed under `Bulk Order` is still a lick: the name says what
    // it is, and "Bulk Order" is a way of buying rather than a shelf.
    expect(nicheSectionKeyFor({ name: 'SALT LICKS', category: 'Bulk Order' })).toBe('licks-blocks');
  });
});

describe('sectionsWithProducts', () => {
  it('lists only shelves that actually hold something, with real counts', () => {
    const sections = sectionsWithProducts(STAGING_CATALOG);
    expect(sections.map((section) => section.key)).toEqual([
      'edible-pink-salt',
      'licks-blocks',
      'lamps-decor',
      'bulk',
    ]);
    expect(sections.find((section) => section.key === 'edible-pink-salt')?.count).toBe(4);
    expect(sections.find((section) => section.key === 'bulk')?.count).toBe(2);
    expect(sections.find((section) => section.key === 'lamps-decor')?.count).toBe(1);
    // The shelf the owner's Salt Licks line lands on. It appears only because a
    // kept product is actually filed there, which is the point of composing the
    // rail from the guard rather than maintaining a second list.
    expect(sections.find((section) => section.key === 'licks-blocks')?.count).toBe(1);
    // No bath or gift-set shelf exists yet, and none is invented to fill the row.
    expect(sections).toHaveLength(4);
  });

  it('does not invent a section for an empty catalog', () => {
    expect(sectionsWithProducts([])).toEqual([]);
  });

  it('never counts an off-niche product towards a shelf', () => {
    const onlyAnimal = STAGING_CATALOG.filter((product) => product.category === 'animal feed');
    expect(sectionsWithProducts(onlyAnimal)).toEqual([]);
  });
});
