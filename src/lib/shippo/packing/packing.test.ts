// ============================================================================
// Approved packing for the 2 lb and 6 lb salt licks
//
// Both licks ship in the same approved parcel — 10 x 10 x 6 inches — and differ only in
// how many fit in it: six of the 2 lb lick, four of the 6 lb lick. One box is one parcel
// and one label, so a quantity that does not fit becomes more parcels rather than a
// heavier box: 7 x 2 lb is 12 lb + 2 lb, never a single 14 lb parcel.
//
// The weights are the owner's: a 2 lb piece weighs 2 lb and a 6 lb piece weighs 6 lb, with
// no box tare added, because no owner-provided carton weight exists to add.
// ============================================================================
import { describe, expect, it } from 'vitest';

import { buildParcelsFromPackingLineItems, type PackingLineItem } from './buildParcels';
import { UnsupportedPackingProductsError } from './errors';
import { ACTIVE_PACKING_RULES, getPackingRuleById, resolvePackingRule } from './rules';
import { shippoParcelPayload } from '../server/parcels';
import { calcDimWeightLbs } from './dimWeight';

const APPROVED_BOX = { lengthIn: 10, widthIn: 10, heightIn: 6 };

/**
 * The live catalogue's lick listing, as WooCommerce now holds it.
 *
 * It was filed as `HK-LFH-6lbs` weighing 6 lb while its title and slug both said 2 lb,
 * so it packed as the heavier lick — four to a box on a 24 lb parcel for a box of 2 lb
 * pieces. The owner confirmed it is the 2 lb lick and the product was corrected to
 * `HK-LFH-2lbs` and 2 lb, so this slug is the 2 lb case and the packing follows it.
 */
const LIVE_LICK_SLUG = 'himalayan-pink-salt-licks-for-horses-2-lbs-himalayan-koh';

const lick2 = (quantity: number): PackingLineItem => ({
  productId: 'lick-2lb',
  quantity,
  slug: LIVE_LICK_SLUG,
  name: 'Himalayan Pink Salt Licks for Horses 2 lbs',
  weightLbs: 2,
});

const lick6 = (quantity: number): PackingLineItem => ({
  productId: 'lick-6lb',
  quantity,
  slug: 'himalayan-6lb-salt-lick',
  name: 'Himalayan Salt Lick 6 lb',
  weightLbs: 6,
});

/** The weight the carrier is actually told for each parcel, in box order. */
const weightsOf = (items: PackingLineItem[]): number[] =>
  buildParcelsFromPackingLineItems(items).map((parcel) => Number(shippoParcelPayload(parcel).weight));

describe('2 lb salt lick packing', () => {
  it('packs one to a box', () => {
    expect(weightsOf([lick2(1)])).toEqual([2]);
  });

  it('packs six to a box', () => {
    expect(weightsOf([lick2(6)])).toEqual([12]);
  });

  it('splits seven into a full box and a part box', () => {
    expect(weightsOf([lick2(7)])).toEqual([12, 2]);
  });

  it('packs twelve into two', () => {
    expect(weightsOf([lick2(12)])).toEqual([12, 12]);
  });

  it('splits thirteen into three', () => {
    expect(weightsOf([lick2(13)])).toEqual([12, 12, 2]);
  });
});

describe('6 lb salt lick packing', () => {
  it('packs one to a box', () => {
    expect(weightsOf([lick6(1)])).toEqual([6]);
  });

  it('packs four to a box', () => {
    expect(weightsOf([lick6(4)])).toEqual([24]);
  });

  it('splits five into a full box and a part box', () => {
    expect(weightsOf([lick6(5)])).toEqual([24, 6]);
  });

  it('packs eight into two', () => {
    expect(weightsOf([lick6(8)])).toEqual([24, 24]);
  });

  it('splits nine into three', () => {
    expect(weightsOf([lick6(9)])).toEqual([24, 24, 6]);
  });
});

