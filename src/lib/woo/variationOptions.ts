/**
 * A product's real variation options, read from WooCommerce.
 *
 * ## Why this exists
 *
 * Grain size used to be a *description*: the products are named "... Fine Grain —
 * 6 lbs" and carry their grain in a free-text attribute, and the storefront's grain
 * selector was fed by a Supabase `grain_sizes` column that only the old source had.
 * On the WooCommerce source the selector therefore had nothing to render, and a
 * cart line could not name a grain at all — `wc/store/v1/cart/add-item` takes
 * `{ id, quantity, variation }`, and a `simple` product has no variations to pick.
 *
 * Grain is now a real WooCommerce variation axis, so this module reads what the
 * store offers and states it in the two forms the application needs: labels for
 * display, and an `attribute`/`value` pair the cart can address.
 *
 * ## What the cart addresses, and what it must not be derived from
 *
 * `add-item` takes the axis by **the name the store's own REST API reports**
 * (`Grain Size`, `Size/Weight`, `Grain Type`) and the option by **the store's own
 * option string** (`Coarse Grain`, `2 lbs.`, `1kg`). Both are passed through
 * untouched, because both are only true of the store that reported them.
 *
 * Inventing either one is what broke this: an axis is *not* reliably `pa_` + the
 * slugified name. `Size/Weight` is registered as the taxonomy `pa_block-weight`, so
 * `pa_size-weight` is refused — and a **custom** product attribute (the kind
 * WooCommerce reports with `id: 0`) has no taxonomy at all, so every `pa_` form is
 * refused for it. Likewise an option is *not* reliably `sanitize_title` of the
 * label: a custom attribute's options are not terms and have no slug, so a
 * slugified value is refused while the option as written is accepted.
 *
 * A wrong pair is refused by the store with
 * `woocommerce_rest_variation_id_from_variation_data`, never silently mispriced,
 * so the failure is loud — but it is still a failed add-to-cart, and the probes that
 * settled the rule are recorded in the migration notes.
 *
 * Pure and server-safe: no credentials, no network.
 */

import type { ProductVariationOption, ProductVariations } from '../../data/products';
import { parseWooDecimal, type WooVariationLike } from './productPayload';

/** A product attribute as REST v3 reports it. */
export interface RestV3Attribute {
  id?: number;
  name?: string;
  visible?: boolean;
  /** True when this axis is what a shopper chooses between. */
  variation?: boolean;
  options?: string[];
}

/**
 * The axis a shopper picks from: grain when the store varies grain, otherwise the
 * first variation attribute the product declares.
 *
 * One axis is assumed. A product varying on two (grain × weight, say) needs a
 * selector per axis and a different model; picking one silently would present a
 * half-truth, so the second axis is ignored until that UI exists.
 */
function selectableAxis(attributes: RestV3Attribute[] | undefined): RestV3Attribute | null {
  const axes = (attributes ?? []).filter(
    (attribute) => attribute.variation === true && (attribute.options?.length ?? 0) > 0
  );
  if (!axes.length) return null;
  return axes.find((attribute) => /grain/i.test(String(attribute.name ?? ''))) ?? axes[0];
}

function optionRow(
  variations: WooVariationLike[],
  axisLabel: string,
  option: string
): WooVariationLike | null {
  const wanted = option.trim();
  return (
    variations.find((variation) =>
      (variation.attributes ?? []).some(
        (attribute) =>
          String(attribute.option ?? '').trim() === wanted &&
          // An axis is matched by name when the store reports one, so two axes that
          // share an option name cannot be confused for each other.
          (axisLabel === '' || String(attribute.name ?? '').trim() === axisLabel)
      )
    ) ?? null
  );
}

/**
 * The product's variation options, or undefined when it sells no choices.
 *
 * An option is only offered when it has a variation behind it: a declared option
 * with no variation is one the store cannot price or fulfil, and offering it would
 * hand the shopper a dead end at the cart.
 */
export function productVariations(
  attributes: RestV3Attribute[] | undefined,
  variations: WooVariationLike[]
): ProductVariations | undefined {
  const axis = selectableAxis(attributes);
  if (!axis) return undefined;

  const attributeLabel = String(axis.name ?? '').trim();
  // The axis name *is* the key the cart takes (see the module doc): it is the one
  // form that is right for a global attribute and for a custom one, and the only
  // form a custom attribute has.
  const attribute = attributeLabel;
  if (!attribute) return undefined;

  const options: ProductVariationOption[] = [];
  for (const option of axis.options ?? []) {
    const label = String(option ?? '').trim();
    if (!label) continue;

    const row = optionRow(variations, attributeLabel, label);
    if (!row || typeof row.id !== 'number') continue;

    options.push({
      id: row.id,
      attribute,
      label,
      // The store's own option string, not a slug derived from it: a custom
      // attribute's options are not terms, and the cart refuses a slug for them.
      value: label,
      price: parseWooDecimal(row.sale_price) ?? parseWooDecimal(row.regular_price),
      sku: row.sku?.trim() ? row.sku.trim() : null,
      // Absent stock means the store did not say; only a positive report counts,
      // the same rule the catalog applies to the parent product.
      inStock: row.stock_status === 'instock' || row.stock_status === 'onbackorder',
    });
  }

  return options.length ? { attributeLabel, options } : undefined;
}

/** The labels the storefront's selector shows, or undefined when there is no choice. */
export function variationOptionLabels(
  variations: ProductVariations | undefined
): string[] | undefined {
  const labels = (variations?.options ?? []).map((option) => option.label).filter(Boolean);
  return labels.length ? labels : undefined;
}

/** The option a label refers to, for a caller holding only the label. */
export function findVariationOption(
  variations: ProductVariations | undefined,
  label: string | undefined
): ProductVariationOption | undefined {
  if (!variations || !label) return undefined;
  const wanted = label.trim();
  return variations.options.find((option) => option.label === wanted);
}
