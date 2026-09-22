export { productsApi } from './products';
// addressesApi is gone: saved addresses moved to the WordPress customer identity
// (see lib/account/addresses.ts). The old module read Supabase rows by a user id
// that sign-in no longer mints, so every read returned nothing.
export { adminApi } from './admin';
// blogApi is gone: the blog is WordPress's now (see lib/blog/wordpressBlog.ts for
// the reader and lib/blog/types.ts for the shape the screens render).
// authApi is gone: Supabase was the identity provider, and the app signs customers
// in through the hk-storefront plugin and admins through WordPress application
// passwords. Nothing called the module once AuthContext moved — see
// lib/auth/sessionShape.ts for the session shape that replaced its types.
// cartApi and wishlistApi are gone, and the cart/wishlist moved with them:
// the cart is WooCommerce's (see lib/cart/cartClient.ts) and the wishlist is a
// WordPress table (see lib/wishlist/client.ts).
// crmApi is gone: the CRM lead inbox moved to WordPress (see lib/leados/crm.ts).
// notificationsApi is gone: nothing ever produced a customer notification and
// nothing read an admin one, so the whole reader was removed with the table's
// writers — see the note in lib/orders/notifyOrderEvents.ts.


// Re-export types
export type { ProductFilters } from './products';
export type {
  ProductFormData,
  CategoryFormData,
  BlogPostFormData,
  AdminProductFilters,
  AdminOrderFilters,
  AdminOrder,
  AdminBlogFilters,
  AdminDashboardAnalytics,
  AnalyticsPoint,
  ProductAnalytics,
  InventoryAlert,
} from './admin';
