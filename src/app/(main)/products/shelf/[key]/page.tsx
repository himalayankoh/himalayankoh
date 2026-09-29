import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo/metadata';
import { breadcrumbJsonLd } from '@/lib/seo/jsonLd';
import { getCatalogProducts } from '@/lib/backend/serverCatalog';
import {
  buildProductsCategoryPath,
  filterLabelFromKey,
  getCategoryContent,
  normalizeCategoryQueryValue,
  productShelfKey,
  type CategoryContentKey,
} from '@/lib/categoryContent';
import { NICHE_SECTIONS } from '@/lib/catalog/nicheSections';
import JsonLd from '@/components/seo/JsonLd';
import ProductsClient from '../../ProductsClient';

/**
 * The catalogue as a request with a query string sees it.
 *
 * `middleware.ts` rewrites a query-bearing `/products` request here — a live
 * `?category=` shelf keeps its own key, anything else (`?search=`, `?sort=`,
 * `?page=`) lands on `all`, which is the whole catalogue under the plain
 * `/products` metadata and canonical.
 *
 * Why this route exists at all: `/products` must read no `searchParams` so it
 * can be prerendered and edge-cached (see that module), and a shelf's own
 * title, description, canonical and breadcrumb are the reason the query
 * string cannot simply be ignored on the server. Splitting the two cases into
 * two routes is what lets the popular one be cached while the shelf keeps its
 * SEO; both render the same `ProductsClient` over the same catalog read, so
 * there is no second catalogue implementation and no second data source.
 *
 * The shopper's address bar is unchanged by the rewrite, so
 * `/products?category=edible` remains the canonical URL a crawler indexes and
 * `buildProductsCategoryPath` keeps producing exactly that.
 */
export const revalidate = 60;

/** The sentinel key for "a query string, but not a shelf". */
const ALL_KEY = 'all';

type Params = { key: string };

/**
 * Every shelf the middleware can rewrite to, known at build time.
 *
 * The shelf pages are the ones a crawler and an old link arrive on, so they are
 * prerendered rather than rendered on first request; `all` is included because a
 * shared `?search=` link should not pay a cold render either.
 */
export function generateStaticParams(): Params[] {
  return [
    { key: ALL_KEY },
    ...NICHE_SECTIONS.map((section) => ({ key: String(section.key) })),
  ];
}

/** The shelf a path key names, or `null` for `all` and for anything unknown. */
function shelfFromKey(raw: string): CategoryContentKey | null {
  if (!raw || raw === ALL_KEY) return null;
  return normalizeCategoryQueryValue(raw);
}

const DEFAULT_PRODUCTS_SEO = {
  title: 'Shop Himalayan Pink Salt — Edible, Blocks & Lamps | Himalayan Koh',
  description:
    'Shop Himalayan pink salt: fine and coarse edible grades, salt blocks and serving plates, lamps and décor, and bulk bags. Unrefined and mineral-rich.',
};

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { key } = await params;
  const categoryKey = shelfFromKey(key);
  const category = getCategoryContent(categoryKey);

  if (!category || !categoryKey) {
    return buildMetadata({ ...DEFAULT_PRODUCTS_SEO, path: '/products' });
  }

  // A category hub with zero purchasable products is a real page (gallery,
  // guides) but nothing to buy — noindex it so it doesn't rank for a product
  // search and disappoint the shopper who clicks through. Drop the noindex the
  // moment a matching SKU goes live.
  //
  // The count comes from the catalog seam, not from a database of its own: the
  // hub is indexed exactly when the same products the grid will render place
  // onto it, whatever source is configured.
  let hasProducts = true;
  try {
    const { products } = await getCatalogProducts();
    hasProducts = products.some((product) => productShelfKey(product) === categoryKey);
  } catch (err) {
    console.error('Could not check category product count for robots meta:', err);
  }

  return buildMetadata({
    title: category.seo.title,
    description: category.seo.description,
    path: buildProductsCategoryPath(categoryKey),
    noindex: !hasProducts,
  });
}

export default async function Page({ params }: { params: Promise<Params> }) {
  const { key } = await params;
  const categoryKey = shelfFromKey(key);
  const category = categoryKey ? getCategoryContent(categoryKey) : null;

  const breadcrumb = [
    { name: 'Home', path: '/' },
    { name: 'Products', path: '/products' },
  ];

  if (category && categoryKey) {
    breadcrumb.push({
      name: filterLabelFromKey(categoryKey),
      path: buildProductsCategoryPath(categoryKey),
    });
  }

  // The same read and the same guard the shelf-free page uses: one catalog
  // seam, one set of withheld products, one payload shape.
  let catalogProducts: Awaited<ReturnType<typeof getCatalogProducts>>['products'] | null = null;
  try {
    catalogProducts = (await getCatalogProducts()).products;
  } catch (err) {
    console.error('Could not read the catalog for /products (shelf):', err);
  }

  return (
    <>
      <JsonLd data={breadcrumbJsonLd(breadcrumb)} />
      <ProductsClient initialProducts={catalogProducts} initialCategoryKey={categoryKey} />
    </>
  );
}
