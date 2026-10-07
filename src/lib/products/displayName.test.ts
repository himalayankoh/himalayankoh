import { describe, expect, it } from 'vitest';
import { cleanProductName, normalizeWeightUnits } from './displayName';

describe('normalizeWeightUnits', () => {
  it('reduces every store spelling of pounds to `lb`', () => {
    expect(normalizeWeightUnits('Himalayan Salt Block — 30 lbs')).toBe('Himalayan Salt Block — 30 lb');
    expect(normalizeWeightUnits('Bag of Salt (45 lbs.)')).toBe('Bag of Salt (45 lb)');
    expect(normalizeWeightUnits('Fine Grain 3 lb.')).toBe('Fine Grain 3 lb');
    expect(normalizeWeightUnits('Pouch — 6 lb')).toBe('Pouch — 6 lb');
    expect(normalizeWeightUnits('Lick 2 lbs')).toBe('Lick 2 lb');
  });

  it('leaves content with no weight unit untouched', () => {
    expect(normalizeWeightUnits('Himalayan Pink Edible Salt Coarse Grain — 16 oz jar')).toBe(
      'Himalayan Pink Edible Salt Coarse Grain — 16 oz jar',
    );
    expect(normalizeWeightUnits('0.5–1.0 mm fine grain')).toBe('0.5–1.0 mm fine grain');
  });
});

describe('cleanProductName', () => {
  it('removes a brand suffix appended to the end of the visible name', () => {
    expect(cleanProductName('Himalayan Salt Rock for Cattle (30 lbs) Bag - Himalayan Koh')).toBe(
      'Himalayan Salt Rock for Cattle (30 lb) Bag',
    );
    expect(cleanProductName('Himalayan Rock Salt Pouches — 6 lbs | Himalayan Koh')).toBe(
      'Himalayan Rock Salt Pouches — 6 lb',
    );
  });

  it('does not strip a leading brand, only a trailing one', () => {
    expect(cleanProductName('Himalayan Koh Authentic Pure Natural Pink Cooking Salt')).toBe(
      'Himalayan Koh Authentic Pure Natural Pink Cooking Salt',
    );
  });

  it('never touches a name that is already clean', () => {
    expect(cleanProductName('Himalayan Salt Block — 30 lb')).toBe('Himalayan Salt Block — 30 lb');
  });

  it("applies the owner's approved title for the 45 lb livestock product by its stable slug", () => {
    expect(
      cleanProductName(
        'Bag of Himalayan Pink Salt for Livestock (45 lbs.) - Himalayan Koh',
        'bag-of-himalayan-pink-salt-for-livestock-45-lbs-himalayan-koh',
      ),
    ).toBe('Himalayan Rock Salt for Livestock (45 lb)');
    // The slug is what identifies the product, so the same name without the slug is
    // only cleaned, not renamed.
    expect(cleanProductName('Bag of Himalayan Pink Salt for Livestock (45 lbs.) - Himalayan Koh')).toBe(
      'Bag of Himalayan Pink Salt for Livestock (45 lb)',
    );
  });

  it('handles empty input without inventing a name', () => {
    expect(cleanProductName('')).toBe('');
    expect(cleanProductName('   ')).toBe('');
  });
});
