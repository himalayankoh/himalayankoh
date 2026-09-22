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
 * Grain is now a real WooCommerce variation axis (`pa_grain-size`), so this module
 * reads what the store offers and states it in the two forms the application
 * needs: labels for display, and an `attribute`/`value` pair the cart can address.
 *
 * ## The two forms are not the same string
 *
 * The cart is addressed with a **term slug** (`coarse-grain`) and the shopper is
 * shown the **term name** (`Coarse Grain`). They are the store's pairing, not ours:
 * a term's slug is generated from its name and can be edited afterwards, which is
 * why a slug can never be derived from a label *reliably* — only the store's own
 * naming is authoritative. WooCommerce's REST API reports the option's name on a
 * variation and no slug, so the slug here is the standard `sanitize_title` of the
 * name, which is exactly how WooCommerce derives it. A term whose slug was edited
 * by hand would need the attribute's term list to be read instead; that is
 * deliberately not done per request, and a mismatch surfaces as the store's own
 * refusal rather than a silently wrong line.
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

/** `sanitize_title`, as WordPress spells it. */
export function slugify(value: string): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * How a global product attribute is named in a cart: `Grain Size` -> `pa_grain-size`.
 *
 * WooCommerce registers global attributes as `pa_<slug of the name>`, and that
 * prefixed form is what its cart expects for a taxonomy-backed axis. A *custom*
 * product attribute (one defined on the product itself) is addressed by its bare
 * name instead — this catalog uses the global attribute, and
 * `storeVariationPayload` is the single place that would change if that ever
 * differs.
 */
export function globalAttributeSlug(name: string): string {
  return `pa_${slugify(name)}`;
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
  const attribute = globalAttributeSlug(attributeLabel || 'option');

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
      value: slugify(label),
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

/**
 * The `variation` entry the Store API's `add-item` expects.
 *
 * The browser may name an axis and a value; the store validates the pair against
 * the product and prices the line itself, so a forged option buys nothing — it is
 * refused. Price is never sent from the client.
 */
export function storeVariationPayload(option: {
  attribute: string;
  value: string;
}): { attribute: string; value: string } {
  return { attribute: option.attribute, value: option.value };
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
