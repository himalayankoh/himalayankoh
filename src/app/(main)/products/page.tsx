import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo/metadata';
import { breadcrumbJsonLd, aggregateOfferJsonLd } from '@/lib/seo/jsonLd';
import { getCatalogProducts } from '@/lib/backend/serverCatalog';
import JsonLd from '@/components/seo/JsonLd';
import ProductsClient from './ProductsClient';

/**
 * The default catalogue — the page `/products` with no query string.
 *
 * ## Why this route reads no `searchParams`
 *
 * It used to. `searchParams` is a request-scoped value, so reading it made the
 * route dynamic, and a dynamic route is never prerendered and never cached at
 * the edge: measured 2026-09-29 on the preview Worker, `/products` took 899 ms
 * with `Cache-Control: no-store, must-revalidate` while `/` and `/faqs` — the
 * same layout, the same components, statically rendered — answered in 60 ms.
 * Every visitor paid a full WooCommerce round trip for a page whose content is
 * identical for all of them.
 *
 * So the query string moved out of this module. `middleware.ts` rewrites a
 * query-bearing `/products` request to the shelf route
 * (`src/app/(main)/products/shelf/[key]/page.tsx`), which is where
 * `?category=` gets its own title, canonical and breadcrumb, and where a search
 * or sort term is answered. Both routes render the same `ProductsClient` over
 * the same catalog read, so there is exactly one catalogue implementation.
 *
 * The address bar is untouched by that rewrite: `/products?category=edible`
 * stays `/products?category=edible` for the shopper, for links and for
 * crawlers, and its canonical is still built by `buildProductsCategoryPath`.
 *
 * ## Freshness
 *
 * One minute, the same window `STOREFRONT_READ_TTL_SECONDS` documents: browsing
 * may be a minute stale, buying never is. Add-to-cart, cart recalculation and
 * checkout read WooCommerce directly and uncached, and WooCommerce refuses a
 * quantity it cannot stock, so a stale listing cannot oversell. A price
 * correction reaches this page within a minute, or immediately when the admin
 * console saves a product (`revalidateTag` purges the edge entry — see
 * `lib/backend/cacheTags.ts`).
 */
export const revalidate = 60;

const DEFAULT_PRODUCTS_SEO = {
  title: 'Shop Himalayan Pink Salt — Edible, Blocks & Lamps | Himalayan Koh',
  description:
    'Shop Himalayan pink salt: fine and coarse edible grades, salt blocks and serving plates, lamps and décor, and bulk bags. Unrefined and mineral-rich.',
};

export function generateMetadata(): Metadata {
  return buildMetadata({ ...DEFAULT_PRODUCTS_SEO, path: '/products' });
}

export default async function Page() {
  // One catalogue read serves the page, the schema below and the client grid.
  //
  // The read goes through the catalog seam — the same source the grid renders —
  // so schema can never advertise a price the shop is not actually showing, and
  // the client is handed the products this render was built from instead of
  // asking the backend for the whole catalogue again on mount.
  //
  // When the source cannot report prices no AggregateOffer is emitted at all,
  // which is why this is silent rather than an error, and why `availability` is
  // omitted unless the source reported stock we can stand behind.
  let catalogProducts: Awaited<ReturnType<typeof getCatalogProducts>>['products'] | null = null;
  let aggregateOffer = null;
  try {
    const read = await getCatalogProducts();
    catalogProducts = read.products;

    const priced = read.products.filter(
      (product) => typeof product.priceMin === 'number' && Number.isFinite(product.priceMin)
    );
    if (priced.length > 0) {
      const prices = priced.map((product) => product.priceMin as number);
      aggregateOffer = aggregateOfferJsonLd({
        minPrice: Math.min(...prices),
        maxPrice: Math.max(...prices),
        priceCurrency: 'USD',
        offerCount: priced.length,
        availability: priced.some((product) => product.inStock) ? 'InStock' : 'OutOfStock',
      });
    }
  } catch (err) {
    // A failed read costs the page its schema and its first paint data, not the
    // page: the grid then reads for itself and reports the failure there.
    console.error('Could not read the catalog for /products:', err);
  }

  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'Products', path: '/products' },
        ])}
      />
      {aggregateOffer && <JsonLd data={aggregateOffer} />}
      <ProductsClient initialProducts={catalogProducts} initialCategoryKey={null} />
    </>
  );
}
