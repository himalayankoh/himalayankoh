import { normalizeProductSlug, productSlugFromName, slugsMatch } from '../../products/slug';
import { isRealCatalogProduct } from '../../catalog/realProduct';
import { supabase } from '../client';
import type { Product, Category, ProductWithCategory } from '../database.types';

// The storefront-visibility rule lives in `lib/catalog/realProduct` — it is a pure
// predicate, and keeping it here meant every caller that only wanted to ask "is
// this listing real?" imported a module with a Supabase client at its top. The
// callers that only need the rule import it from there.

// Callers that resolve a product by slug fall back to the bundled demo
// catalog when Supabase has no visible row — that fallback exists so a
// Supabase outage doesn't blank the page, not so an admin's in-progress
// (active but not yet shipping-configured) product silently republishes
// itself from stale demo data under the same slug. This tells them which
// case they're in: true means a real active row exists but is intentionally
// withheld from the storefront, so no fallback should be used.
export async function isHiddenActiveProduct(slug: string): Promise<boolean> {
  const normalizedSlug = normalizeProductSlug(slug);
  if (!normalizedSlug) return false;

  const { data } = await supabase
    .from('products')
    .select('tags')
    .eq('slug', normalizedSlug)
    .eq('is_active', true)

    .maybeSingle();

  return Boolean(data) && !isRealCatalogProduct(data as unknown as { tags?: string[] | null });
}

// Explicit column list for retail-facing queries. Excludes cost_price and
// other internal fields that must never appear in a retail API response.
const RETAIL_PRODUCT_COLUMNS = `
  id, name, slug, description, short_description, price, compare_at_price,
  sku, barcode, weight, weight_unit, category_id, images, thumbnail,
  is_active, is_featured, grain_sizes, tags, meta_title, meta_description,
  created_at, updated_at,
  category:categories(*),
  inventory(*)
`;

/**
 * Per-call options for catalog reads.
 *
 * `signal` exists so server-side callers (SEO metadata, sitemap) can bound the
 * request: without it a stalled PostgREST read would hang the whole render,
 * which reads to a visitor as navigation being stuck.
 */
export interface ProductQueryOptions {
  signal?: AbortSignal;
}

export interface ProductFilters {
  categorySlug?: string;
  search?: string;
  minPrice?: number;
  maxPrice?: number;
  isFeatured?: boolean;
  tags?: string[];
  sortBy?: 'price_asc' | 'price_desc' | 'newest' | 'name';
  limit?: number;
  offset?: number;
}

export const productsApi = {
  async getProducts(
    filters: ProductFilters = {},
    options: ProductQueryOptions = {}
  ): Promise<{ products: ProductWithCategory[]; count: number }> {
    let query = supabase
      .from('products')
      .select(RETAIL_PRODUCT_COLUMNS, { count: 'exact' })
      .eq('is_active', true)
  ;

    if (filters.categorySlug) {
      const { data: category } = await supabase
        .from('categories')
        .select('id')
        .eq('slug', filters.categorySlug)
        .single();

      if (category) query = query.eq('category_id', (category as Category).id);
    }

    if (filters.search) {
      query = query.or(`name.ilike.%${filters.search}%,description.ilike.%${filters.search}%`);
    }
    if (filters.minPrice !== undefined) query = query.gte('price', filters.minPrice);
    if (filters.maxPrice !== undefined) query = query.lte('price', filters.maxPrice);
    if (filters.isFeatured !== undefined) query = query.eq('is_featured', filters.isFeatured);
    if (filters.tags && filters.tags.length > 0) query = query.overlaps('tags', filters.tags);

    switch (filters.sortBy) {
      case 'price_asc': query = query.order('price', { ascending: true }); break;
      case 'price_desc': query = query.order('price', { ascending: false }); break;
      case 'newest': query = query.order('created_at', { ascending: false }); break;
      case 'name': query = query.order('name', { ascending: true }); break;
      default: query = query.order('created_at', { ascending: false });
    }

    if (filters.limit) query = query.limit(filters.limit);
    if (filters.offset) query = query.range(filters.offset, filters.offset + (filters.limit || 10) - 1);
    if (options.signal) query = query.abortSignal(options.signal);

    const { data, error } = await query;
    if (error) throw error;

    const products = ((data || []) as ProductWithCategory[]).filter(isRealCatalogProduct);
    return { products, count: products.length };
  },

  async getProductBySlug(
    slug: string,
    options: ProductQueryOptions = {}
  ): Promise<ProductWithCategory | null> {
    const normalizedSlug = normalizeProductSlug(slug);
    if (!normalizedSlug) return null;

    let query = supabase
      .from('products')
      .select(RETAIL_PRODUCT_COLUMNS)
      .eq('slug', normalizedSlug)
      .eq('is_active', true);

    if (options.signal) query = query.abortSignal(options.signal);

    const { data, error } = await query.maybeSingle();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }

    if (data && isRealCatalogProduct(data)) return data as ProductWithCategory;

    const { products } = await this.getProducts({ limit: 100 }, options);
    return products.find((row) => slugsMatch(row.slug, normalizedSlug) || slugsMatch(productSlugFromName(row.name, row.slug), normalizedSlug)) ?? null;
  },

  async getProductById(id: string): Promise<ProductWithCategory | null> {
    const { data, error } = await supabase
      .from('products')
      .select(RETAIL_PRODUCT_COLUMNS)
      .eq('id', id)
      .eq('is_active', true)
  
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return data && isRealCatalogProduct(data) ? data as ProductWithCategory : null;
  },

  async getFeaturedProducts(limit = 6): Promise<ProductWithCategory[]> {
    const { data, error } = await supabase
      .from('products')
      .select(RETAIL_PRODUCT_COLUMNS)
      .eq('is_active', true)
      .eq('is_featured', true)
  
      .order('created_at', { ascending: false })
      .limit(limit * 4);

    if (error) throw error;
    return ((data || []) as ProductWithCategory[]).filter(isRealCatalogProduct).slice(0, limit);
  },

  async getRelatedProducts(
    productId: string,
    categoryId: string | null,
    limit = 4,
    options: ProductQueryOptions = {}
  ): Promise<ProductWithCategory[]> {
    let query = supabase
      .from('products')
      .select(RETAIL_PRODUCT_COLUMNS)
      .eq('is_active', true)
      .neq('id', productId)
      .limit(limit * 4);

    if (categoryId) query = query.eq('category_id', categoryId);
    if (options.signal) query = query.abortSignal(options.signal);

    const { data, error } = await query;
    if (error) throw error;
    return ((data || []) as ProductWithCategory[]).filter(isRealCatalogProduct).slice(0, limit);
  },

  async searchProducts(query: string, limit = 10): Promise<Product[]> {
    const { data, error } = await supabase
      .from('products')
      .select(RETAIL_PRODUCT_COLUMNS)
      .eq('is_active', true)
  
      .or(`name.ilike.%${query}%,description.ilike.%${query}%,tags.cs.{${query}}`)
      .limit(limit * 4);

    if (error) throw error;
    return ((data || []) as unknown as Product[]).filter(isRealCatalogProduct).slice(0, limit);
  },

  async getCategories(): Promise<Category[]> {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (error) throw error;
    return data;
  },

  async getCategoryBySlug(slug: string): Promise<Category | null> {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('slug', slug)
      .eq('is_active', true)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return data;
  },
};
