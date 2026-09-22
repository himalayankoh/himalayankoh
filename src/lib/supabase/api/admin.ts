import { extractProductStoragePath } from '../../images/productImageStorage';
import {
  ALLOWED_PRODUCT_IMAGE_TYPES,
  MAX_PRODUCT_IMAGE_BYTES,
  MAX_PRODUCT_IMAGES,
} from '../../images/productImageConstants';
import { supabase } from '../client';
import type { Product, Category, Inventory, Order, OrderWithItems, Profile, BlogPost, ProductImage } from '../database.types';

export interface ProductFormData {
  name: string;
  slug: string;
  description?: string;
  short_description?: string;
  price: number;
  compare_at_price?: number;
  cost_price?: number;
  sku?: string;
  barcode?: string;
  weight?: number;
  weight_unit?: string;
  category_id?: string;
  images: string[];
  thumbnail?: string;
  is_active: boolean;
  is_featured: boolean;
  grain_sizes: string[];
  tags: string[];
  meta_title?: string;
  meta_description?: string;
  // Inventory
  quantity?: number;
  low_stock_threshold?: number;
  track_inventory?: boolean;
  allow_backorder?: boolean;
}

export interface CategoryFormData {
  name: string;
  slug: string;
  description?: string;
  image_url?: string;
  parent_id?: string;
  sort_order?: number;
  is_active: boolean;
}

export interface BlogPostFormData {
  title: string;
  slug: string;
  excerpt?: string;
  content?: string;
  featured_image?: string;
  author_id?: string;
  category?: string;
  tags: string[];
  is_published: boolean;
  published_at?: string;
  meta_title?: string;
  meta_description?: string;
  read_time: number;
}

