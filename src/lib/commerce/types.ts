/**
 * The commerce model this application actually works in.
 *
 * ## What this replaced
 *
 * These shapes used to be derived from a generated Supabase schema — `Order` was
 * `Tables<'orders'>`, one long lookup into a `Database` interface describing
 * sixteen Postgres tables, four of which the application still reads. The
 * indirection was the problem, not the fields: a type nobody wrote by hand reads
 * as "this is our schema", so the application kept looking like a client of a
 * database it no longer has.
 *
 * They are written down here as plain interfaces instead. WooCommerce is where an
 * order comes from now — `lib/woo/orders.ts` projects one into `Order` — and this
 * module is the shape every screen and route agrees on.
 *
 * Names not defined here (`Category`, `Product`, `BlogPost`, `CrmLead`, …) are
 * deliberately gone: those tables' readers now use the WooCommerce, WordPress or
 * plugin types that own them, and keeping a parallel definition would be a second
 * answer to a settled question.
 */

/** Any JSON value, as the store's metadata fields arrive. */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

/**
 * A customer or administrator, as this application knows one.
 *
 * It is not a store record: `Profile` is what a session resolves to, whether that
 * is a WooCommerce customer or a WordPress administrator, so the console and the
 * account pages can render either without asking which backend signed in.
 */
export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  role: 'customer' | 'admin';
  created_at: string;
  updated_at: string;
}

/** Everything this application tracks about one order, from any of its sources. */
export interface Order {
  id: string;
  order_number: string;
  /**
   * The owner, when the order has one. For an order placed before the WooCommerce
   * migration this is the app's own old account id — it is kept because the
   * historical path bridges an owner by email and needs to tell an ownerless guest
   * order from a registered one. Nothing new ever writes it.
   */
  user_id: string | null;
  email: string;
  phone: string | null;
  status: 'pending' | 'confirmed' | 'processing' | 'packed' | 'shipped' | 'delivered' | 'cancelled' | 'refunded';
  payment_status: 'pending' | 'paid' | 'failed' | 'refunded';
  payment_method: string | null;
  subtotal: number;
  shipping_cost: number;
  tax_amount: number;
  discount_amount: number;
  total: number;
  currency: string;
  shipping_address: Json;
  billing_address: Json;
  notes: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  shippo_rate_id: string | null;
  shippo_transaction_id: string | null;
  shipping_carrier: string | null;
  shipping_service: string | null;
  label_url: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  created_at: string;
  updated_at: string;
}

/** One line of an order, as it was bought — name and price travel with it. */
export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  product_name: string;
  product_image: string | null;
  quantity: number;
  /** The storefront's grain-size selection, when the line had one. */
  grain_size: string | null;
  unit_price: number;
  total_price: number;
  created_at: string;
}

/** An order with its lines — what every read path returns. */
export type OrderWithItems = Order & {
  order_items: OrderItem[];
};
