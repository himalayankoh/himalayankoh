/**
 * WooCommerce's save errors, said in words the owner can act on.
 *
 * The store answers a refused write with its own vocabulary — `product_invalid_sku:
 * Invalid or duplicated SKU` — which is precise but reads like a crash. Measured
 * live on staging: the editor showed nothing at all for a duplicate SKU, so the
 * owner saw Save do nothing. This module is the one place that turns a store
 * message into a sentence, and it never invents a cause it does not recognise:
 * an unknown message is passed through unchanged rather than replaced.
 */

const TRANSLATIONS: Array<{ match: RegExp; message: string }> = [
  {
    match: /product_invalid_sku|invalid or duplicated sku|duplicate(d)? sku/i,
    message:
      'This SKU is already in use by another product. Use a different SKU, or leave the field blank — SKU is optional.',
  },
  {
    match: /rest_invalid_param|invalid parameter/i,
    message:
      'The store rejected one of the values in this save, so nothing was changed. Check the price, status and stock fields.',
  },
  {
    match: /product_invalid_(price|sale_price|regular_price)|invalid price/i,
    message: 'The store rejected this price. Use a plain number, for example 24.99.',
  },
  {
    match: /woocommerce_rest_cannot_(edit|create|read)|not allowed to (edit|create)/i,
    message: 'The store refused this write: its credentials are not allowed to change this product.',
  },
  {
    match: /timed out|timeout|aborted/i,
    message: 'The store did not answer in time. The save was not confirmed — check the product in WooCommerce before retrying.',
  },
  {
    match: /fetch failed|econnrefused|enotfound|socket hang up/i,
    message: 'The store could not be reached. Nothing was saved.',
  },
];

/**
 * A save failure → one line to show the owner.
 *
 * `fallback` is used when the store gave no message at all, so the caller can
 * still say which act failed.
 */
export function humanSaveError(message: unknown, fallback = 'The save failed. Nothing was changed.'): string {
  const raw = typeof message === 'string' ? message.trim() : '';
  if (!raw) return fallback;
  for (const { match, message: translated } of TRANSLATIONS) {
    if (match.test(raw)) return translated;
  }
  // Unrecognised: the store's own words are more useful than a generic sentence.
  return raw;
}
