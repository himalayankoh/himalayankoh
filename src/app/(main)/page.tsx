import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo/metadata';
import { DEFAULT_DESCRIPTION, DEFAULT_TITLE } from '@/lib/seo/constants';
import { localBusinessJsonLd } from '@/lib/seo/jsonLd';
import { getCatalogProducts } from '@/lib/backend/serverCatalog';
import { selectHomeFeatured } from '@/features/catalog/homeFeatured';
import type { Product } from '@/data/products';
import JsonLd from '@/components/seo/JsonLd';
import HomeClient from './HomeClient';

/**
 * The homepage reads the catalogue on the server and hands the cards it built to
 * the client.
 *
 * It used to be a pure shell: `HomeClient` rendered it and the featured products
 * arrived in a browser fetch after hydration. Measured on the preview deployment
 * (2026-10-06, real browser), that meant the homepage's own HTML contained **no
 * product record at all** — no title, no price, no image URL — and the first
 * product photo could not start until the visitor's browser had hydrated the
 * page, fetched the catalogue and rendered the cards. On the most-visited page in
 * the shop, the product images were late by construction rather than by accident:
 * the first card's photo was requested at 944 ms, against a first contentful paint
 * of 794 ms.
 *
 * Now the page renders the same four cards the client used to fetch, so the
 * titles, prices, links and image URLs are in the first response and the photos
 * are discovered by the preload scanner. The client keeps its own read as a
 * fallback only: `initialProducts` is left `undefined` when the server read fails,
 * which is what tells `HomePage` to fetch for itself and keep the page usable.
 *
 * ## Freshness
 *
 * The window is one minute, the same `STOREFRONT_READ_TTL_SECONDS` documents,
 * because this page now carries prices and stock the same way `/products` does.
 * It was five minutes while the page read no commerce data at all. A price
 * correction reaches the homepage within a minute, or immediately when the admin
 * console saves a product, which purges the edge entry.
 */
export const revalidate = 60;

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    path: '/',
  });
}

export default async function Page() {
  // `undefined` means "the server could not read it", which is a different fact
  // from "the catalogue is empty" — an empty array here renders the empty state
  // and issues no duplicate fetch, while `undefined` lets the client retry.
  let featured: Product[] | undefined;

  try {
    const { products } = await getCatalogProducts();
    // The same rule the client fallback uses, so the cards rendered here and the
    // cards a browser would fetch cannot disagree about what the homepage shows.
    featured = selectHomeFeatured(products);
  } catch (error) {
    console.error('Could not read the catalog for the homepage:', error);
  }

  return (
    <>
      <JsonLd data={localBusinessJsonLd()} />
      <HomeClient initialProducts={featured} />
    </>
  );
}