export interface AdminProductFilters {
  search?: string;
  category_id?: string;
  is_active?: boolean;
  is_featured?: boolean;
  low_stock?: boolean;
  sortBy?: 'name' | 'price' | 'created_at' | 'quantity';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface AdminOrderFilters {
  search?: string;
  status?: Order['status'];
  paymentStatus?: Order['payment_status'];
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

export type AdminOrder = OrderWithItems & {
  profile: Profile | null;
};

// AdminOrderAnalytics was the shape of a Supabase aggregate over `orders`; the
// only reader of that aggregate was `getOrderAnalytics`, which is gone with the
// order writers above. Order figures now come from `statsFromWooOrders`.

export interface AdminBlogFilters {
  search?: string;
  category?: string;
  is_published?: boolean;
  page?: number;
  limit?: number;
}

export interface AnalyticsPoint {
  label: string;
  revenue: number;
  orders: number;
}

export interface ProductAnalytics {
  productName: string;
  quantity: number;
  revenue: number;
}

export interface InventoryAlert {
  productId: string;
  productName: string;
  quantity: number;
  threshold: number;
}

export interface AdminDashboardAnalytics {
  revenueSeries: AnalyticsPoint[];
  orderStatusCounts: Record<string, number>;
  topProducts: ProductAnalytics[];
  totalCustomers: number;
  newCustomers: number;
  repeatCustomers: number;
  inventoryAlerts: InventoryAlert[];
  recentActivity: {
    id: string;
    action: string;
    time: string;
    type: 'order' | 'customer' | 'inventory';
  }[];
}

export const adminApi = {
  // ==================== PRODUCTS ====================

  // Get all products with filters (admin view - includes inactive)
  async getProducts(filters: AdminProductFilters = {}): Promise<{ 
    products: (Product & { category: Category | null; inventory: Inventory | null })[];
    count: number;
    totalPages: number;
  }> {
    const page = filters.page || 1;
    const limit = filters.limit || 10;
    const offset = (page - 1) * limit;

    let query = supabase
      .from('products')
      .select(`
        *,
        category:categories(*),
        inventory(*)
      `, { count: 'exact' });

    // Apply filters
    if (filters.search) {
      query = query.or(`name.ilike.%${filters.search}%,sku.ilike.%${filters.search}%`);
    }

    if (filters.category_id) {
      query = query.eq('category_id', filters.category_id);
    }

    if (filters.is_active !== undefined) {
      query = query.eq('is_active', filters.is_active);
    }

    if (filters.is_featured !== undefined) {
      query = query.eq('is_featured', filters.is_featured);
    }

    // Sorting
    const sortBy = filters.sortBy || 'created_at';
    const sortOrder = filters.sortOrder || 'desc';
    
    if (sortBy === 'quantity') {
      // Sort by inventory quantity requires a different approach
      query = query.order('created_at', { ascending: sortOrder === 'asc' });
    } else {
      query = query.order(sortBy, { ascending: sortOrder === 'asc' });
    }

    // Pagination
    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) throw error;

    let products = (data || []) as (Product & { category: Category | null; inventory: Inventory | null })[];

    // Filter by low stock if needed
    if (filters.low_stock) {
      products = products.filter(p => {
        const inv = p.inventory;
        return inv && inv.quantity <= inv.low_stock_threshold;
      });
    }

    return {
      products,
      count: count || 0,
      totalPages: Math.ceil((count || 0) / limit),
    };
  },

  // Get single product by ID
  async getProduct(id: string): Promise<Product & { category: Category | null; inventory: Inventory | null }> {
    const { data, error } = await supabase
      .from('products')
      .select(`
        *,
        category:categories(*),
        inventory(*)
      `)
      .eq('id', id)
      .single();

    if (error) throw error;
    return data as Product & { category: Category | null; inventory: Inventory | null };
  },

  /** Merge normalized `product_images` rows with legacy `products.images` for admin editing. */
  async resolveProductImageList(
    productId: string,
    fallbackImages: string[] = [],
    fallbackThumbnail?: string | null
  ): Promise<{ images: string[]; thumbnail: string }> {
    const legacyImages = Array.isArray(fallbackImages) ? fallbackImages.filter(Boolean) : [];

    const { data, error } = await supabase
      .from('product_images')
      .select('image_url, sort_order, is_thumbnail')
      .eq('product_id', productId)
      .order('sort_order', { ascending: true });

    if (error) {
      if (error.code === '42P01') {
        return {
          images: legacyImages.slice(0, MAX_PRODUCT_IMAGES),
          thumbnail: fallbackThumbnail || legacyImages[0] || '',
        };
      }
      throw error;
    }

    const rows = (data || []) as Pick<ProductImage, 'image_url' | 'sort_order' | 'is_thumbnail'>[];
    if (rows.length === 0) {
      return {
        images: legacyImages.slice(0, MAX_PRODUCT_IMAGES),
        thumbnail: fallbackThumbnail || legacyImages[0] || '',
      };
    }

    const images = rows.map((row) => row.image_url).filter(Boolean).slice(0, MAX_PRODUCT_IMAGES);
    const thumbnailRow = rows.find((row) => row.is_thumbnail);
    return {
      images,
      thumbnail: thumbnailRow?.image_url || fallbackThumbnail || images[0] || '',
    };
  },

  // Create product
  async createProduct(data: ProductFormData): Promise<Product> {
    const { quantity, low_stock_threshold, track_inventory, allow_backorder, ...productData } = data;

    // Create product
    const { data: product, error: productError } = await supabase
      .from('products')
      .insert({
        name: productData.name,
        slug: productData.slug,
        description: productData.description || null,
        short_description: productData.short_description || null,
        price: productData.price,
        compare_at_price: productData.compare_at_price || null,
        cost_price: productData.cost_price || null,
        sku: productData.sku || null,
        barcode: productData.barcode || null,
        weight: productData.weight || null,
        weight_unit: productData.weight_unit || 'lbs',
        category_id: productData.category_id || null,
        images: productData.images || [],
        thumbnail: productData.thumbnail || productData.images?.[0] || null,
        is_active: productData.is_active,
        is_featured: productData.is_featured,
        grain_sizes: productData.grain_sizes || [],
        tags: productData.tags || [],
        meta_title: productData.meta_title || null,
        meta_description: productData.meta_description || null,
      } as never)
      .select()
      .single();

    if (productError) throw productError;

    // Create inventory record
    const { error: inventoryError } = await supabase
      .from('inventory')
      .insert({
        product_id: (product as Product).id,
        quantity: quantity || 0,
        low_stock_threshold: low_stock_threshold || 10,
        track_inventory: track_inventory !== false,
        allow_backorder: allow_backorder || false,
      } as never);

    if (inventoryError) {
      // Rollback product creation
      await supabase.from('products').delete().eq('id', (product as Product).id);
      throw inventoryError;
    }

    await this.syncProductImages(
      (product as Product).id,
      productData.images || [],
      productData.thumbnail || productData.images?.[0] || null
    );

    return product as Product;
  },

  // Update product
  async updateProduct(id: string, data: Partial<ProductFormData>): Promise<Product> {
    const { quantity, low_stock_threshold, track_inventory, allow_backorder, ...productData } = data;

    const productUpdate: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (productData.name !== undefined) productUpdate.name = productData.name;
    if (productData.slug !== undefined) productUpdate.slug = productData.slug;
    if (productData.description !== undefined) productUpdate.description = productData.description || null;
    if (productData.short_description !== undefined) productUpdate.short_description = productData.short_description || null;
    if (productData.price !== undefined) productUpdate.price = productData.price;
    if (productData.compare_at_price !== undefined) productUpdate.compare_at_price = productData.compare_at_price || null;
    if (productData.cost_price !== undefined) productUpdate.cost_price = productData.cost_price || null;
    if (productData.sku !== undefined) productUpdate.sku = productData.sku || null;
    if (productData.barcode !== undefined) productUpdate.barcode = productData.barcode || null;
    if (productData.weight !== undefined) productUpdate.weight = productData.weight || null;
    if (productData.weight_unit !== undefined) productUpdate.weight_unit = productData.weight_unit;
    if (productData.category_id !== undefined) productUpdate.category_id = productData.category_id || null;
    if (productData.images !== undefined) productUpdate.images = productData.images;
    if (productData.thumbnail !== undefined) productUpdate.thumbnail = productData.thumbnail || null;
    if (productData.is_active !== undefined) productUpdate.is_active = productData.is_active;
    if (productData.is_featured !== undefined) productUpdate.is_featured = productData.is_featured;
    if (productData.grain_sizes !== undefined) productUpdate.grain_sizes = productData.grain_sizes;
    if (productData.tags !== undefined) productUpdate.tags = productData.tags;
    if (productData.meta_title !== undefined) productUpdate.meta_title = productData.meta_title || null;
    if (productData.meta_description !== undefined) productUpdate.meta_description = productData.meta_description || null;

    const { data: product, error: productError } = await supabase
      .from('products')
      .update(productUpdate as never)
      .eq('id', id)
      .select()
      .single();

    if (productError) throw productError;

    // Update inventory if provided
    if (quantity !== undefined || low_stock_threshold !== undefined || track_inventory !== undefined || allow_backorder !== undefined) {
      const inventoryUpdate: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (quantity !== undefined) inventoryUpdate.quantity = quantity;
      if (low_stock_threshold !== undefined) inventoryUpdate.low_stock_threshold = low_stock_threshold;
      if (track_inventory !== undefined) inventoryUpdate.track_inventory = track_inventory;
      if (allow_backorder !== undefined) inventoryUpdate.allow_backorder = allow_backorder;

      await supabase
        .from('inventory')
        .update(inventoryUpdate as never)
        .eq('product_id', id);
    }

    if (productData.images !== undefined || productData.thumbnail !== undefined) {
      await this.syncProductImages(
        id,
        productData.images ?? (product as Product).images ?? [],
        productData.thumbnail ?? (product as Product).thumbnail
      );
    }

    return product as Product;
  },

  // Delete product
  async deleteProduct(id: string): Promise<{ archived: boolean }> {
    // Product IDs are deliberately retained on order items so historical
    // pricing/fulfilment records remain auditable. Archive referenced
    // products instead of attempting a delete that PostgreSQL must reject.
    const { data: orderItemsResult, error: orderError } = await supabase
      .from('order_items')
      .select('*', { count: 'exact', head: true })
      .eq('product_id', id);

    if (orderError) throw orderError;

    if ((orderItemsResult?.length ?? 0) > 0) {
      const { error: archiveError } = await supabase
        .from('products')
        .update({ is_active: false, is_featured: false, updated_at: new Date().toISOString() } as never)
        .eq('id', id);
      if (archiveError) throw archiveError;
      return { archived: true };
    }

    // Delete inventory first (cascade should handle this, but being explicit)
    await supabase.from('inventory').delete().eq('product_id', id);
    const { error: imageError } = await supabase.from('product_images').delete().eq('product_id', id);
    if (imageError && imageError.code !== '42P01') throw imageError;
    
    const { error } = await supabase.from('products').delete().eq('id', id);
    if (error) throw error;
    return { archived: false };
  },

  // Bulk update products
  async bulkUpdateProducts(ids: string[], updates: Partial<Pick<Product, 'is_active' | 'is_featured'>>): Promise<void> {
    const { error } = await supabase
      .from('products')
      .update({ ...updates, updated_at: new Date().toISOString() } as never)
      .in('id', ids);

    if (error) throw error;
  },

  // Bulk delete products
  async bulkDeleteProducts(ids: string[]): Promise<{ archivedIds: string[] }> {
    const { data: orderItemsResult, error: orderError } = await supabase
      .from('order_items')
      .select('product_id')
      .in('product_id', ids);
    if (orderError) throw orderError;

    const referencedIds = new Set<string>(
      ((orderItemsResult || []) as Array<{ product_id: string }>).map((item) => item.product_id)
    );
    const archivedIds = [...referencedIds];
    const deletableIds = ids.filter((id) => !referencedIds.has(id));

    if (archivedIds.length > 0) {
      const { error: archiveError } = await supabase
        .from('products')
        .update({ is_active: false, is_featured: false, updated_at: new Date().toISOString() } as never)
        .in('id', archivedIds);
      if (archiveError) throw archiveError;
    }

    if (deletableIds.length === 0) return { archivedIds };

    await supabase.from('inventory').delete().in('product_id', deletableIds);
    const { error: imageError } = await supabase.from('product_images').delete().in('product_id', deletableIds);
    if (imageError && imageError.code !== '42P01') throw imageError;
    const { error } = await supabase.from('products').delete().in('id', deletableIds);
    if (error) throw error;
    return { archivedIds };
  },

  // ==================== CATEGORIES ====================

  async getCategories(): Promise<Category[]> {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .order('sort_order', { ascending: true });

    if (error) throw error;
    return data as Category[];
  },

  async createCategory(data: CategoryFormData): Promise<Category> {
    const { data: category, error } = await supabase
      .from('categories')
      .insert(data as never)
      .select()
      .single();

    if (error) throw error;
    return category as Category;
  },

  async updateCategory(id: string, data: Partial<CategoryFormData>): Promise<Category> {
    const { data: category, error } = await supabase
      .from('categories')
      .update({ ...data, updated_at: new Date().toISOString() } as never)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return category as Category;
  },

  async deleteCategory(id: string): Promise<void> {
    const { error } = await supabase.from('categories').delete().eq('id', id);
    if (error) throw error;
  },

  // ==================== INVENTORY ====================

  async updateInventory(productId: string, quantity: number): Promise<void> {
    const { error } = await supabase
      .from('inventory')
      .update({ quantity, updated_at: new Date().toISOString() } as never)
      .eq('product_id', productId);

    if (error) throw error;
  },

  async getLowStockProducts(): Promise<(Product & { inventory: Inventory })[]> {
    const { data, error } = await supabase
      .from('products')
      .select(`
        *,
        inventory!inner(*)
      `)
      .eq('is_active', true);

    if (error) throw error;

    // Filter products where quantity <= low_stock_threshold
    return (data as (Product & { inventory: Inventory })[]).filter(
      p => p.inventory.quantity <= p.inventory.low_stock_threshold
    );
  },

  // ==================== IMAGE UPLOAD ====================

  async uploadProductImage(file: File, productId?: string): Promise<string> {
    if (!ALLOWED_PRODUCT_IMAGE_TYPES.includes(file.type as (typeof ALLOWED_PRODUCT_IMAGE_TYPES)[number])) {
      throw new Error('Unsupported image type. Use JPG, PNG, WebP, or GIF.');
    }

    if (file.size > MAX_PRODUCT_IMAGE_BYTES) {
      throw new Error('Image must be 5 MB or smaller.');
    }

    const extension = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    const folder = productId || 'draft';
    const filePath = `${folder}/${crypto.randomUUID()}.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from('products')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type,
      });

    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage
      .from('products')
      .getPublicUrl(filePath);

    return publicUrl;
  },

  async uploadProductImages(
    files: File[],
    productId?: string
  ): Promise<{ uploaded: string[]; errors: string[] }> {
    const uploaded: string[] = [];
    const errors: string[] = [];

    for (const file of files) {
      try {
        const url = await this.uploadProductImage(file, productId);
        uploaded.push(url);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Upload failed';
        errors.push(`${file.name}: ${message}`);
      }
    }

    return { uploaded, errors };
  },

  async deleteProductImage(imageUrl: string): Promise<void> {
    const filePath = extractProductStoragePath(imageUrl);
    if (!filePath) return;

    const { error } = await supabase.storage
      .from('products')
      .remove([filePath]);

    if (error) console.error('Failed to delete image:', error);
  },

  async syncProductImages(productId: string, images: string[], thumbnail?: string | null): Promise<void> {
    const uniqueImages = Array.from(new Set(images.filter(Boolean))).slice(0, MAX_PRODUCT_IMAGES);

    const { error: deleteError } = await supabase
      .from('product_images')
      .delete()
      .eq('product_id', productId);

    if (deleteError) {
      if (deleteError.code === '42P01') {
        console.warn('product_images table is not available yet; skipping normalized image sync.');
        return;
      }
      throw deleteError;
    }

    if (uniqueImages.length === 0) return;

    const rows = uniqueImages.map((imageUrl, index) => ({
      product_id: productId,
      image_url: imageUrl,
      sort_order: index,
      is_thumbnail: thumbnail ? imageUrl === thumbnail : index === 0,
    }));

    const { error } = await supabase.from('product_images').insert(rows as never);
    if (error) throw error;
  },

  async uploadCategoryImage(file: File, categoryId?: string): Promise<string> {
    const fileExt = file.name.split('.').pop();
    const fileName = `${categoryId || 'new'}-${Date.now()}.${fileExt}`;
    const filePath = `categories/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('categories')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage
      .from('categories')
      .getPublicUrl(filePath);

    return publicUrl;
  },

  async getProductManagementStats(): Promise<{
    total: number;
    active: number;
    inactive: number;
    featured: number;
    lowStock: number;
    outOfStock: number;
  }> {
    const { count: total } = await supabase.from('products').select('*', { count: 'exact', head: true });
    const { count: active } = await supabase.from('products').select('*', { count: 'exact', head: true }).eq('is_active', true);
    const { count: featured } = await supabase.from('products').select('*', { count: 'exact', head: true }).eq('is_featured', true);

    const lowStockProducts = await this.getLowStockProducts();
    const { data: inventoryRows } = await supabase.from('inventory').select('quantity').eq('track_inventory', true);
    const outOfStock = (inventoryRows || []).filter((row) => (row as { quantity: number }).quantity <= 0).length;

    const totalCount = total || 0;
    const activeCount = active || 0;

    return {
      total: totalCount,
      active: activeCount,
      inactive: totalCount - activeCount,
      featured: featured || 0,
      lowStock: lowStockProducts.length,
      outOfStock,
    };
  },

  async getCustomers(filters: { search?: string; page?: number; limit?: number } = {}): Promise<{
    customers: Profile[];
    count: number;
    totalPages: number;
  }> {
    const page = filters.page || 1;
    const limit = filters.limit || 12;
    const offset = (page - 1) * limit;

    let query = supabase
      .from('profiles')
      .select('*', { count: 'exact' })
      .eq('role', 'customer')
      .order('created_at', { ascending: false });

    if (filters.search) {
      query = query.or(`full_name.ilike.%${filters.search}%,email.ilike.%${filters.search}%,phone.ilike.%${filters.search}%`);
    }

    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;
    if (error) throw error;

    return {
      customers: (data || []) as Profile[],
      count: count || 0,
      totalPages: Math.ceil((count || 0) / limit),
    };
  },

  // ==================== DASHBOARD STATS ====================

  async getDashboardAnalytics(): Promise<AdminDashboardAnalytics> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [ordersResult, orderItemsResult, customersResult, newCustomersResult, lowStockProducts] = await Promise.all([
      supabase
        .from('orders')
        .select('id,order_number,total,status,created_at,user_id,email')
        .gte('created_at', thirtyDaysAgo.toISOString())
        .order('created_at', { ascending: false })
        .limit(300),
      supabase
        .from('order_items')
        .select('product_name,quantity,total_price')
        .limit(500),
      supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('role', 'customer'),
      supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('role', 'customer')
        .gte('created_at', thirtyDaysAgo.toISOString()),
      this.getLowStockProducts(),
    ]);

    if (ordersResult.error) throw ordersResult.error;
    if (orderItemsResult.error) throw orderItemsResult.error;
    if (customersResult.error) throw customersResult.error;
    if (newCustomersResult.error) throw newCustomersResult.error;

    const orders = (ordersResult.data || []) as Pick<Order, 'id' | 'order_number' | 'total' | 'status' | 'created_at' | 'user_id' | 'email'>[];
    const orderItems = (orderItemsResult.data || []) as { product_name: string; quantity: number; total_price: number }[];

    const revenueByDay = new Map<string, AnalyticsPoint>();
    for (let i = 6; i >= 0; i -= 1) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const key = date.toISOString().slice(0, 10);
      revenueByDay.set(key, {
        label: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        revenue: 0,
        orders: 0,
      });
    }

