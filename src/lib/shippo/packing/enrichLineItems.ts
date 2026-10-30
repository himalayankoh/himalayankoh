import { readOrderableProducts } from '@/lib/woo/packingProfile';
import type { RatesLineItem } from '../types';
import type { PackingLineItem } from './buildParcels';

/**
 * Adds the product facts a parcel is built from — slug, name, packed weight and
 * packing profile — to the cart lines that are about to be rated.
 *
 * The facts come from WooCommerce, which owns the product: its own weight and
 * dimensions are core fields there, and the packing profile is registered product
 * meta (`lib/woo/packingProfile.ts`). A line item whose product cannot be read keeps
 * whatever the cart itself reported and rates from that, so a store outage degrades
 * a quote instead of failing checkout — and it is never rated from a *guessed*
 * weight.
 */
export async function enrichRatesLineItems(
  lineItems: RatesLineItem[],
): Promise<PackingLineItem[]> {
  const products = await readOrderableProducts(lineItems.map((item) => item.productId)).catch(
    (error) => {
      // Ratings must still be possible when the product read fails: the cart's own
      // weight is honest data, and refusing to quote at all would block checkout on
      // a hiccup in a read that is only improving the answer.
      console.warn(
        `[Shippo] Product facts could not be read from WooCommerce, rating from cart data: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return new Map<string, never>();
    },
  );

  return lineItems
    .filter((item) => item.quantity > 0)
    .map((item) => {
      const fromStore = item.productId ? products.get(String(item.productId)) : undefined;
      return {
        productId: item.productId,
        quantity: item.quantity,
        slug: fromStore?.slug ?? '',
        name: fromStore?.name ?? '',
        weightLbs: fromStore?.weightLbs ?? item.weightLbs ?? null,
        packingProfile: fromStore?.packingProfile ?? undefined,
      };
    });
}
