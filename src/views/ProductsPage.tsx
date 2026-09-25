import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Search } from 'lucide-react';
import { SkeletonProductGrid } from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';
import type { Product } from '../data/products';
import ProductCard from '../components/ProductCard';
import ProductModal from '../components/ProductModal';
import CategoryEducationPanel from '../components/category/CategoryEducationPanel';
import CategoryFilterNav from '../components/category/CategoryFilterNav';
import CategoryHubLayout from '../components/category/CategoryHubLayout';
import CategoryShopPanel from '../components/category/CategoryShopPanel';
import { productMatchesCategoryFilter } from '../lib/categoryContent';
import { getCatalogProducts } from '../lib/backend/catalogClient';
import { useCategoryBlogArticles } from '../hooks/useCategoryBlogArticles';
import { useCategoryHubContent } from '../hooks/useCategoryHubContent';
import { useProductsCategoryFilter } from '../hooks/useProductsCategoryFilter';

/**
 * The catalogue the server already read for this request, when there is one.
 *
 * Passing it in removes the browser's own catalogue read on first paint: the grid
 * renders the products the page was rendered with, and only a later invalidation
 * (a realtime change) asks the backend again. That read then goes through the
 * shared cache in `lib/backend/catalogClient.ts` rather than issuing a fresh
 * full-catalogue request per mount.
 */
export interface ProductsPageProps {
  initialProducts?: Product[] | null;
  initialCategoryKey?: string | null;
}