    const orderStatusCounts: Record<string, number> = {
      pending: 0,
      processing: 0,
      shipped: 0,
      delivered: 0,
      cancelled: 0,
    };
    const customerOrderCounts = new Map<string, number>();

    orders.forEach((order) => {
      const key = order.created_at.slice(0, 10);
      const point = revenueByDay.get(key);
      if (point) {
        point.revenue += order.total || 0;
        point.orders += 1;
      }

      orderStatusCounts[order.status] = (orderStatusCounts[order.status] || 0) + 1;
      const customerKey = order.user_id || order.email;
      customerOrderCounts.set(customerKey, (customerOrderCounts.get(customerKey) || 0) + 1);
    });

    const productMap = new Map<string, ProductAnalytics>();
    orderItems.forEach((item) => {
      const current = productMap.get(item.product_name) || {
        productName: item.product_name,
        quantity: 0,
        revenue: 0,
      };
      current.quantity += item.quantity;
      current.revenue += item.total_price;
      productMap.set(item.product_name, current);
    });

    const inventoryAlerts = lowStockProducts.slice(0, 5).map((product) => ({
      productId: product.id,
      productName: product.name,
      quantity: product.inventory.quantity,
      threshold: product.inventory.low_stock_threshold,
    }));

    return {
      revenueSeries: Array.from(revenueByDay.values()),
      orderStatusCounts,
      topProducts: Array.from(productMap.values())
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5),
      totalCustomers: customersResult.count || 0,
      newCustomers: newCustomersResult.count || 0,
      repeatCustomers: Array.from(customerOrderCounts.values()).filter((count) => count > 1).length,
      inventoryAlerts,
      recentActivity: [
        ...orders.slice(0, 5).map((order) => ({
          id: order.id,
          action: `Order ${order.order_number} received`,
          time: order.created_at,
          type: 'order' as const,
        })),
        ...inventoryAlerts.map((alert) => ({
          id: alert.productId,
          action: `${alert.productName} is low on stock`,
          time: new Date().toISOString(),
          type: 'inventory' as const,
        })),
      ]
        .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
        .slice(0, 6),
    };
  },

  // ==================== ORDERS ====================

  async getOrders(filters: AdminOrderFilters = {}): Promise<{
    orders: AdminOrder[];
    count: number;
    totalPages: number;
  }> {
    const page = filters.page || 1;
    const limit = filters.limit || 10;
    const offset = (page - 1) * limit;

    let query = supabase
      .from('orders')
      .select(`
        *,
        profile:profiles(*),
        order_items(*)
      `, { count: 'exact' })
      .order('created_at', { ascending: false });

    if (filters.search) {
      query = query.or(`order_number.ilike.%${filters.search}%,email.ilike.%${filters.search}%,phone.ilike.%${filters.search}%`);
    }

    if (filters.status) {
      query = query.eq('status', filters.status);
    }

    if (filters.paymentStatus) {
      query = query.eq('payment_status', filters.paymentStatus);
    }

    if (filters.startDate) {
      query = query.gte('created_at', filters.startDate);
    }

    if (filters.endDate) {
      query = query.lte('created_at', filters.endDate);
    }

    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;
    if (error) throw error;

    return {
      orders: data as AdminOrder[],
      count: count || 0,
      totalPages: Math.ceil((count || 0) / limit),
    };
  },

  async getShippingLabelOrders(): Promise<{ ready: AdminOrder[]; pending: AdminOrder[] }> {
    const { data, error } = await supabase
      .from('orders')
      .select(`
        *,
        profile:profiles(*),
        order_items(*)
      `)
      .eq('payment_status', 'paid')
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) throw error;

    const orders = (data || []) as AdminOrder[];

    return {
      ready: orders.filter((order) => Boolean(order.label_url)),
      pending: orders.filter((order) => !order.label_url),
    };
  },

  // The three order writers that lived here — `updateOrderStatus`,
  // `updateOrderPaymentStatus` and the order-status analytics aggregate — were
  // removed with the migration rather than re-pointed: an order is written through
  // `lib/woo/orders` now (the console, the webhook and the label step all use it),
  // and nothing had called these since. `getDashboardStats` went the same way.

  // ==================== BLOG POSTS ====================

  async getBlogPosts(filters: AdminBlogFilters = {}): Promise<{
    posts: BlogPost[];
    count: number;
    totalPages: number;
  }> {
    const page = filters.page || 1;
    const limit = filters.limit || 10;
    const offset = (page - 1) * limit;

    let query = supabase
      .from('blog_posts')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (filters.search) {
      query = query.or(`title.ilike.%${filters.search}%,excerpt.ilike.%${filters.search}%,content.ilike.%${filters.search}%`);
    }

    if (filters.category) {
      query = query.eq('category', filters.category);
    }

    if (filters.is_published !== undefined) {
      query = query.eq('is_published', filters.is_published);
    }

    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;
    if (error) throw error;

    return {
      posts: data as BlogPost[],
      count: count || 0,
      totalPages: Math.ceil((count || 0) / limit),
    };
  },

  async createBlogPost(data: BlogPostFormData): Promise<BlogPost> {
    const { data: post, error } = await supabase
      .from('blog_posts')
      .insert({
        title: data.title,
        slug: data.slug,
        excerpt: data.excerpt || null,
        content: data.content || null,
        featured_image: data.featured_image || null,
        author_id: data.author_id || null,
        category: data.category || null,
        tags: data.tags || [],
        is_published: data.is_published,
        published_at: data.is_published ? data.published_at || new Date().toISOString() : data.published_at || null,
        meta_title: data.meta_title || null,
        meta_description: data.meta_description || null,
        read_time: data.read_time || 5,
      } as never)
      .select()
      .single();

    if (error) throw error;
    return post as BlogPost;
  },

  async updateBlogPost(id: string, data: Partial<BlogPostFormData>): Promise<BlogPost> {
    const updates = {
      ...data,
      excerpt: data.excerpt || null,
      content: data.content || null,
      featured_image: data.featured_image || null,
      category: data.category || null,
      meta_title: data.meta_title || null,
      meta_description: data.meta_description || null,
      published_at: data.is_published && !data.published_at ? new Date().toISOString() : data.published_at,
      updated_at: new Date().toISOString(),
    };

    const { data: post, error } = await supabase
      .from('blog_posts')
      .update(updates as never)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return post as BlogPost;
  },

  async deleteBlogPost(id: string): Promise<void> {
    const { error } = await supabase
      .from('blog_posts')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },

  async uploadBlogImage(file: File, postId?: string): Promise<string> {
    const fileExt = file.name.split('.').pop();
    const fileName = `${postId || 'new'}-${Date.now()}.${fileExt}`;
    const filePath = `blog/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('blog')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage
      .from('blog')
      .getPublicUrl(filePath);

    return publicUrl;
  },
};
