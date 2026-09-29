import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { buildMetadata } from '@/lib/seo/metadata';
import { breadcrumbJsonLd, faqJsonLd } from '@/lib/seo/jsonLd';
import { fetchSeoProductModel, seoFetchDeadline } from '@/lib/seo/server';
import { lookupCatalogProduct } from '@/lib/backend/serverCatalog';
import { buildProductStructuredData } from '@/lib/products/productSchema';
import { buildProductPageSeo, getProductDisplayName } from '@/lib/products/productSeo';
import JsonLd from '@/components/seo/JsonLd';
import ProductDetailClient from './ProductDetailClient';

type Params = { slug: string };

/**
 * Product pages are cached at the edge for a minute.
 *
 * Measured 2026-09-29: an uncached product page took 865–885 ms on the preview
 * Worker, and the origin read behind it ~730 ms, for a page that is identical
 * for every visitor. One minute is the window `STOREFRONT_READ_TTL_SECONDS`
 * already documents — browsing may be a minute stale, buying never is:
 * add-to-cart, cart recalculation and checkout read WooCommerce directly and
 * uncached, and WooCommerce refuses a quantity it cannot stock, so a cached
 * listing cannot oversell. Saving a product in the admin console purges the
 * page immediately rather than waiting out the window.
 */
export const revalidate = 60;

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = await fetchSeoProductModel(slug).catch(() => null);

  // No canonical, no OpenGraph URL and an explicit noindex for a slug that
  // resolves no product. Emitting `canonical: /products/<slug>` here is how a
  // withheld or non-existent product announced itself to a crawler, and the copy
  // of a withheld product (staging still carries animal-feed listings) must not be
  // advertised under any URL. The page itself answers 404 — see `Page` below.
  if (!product) {
    return {
      title: 'Product not found — Himalayan Koh',
      robots: { index: false, follow: false },
    } satisfies Metadata;
  }

  // Same helper the client view uses, so the server HTML title/description
  // match the hydrated page instead of competing with it.
  const { title, description } = buildProductPageSeo(product);

  return buildMetadata({
    title,
    description,
    path: `/products/${product.slug}`,
    ogImage: product.image,
    ogType: 'product',
  });
}

/**
 * FAQs emitted as FAQPage structured data on every product page.
 *
 * Generic by design, and about the salt rather than about a health outcome:
 * what the pink colour is, which grain to pick, what is (and is not) added, and
 * how to keep it. No medical or veterinary advice is asserted here, because
 * structured data is quoted verbatim by search engines and a shop is not a
 * clinician.
 */
const PRODUCT_FAQs = faqJsonLd([
  {
    question: 'Why is Himalayan pink salt pink?',
    answer:
      'The colour comes from iron and other trace minerals the rock already contains. Unrefined Himalayan salt keeps them; salt washed to pure white sodium chloride does not.',
  },
  {
    question: 'Which grain size should I choose?',
    answer:
      'Fine grain dissolves quickly and suits baking and brines. Medium grain fills a grinder for everyday cooking. Coarse grain is for finishing, rimming a glass and slow cooks.',
  },
  {
    question: 'Does this salt contain additives?',
    answer:
      'No. Our Himalayan pink salt is unrefined and contains no anti-caking agents, bleaching or added iodine.',
  },
  {
    question: 'How should I store it?',
    answer:
      'Keep it sealed and dry, away from the stove and from anything strongly scented. Salt does not spoil; it only takes on moisture or odours.',
  },
]);

/**
 * A slug that resolves no product is a real 404, not a page that says so.
 *
 * It used to answer 200 with the generic title "Product - Himalayan Koh", a
 * canonical pointing at itself and `robots: index, follow` — a soft 404 that
 * invited indexing of a URL whose whole content was the words "Product Not
 * Found". Staging's off-niche products (animal-feed listings, whose own copy is
 * withheld from the storefront) each had such a page. The not-found response
 * carries the shop's 404 page instead, and `generateMetadata` above emits no
 * canonical for it.
 */
export default async function Page({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const lookup = await lookupCatalogProduct(slug, seoFetchDeadline()).catch(() => null);
  const product = lookup?.product ?? null;
  const related = lookup?.related ?? [];

  if (!product) notFound();

  return (
    <>
      {/* Full Product + Offer + FAQPage + WebPage graph, server-rendered so
          crawlers get it without executing the client bundle. */}
      <JsonLd data={buildProductStructuredData(product)} />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'Products', path: '/products' },
          { name: getProductDisplayName(product), path: `/products/${product.slug}` },
        ])}
      />
      <JsonLd data={PRODUCT_FAQs} />
      {/* key remounts the view when navigating product-to-product, so the
          seeded server data is picked up instead of the previous product's. */}
      <ProductDetailClient
        key={product.slug}
        initialProduct={product}
        initialRelated={related}
      />
    </>
  );
}