export default function ProductsPage({
  initialProducts,
  initialCategoryKey,
}: ProductsPageProps = {}) {
  const { activeFilter, categoryKey } = useProductsCategoryFilter(initialCategoryKey);
  const [searchQuery, setSearchQuery] = useState('');
  const [quickViewProduct, setQuickViewProduct] = useState<Product | null>(null);
  // No bundled catalogue as the initial value: the store's read is the only
  // source, and the server already sent this request's products when it has them.
  const [products, setProducts] = useState<Product[]>(initialProducts ?? []);
  // A server-rendered list is already on screen; anything else is loading until
  // the catalog read answers. There is no credential to consult: the read goes
  // through the backend on every source.
  const [loading, setLoading] = useState(!initialProducts);
  const prevCategoryKey = useRef<string | null>(null);
  const fetchSeq = useRef(0);
  const serverCatalogRef = useRef(Boolean(initialProducts));

  const { content: categoryContent } = useCategoryHubContent(categoryKey);

  const isCategoryHub = Boolean(categoryKey && categoryContent);

  const placeholderArticles = useMemo(
    () => categoryContent?.articles ?? [],
    [categoryContent]
  );

  const { articles: categoryArticles, loading: articlesLoading, source: articlesSource } =
    useCategoryBlogArticles(categoryKey, placeholderArticles);

  useEffect(() => {
    if (prevCategoryKey.current !== null && prevCategoryKey.current !== categoryKey) {
      window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
    }
    prevCategoryKey.current = categoryKey;
  }, [categoryKey]);

  useEffect(() => {
    const fetchProducts = async () => {
      // Guard against out-of-order responses: only the latest request may
      // commit state. Prevents an older/slower fetch from overwriting a newer
      // one and causing the list to flip between results.
      const seq = ++fetchSeq.current;

      try {
        const { products: catalogProducts } = await getCatalogProducts();
        if (seq !== fetchSeq.current) return;
        setProducts(catalogProducts);
      } catch (err) {
        console.error('Failed to fetch products:', err);
        if (seq !== fetchSeq.current) return;
        // A failed refetch leaves the products already on screen alone. There is
        // no bundled catalogue to fall back to: an empty or failed read from the
        // store is a genuine answer, and substituting someone else's inventory
        // for it would advertise products this store cannot sell.
      } finally {
        if (seq === fetchSeq.current) setLoading(false);
      }
    };

    // The server already sent this request's catalogue, so there is nothing to
    // fetch on mount.
    if (!serverCatalogRef.current) {
      fetchProducts();
    }

    // No realtime channel: the catalog is read from the store through the backend
    // on demand, so a changed price arrives on the next read rather than as a
    // database row event. The Supabase subscription that used to live here only
    // ever fired for the source that no longer serves this page.
  }, []);

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchesCategory = productMatchesCategoryFilter(p, categoryKey, activeFilter);
      const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [activeFilter, categoryKey, searchQuery, products]);

  const productList = (
    <>
      {loading ? (
        <SkeletonProductGrid count={isCategoryHub ? 3 : 6} />
      ) : filteredProducts.length === 0 ? (
        <EmptyState
          icon={<Search size={40} />}
          title="No products match this filter"
          description="Try another category or clear your search."
          size="compact"
          className="border border-dashed border-gray-200 shadow-none"
        />
      ) : (
        <div
          className={
            isCategoryHub
              ? 'grid grid-cols-1 gap-4'
              : 'grid grid-cols-1 min-[360px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-5'
          }
        >
          {filteredProducts.map((product, i) => (
            <ProductCard
              key={product.id}
              product={product}
              index={i}
              onQuickView={setQuickViewProduct}
              shopHighlight={isCategoryHub}
            />
          ))}
        </div>
      )}
    </>
  );

  const shopColumn = isCategoryHub && categoryContent ? (
    <CategoryShopPanel
      categoryLabel={activeFilter}
      productCount={filteredProducts.length}
    >
      {productList}
    </CategoryShopPanel>
  ) : (
    productList
  );

  return (
    <div className="min-h-screen bg-warm-white">
      <div
        className={
          isCategoryHub
            ? 'bg-charcoal py-10 md:py-12 border-b border-white/10'
            : 'bg-cream py-8 md:py-10 border-b border-himalayan-line'
        }
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 text-center">
          {isCategoryHub && categoryContent ? (
            <>
              <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-himalayan mb-2">
                {categoryContent.hero.eyebrow}
              </p>
              <h1 className="font-serif text-2xl sm:text-3xl md:text-4xl font-bold text-white">
                {categoryContent.hero.title}
              </h1>
            </>
          ) : (
            <>
              <span className="inline-block px-4 py-1.5 bg-himalayan/20 text-himalayan text-sm font-semibold tracking-wider uppercase rounded-full mb-5">
                Shop Now
              </span>
              <h1 className="font-serif text-3xl sm:text-4xl font-bold text-charcoal mb-3 leading-tight">
                Premium Salt Products
              </h1>
              <p className="text-charcoal-light text-base max-w-2xl mx-auto leading-relaxed">
                Handpicked from the heart of the Himalayas — pure, natural, and mineral-rich
              </p>
            </>
          )}
        </div>
      </div>

      <div
        className={`mx-auto px-4 sm:px-6 py-10 md:py-12 ${
          isCategoryHub ? 'max-w-[100rem]' : 'max-w-7xl'
        }`}
      >
        <div className="mb-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <CategoryFilterNav activeFilter={activeFilter} products={products} />
            <div className="relative w-full md:w-72">
              <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="search"
                aria-label="Search the catalogue"
                placeholder="Search products..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-11 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-himalayan/30 focus:border-himalayan transition-all"
              />
            </div>
          </div>
        </div>

        {isCategoryHub && categoryContent ? (
          <CategoryHubLayout
            categoryKey={categoryKey}
            products={shopColumn}
            education={
              <AnimatePresence mode="wait">
                <CategoryEducationPanel
                  content={categoryContent}
                  articles={categoryArticles}
                  articlesLoading={articlesLoading}
                  articlesSource={articlesSource}
                />
              </AnimatePresence>
            }
          />
        ) : (
          productList
        )}
      </div>

      {quickViewProduct && (
        <ProductModal
          product={quickViewProduct}
          onClose={() => setQuickViewProduct(null)}
        />
      )}
    </div>
  );
}