describe('the approved box', () => {
  it('is 10 x 10 x 6 on both licks, at every quantity', () => {
    for (const quantity of [1, 2, 3, 4, 5, 6, 7, 8, 9, 12, 13, 24]) {
      for (const item of [lick2(quantity), lick6(quantity)]) {
        for (const parcel of buildParcelsFromPackingLineItems([item])) {
          expect({
            lengthIn: parcel.lengthIn,
            widthIn: parcel.widthIn,
            heightIn: parcel.heightIn,
          }).toEqual(APPROVED_BOX);
        }
      }
    }
  });

  it('is the same box the rules declare for both licks', () => {
    // The 6 lb lick used to be on a 9.5 x 9.5 x 5.5 carton, so the dimensions quoted to a
    // carrier were not the box that goes out.
    expect(getPackingRuleById('lick-2lb')?.box).toEqual(APPROVED_BOX);
    expect(getPackingRuleById('lick-6lb')?.box).toEqual(APPROVED_BOX);
  });

  it('takes six 2 lb licks and four 6 lb licks to a box', () => {
    expect(getPackingRuleById('lick-2lb')?.unitsPerBox).toBe(6);
    expect(getPackingRuleById('lick-6lb')?.unitsPerBox).toBe(4);
    expect(getPackingRuleById('lick-2lb')?.unitWeightLbs).toBe(2);
    expect(getPackingRuleById('lick-6lb')?.unitWeightLbs).toBe(6);
  });

  it('adds no box tare, because no carton weight was ever approved', () => {
    const [parcel] = buildParcelsFromPackingLineItems([lick2(6)]);
    expect(parcel.actualWeightLbs).toBe(12);
    const [sixPound] = buildParcelsFromPackingLineItems([lick6(4)]);
    expect(sixPound.actualWeightLbs).toBe(24);
  });
});

describe('each box is its own Shippo parcel', () => {
  it('sends seven 2 lb licks as 12 lb and 2 lb, not one 14 lb parcel', () => {
    const payloads = buildParcelsFromPackingLineItems([lick2(7)]).map(shippoParcelPayload);
    expect(payloads).toHaveLength(2);
    expect(Number(payloads[0].weight)).toBe(12);
    expect(Number(payloads[1].weight)).toBe(2);
    // The collapse this guards against: one parcel carrying the whole order.
    expect(payloads.some((payload) => Number(payload.weight) === 14)).toBe(false);
  });

  it('gives every parcel the approved dimensions on the wire', () => {
    for (const payload of buildParcelsFromPackingLineItems([lick6(9)]).map(shippoParcelPayload)) {
      expect(payload.distance_unit).toBe('in');
      expect(payload.mass_unit).toBe('lb');
      expect([Number(payload.length), Number(payload.width), Number(payload.height)]).toEqual([10, 10, 6]);
    }
  });

  it('tells the carrier the actual weight, not our own billable weight', () => {
    // Applying the DIM rule ourselves turned a 2 lb parcel into a 3.61 lb one, because
    // 10 x 10 x 6 / 166 is heavier than 2 lb. Which of the two a carrier bills on is the
    // carrier's rule, so the parcel goes out at its real weight and Shippo decides.
    const dimWeightLbs = calcDimWeightLbs(10, 10, 6);
    expect(dimWeightLbs).toBeGreaterThan(2);

    const [payload] = buildParcelsFromPackingLineItems([lick2(1)]).map(shippoParcelPayload);
    expect(Number(payload.weight)).toBe(2);
    expect(Number(payload.weight)).not.toBeCloseTo(dimWeightLbs, 2);
  });
});

describe('a mixed 2 lb and 6 lb cart stays separate', () => {
  it('packs each side on its own rule', () => {
    // 7 x 2 lb is two boxes and 5 x 6 lb is two boxes: four parcels, one label each. Mixed
    // box optimisation needs a packing rule the owner has not approved yet.
    expect(weightsOf([lick2(7), lick6(5)])).toEqual([12, 2, 24, 6]);
  });

  it('keeps one box per parcel even when one side alone would fill it', () => {
    expect(weightsOf([lick2(13), lick6(9)])).toEqual([12, 12, 2, 24, 24, 6]);
  });
});

describe('quantities that are not a whole number of units', () => {
  it('creates no parcels for zero', () => {
    expect(() => buildParcelsFromPackingLineItems([lick2(0)])).toThrow(
      /No shippable parcels could be calculated/,
    );
  });

  it('refuses a negative quantity rather than dropping that line', () => {
    // It used to fall into the same branch as zero and vanish, while the order still
    // charged for the units.
    expect(() => buildParcelsFromPackingLineItems([lick2(-1)])).toThrow(/cannot be negative/);
    expect(() => buildParcelsFromPackingLineItems([lick2(2), lick6(-3)])).toThrow(/cannot be negative/);
  });

  it('refuses a fractional quantity rather than packing it as itself', () => {
    expect(() => buildParcelsFromPackingLineItems([lick2(1.5)])).toThrow(/whole number of units/);
    expect(() => buildParcelsFromPackingLineItems([lick6(0.5)])).toThrow(/whole number of units/);
  });

  it('refuses a quantity that is not a number at all', () => {
    expect(() => buildParcelsFromPackingLineItems([lick2(Number.NaN)])).toThrow(/not a number/);
  });
});

