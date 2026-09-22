import { supabase } from '../client';
import { getCustomerAccessToken } from '@/lib/auth/customerClient';
import type { Order, OrderItem, OrderWithItems, Json } from '../database.types';
import { getErrorMessage } from '@/lib/errors';

export const TAX_RATE = 0.0825;
export const FREE_SHIPPING_THRESHOLD = 50;
export const STANDARD_SHIPPING_COST = 9.95;
export const EXPEDITED_SHIPPING_COST = 18.95;

export type ShippingMethod = 'standard' | 'expedited';

export const supportedCoupons: Record<string, { label: string; percentage: number }> = {
  HKWELCOME10: { label: '10% welcome discount', percentage: 0.1 },
};

export interface OrderTotals {
  subtotal: number;
  shippingCost: number;
  discountAmount: number;
  taxAmount: number;
  total: number;
}

export interface TotalsLineItem {
  quantity: number;
  unitPrice: number;
}

export interface CalculateOrderOptions {
  couponCode?: string;
  shippingMethod?: ShippingMethod;
  /** Live Shippo rate amount — overrides flat-rate shipping when set. */
  shippingCostOverride?: number;
}

export function calculateOrderTotals(items: TotalsLineItem[], options: CalculateOrderOptions = {}): OrderTotals {
  const subtotal = items.reduce(
    (sum, item) => sum + item.unitPrice * item.quantity,
    0
  );
  const normalizedCoupon = options.couponCode?.trim().toUpperCase() || '';
  const coupon = supportedCoupons[normalizedCoupon];
  // Rounded to the cent before flowing into taxableSubtotal/total — otherwise
  // the unrounded discount (e.g. $9.95 * 10% = $0.995) makes the displayed
  // total off by a cent from subtotal - discount + tax + shipping, since each
  // of those is independently rounded for display but the total wasn't.
  const discountAmount = coupon ? Math.round(subtotal * coupon.percentage * 100) / 100 : 0;
  const taxableSubtotal = Math.max(0, subtotal - discountAmount);
  const shippingMethod = options.shippingMethod || 'standard';
  const shippingCost =
    typeof options.shippingCostOverride === 'number' && options.shippingCostOverride >= 0
      ? options.shippingCostOverride
      : shippingMethod === 'expedited'
        ? EXPEDITED_SHIPPING_COST
        : subtotal >= FREE_SHIPPING_THRESHOLD
          ? 0
          : STANDARD_SHIPPING_COST;
  const taxAmount = taxableSubtotal * TAX_RATE;
  const total = taxableSubtotal + shippingCost + taxAmount;

  return { subtotal, shippingCost, discountAmount, taxAmount, total };
}

export interface CreateOrderData {
  email: string;
  phone?: string;
  shippingAddress: {
    fullName: string;
    addressLine1: string;
    addressLine2?: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  billingAddress?: {
    fullName: string;
    addressLine1: string;
    addressLine2?: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  paymentMethod?: string;
  paymentProvider?: 'invoice' | 'stripe';
  paymentIntentId?: string;
  paymentStatus?: Order['payment_status'];
  couponCode?: string;
  shippingMethod?: ShippingMethod;
  shippingCostOverride?: number;
  shippoRateId?: string;
  shippingCarrier?: string;
  shippingService?: string;
  notes?: string;
  /** Clear cart after order insert (default true). Stripe checkout clears after payment succeeds. */
  clearCart?: boolean;
}

export interface OrderFilters {
  status?: Order['status'];
  paymentStatus?: Order['payment_status'];
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

async function createOrderViaApi(data: CreateOrderData, userId?: string): Promise<OrderWithItems> {
  // The customer's own signed session, when there is one. A guest checkout sends
  // no credential — the route is written for both.
  const token = getCustomerAccessToken();

  const response = await fetch('/api/orders/create', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },      // No cart identifier travels with this request any more: the cart is the
      // cookie the server already holds, so there is nothing here a caller could
      // point at somebody else's basket.
      body: JSON.stringify({
        ...data,
        userId,
      }),
  });

  const body = (await response.json().catch(() => ({}))) as OrderWithItems & { error?: string };
  if (!response.ok) {
    throw new Error(body.error || `Unable to place order (${response.status}).`);
  }
  return body;
}

async function getOrderByIdViaApi(orderId: string, userId?: string): Promise<OrderWithItems | null> {
  const token = getCustomerAccessToken();

  const response = await fetch('/api/orders/get', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ orderId, userId }),
  });

  if (response.status === 404) return null;

  const body = (await response.json().catch(() => ({}))) as OrderWithItems & { error?: string };
  if (!response.ok) {
    throw new Error(body.error || `Unable to load order (${response.status}).`);
  }
  return body;
}

export const ordersApi = {
  /**
   * Places an order.
   *
   * Client-side only. The previous server-side branch inserted an order and its
   * items straight into Supabase, which meant an order could exist without a
   * confirmed payment — the exact thing `/api/orders/create` refuses (it demands
   * `paymentStatus: 'paid'` from the signed Stripe webhook). No server caller
   * existed, so with the cart gone from Supabase the branch had nothing left to
   * read and is deleted rather than re-pointed at a cart it cannot see.
   */
  async createOrder(data: CreateOrderData, userId?: string): Promise<OrderWithItems> {
    if (typeof window === 'undefined') {
      throw new Error('Orders are placed from the checkout page, not from the server.');
    }
    return createOrderViaApi(data, userId);
  },

  // Get user's orders
  async getUserOrders(userId: string, filters: OrderFilters = {}): Promise<{ orders: OrderWithItems[]; count: number }> {
    let query = supabase
      .from('orders')
      .select(`
        *,
        order_items(*)
      `, { count: 'exact' })
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

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

    if (filters.limit) {
      query = query.limit(filters.limit);
    }

    if (filters.offset) {
      query = query.range(filters.offset, filters.offset + (filters.limit || 10) - 1);
    }

    const { data, error, count } = await query;

    if (error) throw error;
    return { orders: data as OrderWithItems[], count: count || 0 };
  },

  // Get single order by ID (server API — guest orders aren't directly
  // SELECT-able by the anon client; see migration 0XX + api/orders/get).
  async getOrderById(orderId: string, userId?: string): Promise<OrderWithItems | null> {
    if (typeof window !== 'undefined') {
      return getOrderByIdViaApi(orderId, userId);
    }

    let query = supabase
      .from('orders')
      .select(`
        *,
        order_items(*)
      `)
      .eq('id', orderId);

    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data, error } = await query.single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return data as OrderWithItems;
  },

  // Get order by order number
  async getOrderByNumber(orderNumber: string): Promise<OrderWithItems | null> {
    const { data, error } = await supabase
      .from('orders')
      .select(`
        *,
        order_items(*)
      `)
      .eq('order_number', orderNumber)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return data as OrderWithItems;
  },

  // Cancel order (user can only cancel pending orders)
  async cancelOrder(orderId: string, userId: string): Promise<Order> {
    const order = await this.getOrderById(orderId, userId);

    if (!order) {
      throw new Error('Order not found');
    }

    if (order.status !== 'pending') {
      throw new Error('Only pending orders can be cancelled');
    }

    const { data, error } = await supabase
      .from('orders')
      .update({ status: 'cancelled' } as never)
      .eq('id', orderId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;
    return data as Order;
  },
};
