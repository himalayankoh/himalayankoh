import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import ProductDetailView from '../components/ProductDetailView';
import ProductCard from '../components/ProductCard';
import type { Product } from '../data/products';
import { lookupCatalogProduct } from '../lib/backend/catalogClient';
import ProductDetailSections from '../components/product/ProductDetailSections';

interface ProductDetailPageProps {
  /**
   * Product resolved during server render. Seeding state with it puts the real
   * product name, description and price in the initial HTML instead of the
   * loading spinner a client-only fetch would leave for crawlers.
   */
  initialProduct?: Product | null;
  initialRelated?: Product[];
}

export default function ProductDetailPage({
  initialProduct = null,
  initialRelated = [],
}: ProductDetailPageProps) {
  const { slug: routeSlug } = useParams<{ slug: string }>();
  const [product, setProduct] = useState<Product | null>(initialProduct);
  const [related, setRelated] = useState<Product[]>(initialRelated);
  const [loading, setLoading] = useState(!initialProduct);

  useEffect(() => {
    if (!routeSlug) {
      setProduct(null);
      setRelated([]);
      setLoading(false);
      return;
    }

    // If server already seeded this exact product and related items, bypass
    // the client refetch so we never cause an unnecessary re-render / layout shift.
    if (initialProduct && initialProduct.slug === routeSlug) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    const load = async () => {
      // The backend owns catalog resolution, including Supabase's ordering and
      // its hidden-active-product guard; this is the only caller.
      const lookup = await lookupCatalogProduct(routeSlug);
      if (cancelled) return;

      if (lookup.error) {
        console.error('[PDP] catalog product lookup failed:', lookup.error);
      }
      if (process.env.NODE_ENV === 'development') {
        console.debug('[PDP] product resolve', {
          routeParam: routeSlug,
          matchedSlug: lookup.product?.slug ?? null,
          matchedSource: lookup.provenance,
        });
      }

      // Keep the server-rendered product if the client resolve comes back
      // empty, so a transient Supabase failure cannot blank a live page.
      if (lookup.product || !initialProduct) {
        setProduct(lookup.product);
      }
      setRelated(lookup.related);
      setLoading(false);
    };

    void load();

    return () => {
      cancelled = true;
    };
    // initialProduct is fixed per server render; the fetch keys on the slug.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeSlug]);

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center bg-warm-white">
        <Loader2 size={40} className="animate-spin text-himalayan" />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen bg-warm-white py-16">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <div className="bg-white rounded-2xl shadow-md p-12">
            <h1 className="font-serif text-3xl font-bold text-charcoal mb-3">Product Not Found</h1>
            <p className="text-charcoal-light mb-6">
              This product may have been removed or the link is incorrect.
            </p>
            {process.env.NODE_ENV === 'development' && routeSlug && (
              <p className="text-xs text-charcoal-light/80 mb-4 font-mono">
                slug param: {routeSlug}
              </p>
            )}
            <Link
              to="/products"
              className="inline-flex items-center justify-center px-6 py-3 bg-himalayan hover:bg-himalayan-dark text-white font-semibold rounded-xl transition-colors"
            >
              Browse All Products
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-warm-white py-5 md:py-8">
      {/* Product/FAQ/WebPage JSON-LD is server-rendered by app/(main)/products/[slug]/page.tsx
          — injecting a second copy here would duplicate the graph for crawlers. */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <ProductDetailView product={product} variant="page" />

        <ProductDetailSections product={product} />

        {related.length > 0 && (
          <section className="mt-8">
            <h2 className="font-serif text-xl font-bold text-charcoal mb-4">Related Products</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 lg:gap-4">
              {related.map((item, index) => (
                <ProductCard key={item.id} product={item} index={index} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