describe('which product gets which rule', () => {
  it('gives the live lick listing the 2 lb rule, now that its weight says 2 lb', () => {
    // The exact product the owner corrected, resolved the way checkout resolves it: from
    // the name and weight WooCommerce reports. Six to a box at 2 lb a piece.
    const rule = resolvePackingRule({
      slug: LIVE_LICK_SLUG,
      name: 'Himalayan Pink Salt Licks for Horses 2 lbs',
      weightLbs: 2,
    });
    expect(rule?.id).toBe('lick-2lb');
    expect(rule?.box).toEqual(APPROVED_BOX);
    expect(rule?.unitsPerBox).toBe(6);
  });

  it('gives the 6 lb lick the 6 lb rule by its own weight', () => {
    const rule = resolvePackingRule({
      slug: 'himalayan-6lb-salt-lick',
      name: 'Himalayan Salt Lick 6 lb',
      weightLbs: 6,
    });
    expect(rule?.id).toBe('lick-6lb');
    expect(rule?.unitsPerBox).toBe(4);
  });

  it('leaves the other catalogue sizes on the rules they already had', () => {
    // The owner approved packing for the 2 lb and 6 lb licks only; the other sizes keep
    // the behaviour they already shipped with rather than a guess.
    expect(resolvePackingRule({ slug: 'x', name: 'Himalayan Salt Lick 4 lb', weightLbs: 4 })?.id).toBe('lick-4lb');
    expect(
      resolvePackingRule({
        slug: 'himalayan-rock-salt-pouches-in-fine-and-coarse-grain-sizes-6-lbs-himalayan-koh',
        name: 'Himalayan Pink Salt for Livestock - 6 lbs Fine or Coarse Grain Pouches',
        weightLbs: 6,
      })?.id,
    ).toBe('pouch-6lb-fine');
    expect(
      resolvePackingRule({
        slug: 'bag-of-himalayan-pink-salt-for-livestock-45-lbs-himalayan-koh',
        name: 'Bag of Himalayan Pink Salt for Livestock (45 lbs.)',
        weightLbs: 45,
      })?.id,
    ).toBe('bag-45lb');
  });

  it('does not hand the lick box to a product it cannot size', () => {
    expect(resolvePackingRule({ slug: 'mystery-sku', name: 'Mystery Product', weightLbs: null })).toBeNull();
    expect(() =>
      buildParcelsFromPackingLineItems([
        { quantity: 1, slug: 'mystery-sku', name: 'Mystery Product', weightLbs: null },
      ]),
    ).toThrow(UnsupportedPackingProductsError);
  });

  it('keeps both lick rules present and distinct', () => {
    const ids = ACTIVE_PACKING_RULES.map((rule) => rule.id);
    expect(ids.filter((id) => id === 'lick-2lb')).toHaveLength(1);
    expect(ids.filter((id) => id === 'lick-6lb')).toHaveLength(1);
  });
});

describe('no unit is lost and none is duplicated', () => {
  it('ships exactly the units ordered, for both licks across the range', () => {
    for (const quantity of [1, 2, 3, 5, 6, 7, 8, 9, 12, 13, 24, 25, 100]) {
      for (const [weightPerUnit, item] of [
        [2, lick2(quantity)],
        [6, lick6(quantity)],
      ] as const) {
        const parcels = buildParcelsFromPackingLineItems([item]);
        const shippedPounds = parcels.reduce((sum, parcel) => sum + (parcel.actualWeightLbs ?? 0), 0);
        expect(shippedPounds).toBe(quantity * weightPerUnit);
      }
    }
  });

  it('produces the smallest number of boxes the box limit allows', () => {
    expect(buildParcelsFromPackingLineItems([lick2(6)])).toHaveLength(1);
    expect(buildParcelsFromPackingLineItems([lick2(7)])).toHaveLength(2);
    expect(buildParcelsFromPackingLineItems([lick6(4)])).toHaveLength(1);
    expect(buildParcelsFromPackingLineItems([lick6(5)])).toHaveLength(2);
  });
});
