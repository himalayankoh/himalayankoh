/**
 * The wholesale catalog an approved buyer sees.
 *
 * ## Cost never crosses this boundary
 *
 * `hk_wholesale_products.ex_factory_cost` is what the factory charges Himalayan
 * Koh. A buyer sees the **tier prices** — the B2B selling ladder — and when no tier
 * is configured for a product they see "price on request", never the cost. The
 * projection is built here, server-side, so the response body simply has no field
 * for a supplier's price.
 *
 * ## The storefront half
 *
 * A wholesale product is a *reference* to a WooCommerce product, so the name and
 * image come from the store (read with the same WooCommerce reader the console
 * uses) and everything commercial comes from the wholesale tables. A product whose
 * WooCommerce row has vanished still lists with its wholesale name, because the
 * wholesale listing is the buyer's document of record.
 *
 * ## Pallet arithmetic is stated, not asserted
 *
 * Each entry carries the resolved cartons-per-pallet and units-per-pallet the
 * engine will use, so a buyer planning a container sees the same numbers the quote
 * will. When those rest on default packaging rather than the factory's own
 * measurements, `estimateNote` says so.
 */

import { NextResponse } from 'next/server';
import { requireActiveBuyer } from '@/lib/wholesale/requireBuyer';
import { loadWholesaleData } from '@/lib/wholesale/pricing';
import { derivePalletLayout } from '@/lib/wholesale/engine';
import type { BuyerCatalogItem } from '@/lib/wholesale/buyerView';
import { listWooProducts } from '@/lib/woo/productWrite';
import { fromWooProduct } from '@/lib/woo/productPayload';

export const dynamic = 'force-dynamic';

/** Storefront facts for the linked products, keyed by WooCommerce product id. */
async function storefrontFacts(
  wooIds: number[]
): Promise<Map<number, { name: string; image: string | null; slug: string | null }>> {
  const facts = new Map<number, { name: string; image: string | null; slug: string | null }>();
  if (!wooIds.length) return facts;

  try {
    // The raw WooCommerce rows are mapped by the same converter the console uses,
    // so "what WooCommerce calls this product" has one implementation.
    const products = (await listWooProducts({ status: 'any', perPage: 100 })).map(fromWooProduct);
    for (const product of products) {
      if (!wooIds.includes(product.id)) continue;
      facts.set(product.id, {
        name: product.name,
        image: product.images[0] ?? null,
        slug: product.slug || null,
      });
    }
  } catch {
    // A storefront read that fails must not empty the wholesale catalog: the
    // wholesale listing stands on its own and the UI shows no storefront name.
    return facts;
  }

  return facts;
}

export async function GET(request: Request) {
  const gate = await requireActiveBuyer(request);
  if (!gate.ok) return gate.response;

  try {
    const data = await loadWholesaleData();
    const facts = await storefrontFacts(
      data.products.map((product) => product.wooProductId).filter((id): id is number => typeof id === 'number' && id > 0)
    );

    const items: BuyerCatalogItem[] = data.products.map((product) => {
      const tiers = data.tiers
        .filter((tier) => tier.productId === product.id)
        .sort((a, b) => a.minUnits - b.minUnits)
        .map((tier) => ({ minUnits: tier.minUnits, unitPrice: tier.unitPrice, currency: tier.currency }));

      let packaging: BuyerCatalogItem['packaging'] = null;
      try {
        const layout = derivePalletLayout(product.packaging);
        packaging = {
          unitsPerCarton: product.packaging.cartonQty,
          cartonsPerPallet: layout.cartonsPerPallet,
          unitsPerPallet: layout.unitsPerPallet,
          palletGrossWeightKg: layout.palletGrossWeightKg,
          palletCbm: layout.palletCbm,
        };
      } catch {
        // A profile that cannot hold a carton is a data-entry problem, not a
        // catalog-breaking one: the product lists with no pallet arithmetic, and
        // the quote builder will refuse it with the engine's own explanation.
        packaging = null;
      }

      const storefront = product.wooProductId ? facts.get(product.wooProductId) ?? null : null;

      return {
        id: product.rowId,
        name: product.name || storefront?.name || `Wholesale product ${product.rowId}`,
        wholesaleSku: product.wholesaleSku,
        storefront: {
          productId: product.wooProductId,
          name: storefront?.name ?? null,
          image: storefront?.image ?? null,
          slug: storefront?.slug ?? null,
        },
        moq: product.moq,
        leadTimeDays: product.leadTimeDays,
        packaging,
        tiers,
        fromUnitPrice: tiers.length ? Math.min(...tiers.map((tier) => tier.unitPrice)) : null,
        currency: product.currency,
        estimateNote: product.packagingDefaultsUsed.length
          ? `Pallet math uses default packaging for: ${product.packagingDefaultsUsed.join(', ')}.`
          : null,
      };
    });

    return NextResponse.json({
      currency: items[0]?.currency ?? 'USD',
      items,
      count: items.length,
      // Stated on the payload, because a buyer must never read these as firm prices.
      pricing: 'INDICATIVE',
      note:
        items.some((item) => !item.tiers.length)
          ? 'Products without a volume price are quoted on request.'
          : null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? `The wholesale catalog could not be read: ${error.message}`
            : 'The wholesale catalog could not be read.',
      },
      { status: 502 }
    );
  }
}
