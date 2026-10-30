import type { ShippoParcelInput } from '../types';
import { UnsupportedPackingProductsError } from './errors';
import { resolvePackingRule } from './rules';
import { calcBillableWeightLbs, calcDimWeightLbs } from './dimWeight';
import type { ProductPackingProfile } from './productPackingProfile';

export interface PackingLineItem {
  productId?: string;
  quantity: number;
  slug: string;
  name: string;
  weightLbs?: number | null;
  packingProfile?: ProductPackingProfile;
}

function roundWeightLbs(value: number): number {
  return Math.max(0.1, Math.round(value * 100) / 100);
}

/**
 * How many units actually go in one box.
 *
 * `unitsPerBox` is a MAXIMUM, not a fixed count: the weight limit reduces it
 * whenever a full box would be too heavy. Exported so the product editor can
 * show the admin the same number checkout will use — computing it separately
 * there is how the editor came to reject configurations the packer handles.
 */
export function unitsAllowedByWeight(profile: ProductPackingProfile, unitWeightLbs: number): number {
  if (profile.shipsSeparately) return 1;
  const availableProductWeight = Math.max(
    0.1,
    profile.maxPackedWeightLbs - profile.packagingWeightLbs,
  );
  const byWeight = Math.max(1, Math.floor(availableProductWeight / unitWeightLbs));
  return Math.max(1, Math.min(profile.unitsPerBox, byWeight));
}

function buildProfileParcels(item: PackingLineItem, profile: ProductPackingProfile): ShippoParcelInput[] {
  const unitWeightLbs = Number(item.weightLbs);
  if (!Number.isFinite(unitWeightLbs) || unitWeightLbs <= 0) {
    throw new Error(`Shipping weight is missing for ${item.name || 'a product'}.`);
  }

  const unitsPerBox = unitsAllowedByWeight(profile, unitWeightLbs);
  const parcels: ShippoParcelInput[] = [];
  let remaining = item.quantity;

  while (remaining > 0) {
    const unitsInBox = Math.min(remaining, unitsPerBox);
    const actualWeightLbs = roundWeightLbs(
      unitsInBox * unitWeightLbs + profile.packagingWeightLbs,
    );
    const dimWeightLbs = roundWeightLbs(
      calcDimWeightLbs(profile.boxLengthIn, profile.boxWidthIn, profile.boxHeightIn),
    );
    const billableWeightLbs = roundWeightLbs(
      calcBillableWeightLbs(
        actualWeightLbs,
        profile.boxLengthIn,
        profile.boxWidthIn,
        profile.boxHeightIn,
      ),
    );

    if (actualWeightLbs > profile.maxPackedWeightLbs + 0.01) {
      throw new Error(
        `${item.name || 'Product'} exceeds its maximum packed weight of ${profile.maxPackedWeightLbs} lb.`,
      );
    }

    parcels.push({
      lengthIn: profile.boxLengthIn,
      widthIn: profile.boxWidthIn,
      heightIn: profile.boxHeightIn,
      weightLbs: billableWeightLbs,
      actualWeightLbs,
      dimWeightLbs,
    });
    remaining -= unitsInBox;
  }

  return parcels;
}

/**
 * Builds one Shippo parcel per shipping box.
 *
 * New products use their saved product_packing_profiles measurements. Legacy
 * products continue using the approved catalog rules until they are archived
 * or given a profile. Mixed SKUs remain in separate boxes for predictable,
 * auditable label costs; future bin-packing can safely build on `canMix`.
 *
 * **One box in, one parcel out, and nothing merges them.** There used to be a
 * `consolidateParcels` option on the rate request that summed every box into a single
 * parcel; it is gone, because the owner's rule is that each calculated box is its own
 * parcel and no configuration may collapse them. A merged parcel is a different (and
 * on a carrier's weight band, a cheaper) quote than the boxes that actually ship.
 */
/**
 * A cart line carries a whole number of units, and the packer is built on that.
 *
 * Both halves of this used to be wrong in silence. A negative quantity was skipped by
 * the same branch that skips zero, so a bad line simply vanished from the parcels while
 * the order still charged for it; and a fractional quantity was packed as itself — 1.5
 * licks became a 3 lb box — instead of being refused. Neither is a weight problem, so
 * neither is raised as one.
 */
function assertWholeUnits(item: PackingLineItem): void {
  const label = item.name || item.slug || 'a cart item';
  if (!Number.isFinite(item.quantity)) {
    throw new Error(`Quantity is not a number for ${label}.`);
  }
  if (item.quantity < 0) {
    throw new Error(`Quantity cannot be negative for ${label}.`);
  }
  if (!Number.isInteger(item.quantity)) {
    throw new Error(`Quantity must be a whole number of units for ${label}, got ${item.quantity}.`);
  }
}

export function buildParcelsFromPackingLineItems(items: PackingLineItem[]): ShippoParcelInput[] {
  if (items.length === 0) {
    throw new Error('At least one cart item is required for Shippo packing.');
  }

  const unsupported: { productId?: string; name: string; slug: string }[] = [];
  const parcels: ShippoParcelInput[] = [];

  for (const item of items) {
    assertWholeUnits(item);
    // Zero units is a line with nothing to ship, not a bad quantity: it adds no box.
    if (item.quantity === 0) continue;

    if (item.packingProfile) {
      parcels.push(...buildProfileParcels(item, item.packingProfile));
      continue;
    }

    const rule = resolvePackingRule({
      slug: item.slug,
      name: item.name,
      weightLbs: item.weightLbs,
    });
    if (!rule) {
      unsupported.push({
        productId: item.productId,
        name: item.name,
        slug: item.slug,
      });
      continue;
    }

    let remaining = item.quantity;
    while (remaining > 0) {
      const unitsInBox = Math.min(remaining, rule.unitsPerBox);
      const { lengthIn, widthIn, heightIn } = rule.box;
      const actualWeightLbs = roundWeightLbs(unitsInBox * rule.unitWeightLbs);
      const dimWeightLbs = roundWeightLbs(calcDimWeightLbs(lengthIn, widthIn, heightIn));
      const billableWeightLbs = roundWeightLbs(
        calcBillableWeightLbs(actualWeightLbs, lengthIn, widthIn, heightIn),
      );
      parcels.push({
        lengthIn,
        widthIn,
        heightIn,
        weightLbs: billableWeightLbs,
        actualWeightLbs,
        dimWeightLbs,
      });
      remaining -= unitsInBox;
    }
  }

  if (unsupported.length > 0) {
    throw new UnsupportedPackingProductsError(unsupported);
  }

  if (parcels.length === 0) {
    throw new Error('No shippable parcels could be calculated for this order.');
  }

  return parcels;
}
