export { authApi } from './auth';
export { productsApi } from './products';
export { ordersApi } from './orders';
export { blogApi } from './blog';
export { notificationsApi } from './notifications';
export { adminApi } from './admin';
export { addressesApi } from './addresses';
// cartApi and wishlistApi are gone, and the cart/wishlist moved with them:
// the cart is WooCommerce's (see lib/cart/cartClient.ts) and the wishlist is a
// WordPress table (see lib/wishlist/client.ts).
// crmApi is gone: the CRM lead inbox moved to WordPress (see lib/leados/crm.ts).


// Re-export types
export type { SignUpData, SignInData } from './auth';
export type { ProductFilters } from './products';
export type { CreateOrderData, OrderFilters } from './orders';
export type { BlogPostWithAuthor, BlogFilters } from './blog';
export type {
  ProductFormData,
  CategoryFormData,
  BlogPostFormData,
  AdminProductFilters,
  AdminOrderFilters,
  AdminOrder,
  AdminOrderAnalytics,
  AdminBlogFilters,
  AdminDashboardAnalytics,
  AnalyticsPoint,
  ProductAnalytics,
  InventoryAlert,
} from './admin';
export type { AddressFormData } from './addresses';
