import type { ProductPackingProfile, ProductPackingProfileRow } from './productPackingProfile';

export const PACKING_PROFILE_TAG_PREFIX = 'packing_profile:';

export function encodePackingProfileTag(
  profile: Omit<ProductPackingProfile, 'productId'>,
): string {
  return `${PACKING_PROFILE_TAG_PREFIX}${encodeURIComponent(JSON.stringify(profile))}`;
}

export function decodePackingProfileTag(
  productId: string,
  tags: unknown,
): ProductPackingProfile | null {
  if (!Array.isArray(tags)) return null;
  const encoded = tags.find(
    (tag): tag is string => typeof tag === 'string' && tag.startsWith(PACKING_PROFILE_TAG_PREFIX),
  );
  if (!encoded) return null;
  return decodePackingProfileJson(
    productId,
    decodeURIComponent(encoded.slice(PACKING_PROFILE_TAG_PREFIX.length)),
  );
}

/**
 * Decodes a packing profile from its JSON form.
 *
 * The same validation the tag form used, because both are the same profile: an
 * incomplete one is not a profile with defaults, it is a profile that does not
 * exist yet, and rating a parcel on half-filled dimensions would quote a price for
 * a box the customer will not receive.
 */
export function decodePackingProfileJson(
  productId: string,
  json: unknown,
): ProductPackingProfile | null {
  if (json && typeof json === 'object') {
    // WooCommerce hands a serialised meta value back already parsed.
    return profileFromParsed(productId, json as Partial<Omit<ProductPackingProfile, 'productId'>>);
  }
  if (typeof json !== 'string' || !json.trim()) return null;

  try {
    const parsed = JSON.parse(json) as Partial<Omit<ProductPackingProfile, 'productId'>>;
    return profileFromParsed(productId, parsed);
  } catch {
    return null;
  }
}

function profileFromParsed(
  productId: string,
  parsed: Partial<Omit<ProductPackingProfile, 'productId'>>,
): ProductPackingProfile | null {
  try {
    const row: ProductPackingProfileRow = {
      product_id: productId,
      product_length_in: Number(parsed.productLengthIn),
      product_width_in: Number(parsed.productWidthIn),
      product_height_in: Number(parsed.productHeightIn),
      box_length_in: Number(parsed.boxLengthIn),
      box_width_in: Number(parsed.boxWidthIn),
      box_height_in: Number(parsed.boxHeightIn),
      packaging_weight_lbs: Number(parsed.packagingWeightLbs),
      units_per_box: Number(parsed.unitsPerBox),
      max_packed_weight_lbs: Number(parsed.maxPackedWeightLbs),
      ships_separately: Boolean(parsed.shipsSeparately),
      can_mix: Boolean(parsed.canMix),
      fragile: Boolean(parsed.fragile),
      stackable: parsed.stackable !== false,
    };

    const required = [
      row.product_length_in,
      row.product_width_in,
      row.product_height_in,
      row.box_length_in,
      row.box_width_in,
      row.box_height_in,
      row.units_per_box,
      row.max_packed_weight_lbs,
    ];
    if (required.some((value) => !Number.isFinite(Number(value)) || Number(value) <= 0)) {
      return null;
    }

    return {
      productId,
      productLengthIn: Number(row.product_length_in),
      productWidthIn: Number(row.product_width_in),
      productHeightIn: Number(row.product_height_in),
      boxLengthIn: Number(row.box_length_in),
      boxWidthIn: Number(row.box_width_in),
      boxHeightIn: Number(row.box_height_in),
      packagingWeightLbs: Math.max(0, Number(row.packaging_weight_lbs) || 0),
      unitsPerBox: Math.max(1, Math.floor(Number(row.units_per_box) || 1)),
      maxPackedWeightLbs: Math.min(70, Number(row.max_packed_weight_lbs) || 70),
      shipsSeparately: row.ships_separately,
      canMix: row.can_mix,
      fragile: row.fragile,
      stackable: row.stackable,
    };
  } catch {
    return null;
  }
}
