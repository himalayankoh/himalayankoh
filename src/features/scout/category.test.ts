import { describe, expect, it } from 'vitest';

import { hasNicheFormSignal, hasNicheRelevance, saltCategoryFromText } from './category';

describe('saltCategoryFromText', () => {
  it('classifies this store’s own product titles', () => {
    expect(saltCategoryFromText('Himalayan Salt Medium Grain — 45 lbs')).toBe('Himalayan Salt');
    expect(saltCategoryFromText('Himalayan Pink Salt Fine (0.5–1.0 mm)')).toBe('Himalayan Salt');
    expect(saltCategoryFromText('Organic Himalayan Pink Salt 5 lb Pouch')).toBe('Himalayan Salt');
  });

  it('classifies salt that is not spelled Himalayan', () => {
    expect(saltCategoryFromText('Salt Lick for Livestock')).toBe('Salt Product');
    expect(saltCategoryFromText('Bath Salt Soak')).toBe('Salt Product');
  });

  it('returns null rather than guessing a category for an unrelated product', () => {
    expect(saltCategoryFromText('KONG Classic Dog Toy')).toBeNull();
    expect(saltCategoryFromText('dog toys')).toBeNull();
    expect(saltCategoryFromText('')).toBeNull();
    expect(saltCategoryFromText('Wireless Earbuds')).toBeNull();
  });
});

describe('demand signals', () => {
  it('awards relevance for the material and a form for the product type', () => {
    expect(hasNicheRelevance('Himalayan Salt Medium Grain 45 lbs')).toBe(true);
    expect(hasNicheFormSignal('Himalayan Salt Medium Grain 45 lbs')).toBe(true);
  });

  /**
   * A pack size is not a product form. "Himalayan Salt 45 lbs" names the
   * material and a weight, so it earns the relevance point and not the form
   * point — the store's own titles say Medium/Fine/Coarse Grain and earn both.
   */
  it('does not read a pack size as a product form', () => {
    expect(hasNicheRelevance('Himalayan Salt 45 lbs')).toBe(true);
    expect(hasNicheFormSignal('Himalayan Salt 45 lbs')).toBe(false);
  });

  /**
   * The two criteria must not be the same fact counted twice: a title that only
   * names the material gets relevance and no form signal.
   */
  it('does not double-count the bare material as a form', () => {
    expect(hasNicheRelevance('Himalayan Salt')).toBe(true);
    expect(hasNicheFormSignal('Himalayan Salt')).toBe(false);
  });

  it('gives nothing to a product outside this store’s niche', () => {
    expect(hasNicheRelevance('KONG Classic Dog Toy')).toBe(false);
    expect(hasNicheFormSignal('KONG Classic Dog Toy')).toBe(false);
  });
});
