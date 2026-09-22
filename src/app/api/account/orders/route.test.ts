/**
 * Tests for customer order routes backed by WooCommerce.
 *
 * Covers:
 * - Unauthenticated request rejected (401)
 * - Own order visible for customer
 * - Other customer's order denied / inaccessible (404)
 * - Malformed order ID rejected (400)
 * - Empty orders list handling
 * - Cancel order behavior (allowed for pending, rejected for non-pending)
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { GET as getOrdersList } from './route';
import { GET as getOrderDetail } from './[id]/route';
import { POST as cancelOrder } from './[id]/cancel/route';
import * as verifyAuth from '@/lib/auth/customerRequest';
import * as wooOrders from '@/lib/woo/orders';
import type { Order, OrderItem } from '@/lib/supabase/database.types';

vi.mock('@/lib/auth/customerRequest');
vi.mock('@/lib/woo/orders');

type MockOrder = Order & { order_items: OrderItem[] };

describe('Customer WooCommerce Orders API', () => {
  const customerEmail = 'customer@example.com';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/account/orders', () => {
    it('returns 401 when request is unauthenticated', async () => {
      vi.spyOn(verifyAuth, 'verifyCustomerRequest').mockResolvedValueOnce({
        ok: false,
        status: 401,
        error: 'Sign in to your account to continue.',
      });

      const request = new Request('https://preview.himalayankoh.com/api/account/orders');
      const response = await getOrdersList(request);
      expect(response.status).toBe(401);
      const json = await response.json();
      expect(json.error).toBe('Sign in to your account to continue.');
    });

    it('returns own orders for authenticated customer', async () => {
      vi.spyOn(verifyAuth, 'verifyCustomerRequest').mockResolvedValueOnce({
        ok: true,
        customer: { id: 123, email: customerEmail, name: 'Test Customer' },
      });

      vi.spyOn(wooOrders, 'listWooOrdersForEmail').mockResolvedValueOnce({
        orders: [
          {
            id: 101,
            number: '101',
            status: 'processing',
            total: '49.95',
            billing: { email: customerEmail },
            line_items: [],
          } as unknown as wooOrders.WooOrderLike,
        ],
        total: 1,
        totalPages: 1,
        customerId: 42,
      });

      vi.spyOn(wooOrders, 'orderWithItemsFromWoo').mockImplementationOnce((order) => ({
        id: String(order.id),
        order_number: String(order.id),
        email: customerEmail,
        status: 'processing',
        total: 49.95,
        order_items: [],
      } as unknown as MockOrder));

      const request = new Request('https://preview.himalayankoh.com/api/account/orders?page=1&limit=10');
      const response = await getOrdersList(request);
      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.orders).toHaveLength(1);
      expect(json.orders[0].id).toBe('101');
      expect(json.count).toBe(1);
    });

    it('returns empty list when customer has no orders', async () => {
      vi.spyOn(verifyAuth, 'verifyCustomerRequest').mockResolvedValueOnce({
        ok: true,
        customer: { id: 456, email: customerEmail, name: 'New Customer' },
      });

      vi.spyOn(wooOrders, 'listWooOrdersForEmail').mockResolvedValueOnce({
        orders: [],
        total: 0,
        totalPages: 1,
        customerId: null,
      });

      const request = new Request('https://preview.himalayankoh.com/api/account/orders');
      const response = await getOrdersList(request);
      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.orders).toEqual([]);
      expect(json.count).toBe(0);
    });
  });

  describe('GET /api/account/orders/[id]', () => {
    it('returns 400 for malformed order ID', async () => {
      vi.spyOn(verifyAuth, 'verifyCustomerRequest').mockResolvedValueOnce({
        ok: true,
        customer: { id: 123, email: customerEmail, name: 'Test Customer' },
      });

      const request = new Request('https://preview.himalayankoh.com/api/account/orders/abc');
      const response = await getOrderDetail(request, { params: Promise.resolve({ id: 'abc' }) });
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toMatch(/valid order id/i);
    });

    it('returns 404 when trying to access another customer’s order', async () => {
      vi.spyOn(verifyAuth, 'verifyCustomerRequest').mockResolvedValueOnce({
        ok: true,
        customer: { id: 123, email: customerEmail, name: 'Test Customer' },
      });

      // getWooOrderForEmail returns null when billing email does not match
      vi.spyOn(wooOrders, 'getWooOrderForEmail').mockResolvedValueOnce(null);

      const request = new Request('https://preview.himalayankoh.com/api/account/orders/999');
      const response = await getOrderDetail(request, { params: Promise.resolve({ id: '999' }) });
      expect(response.status).toBe(404);
      const json = await response.json();
      expect(json.error).toBe('Order not found.');
    });

    it('returns own order details when authorized', async () => {
      vi.spyOn(verifyAuth, 'verifyCustomerRequest').mockResolvedValueOnce({
        ok: true,
        customer: { id: 123, email: customerEmail, name: 'Test Customer' },
      });

      vi.spyOn(wooOrders, 'getWooOrderForEmail').mockResolvedValueOnce({
        id: 101,
        number: '101',
        status: 'completed',
        total: '99.90',
        billing: { email: customerEmail },
      } as unknown as wooOrders.WooOrderLike);

      vi.spyOn(wooOrders, 'orderWithItemsFromWoo').mockReturnValueOnce({
        id: '101',
        order_number: '101',
        email: customerEmail,
        status: 'delivered',
        total: 99.90,
        order_items: [],
      } as unknown as MockOrder);

      const request = new Request('https://preview.himalayankoh.com/api/account/orders/101');
      const response = await getOrderDetail(request, { params: Promise.resolve({ id: '101' }) });
      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.order.id).toBe('101');
    });
  });

  describe('POST /api/account/orders/[id]/cancel', () => {
    it('cancels pending order for customer', async () => {
      vi.spyOn(verifyAuth, 'verifyCustomerRequest').mockResolvedValueOnce({
        ok: true,
        customer: { id: 123, email: customerEmail, name: 'Test Customer' },
      });

      vi.spyOn(wooOrders, 'getWooOrderForEmail').mockResolvedValueOnce({
        id: 102,
        status: 'pending',
        billing: { email: customerEmail },
      } as unknown as wooOrders.WooOrderLike);

      vi.spyOn(wooOrders, 'appStatusFromWoo').mockReturnValueOnce('pending');

      vi.spyOn(wooOrders, 'updateWooOrderStatus').mockResolvedValueOnce({
        id: 102,
        status: 'cancelled',
      } as unknown as wooOrders.WooOrderLike);

      vi.spyOn(wooOrders, 'orderWithItemsFromWoo').mockReturnValueOnce({
        id: '102',
        status: 'cancelled',
      } as unknown as MockOrder);

      const request = new Request('https://preview.himalayankoh.com/api/account/orders/102/cancel', {
        method: 'POST',
      });
      const response = await cancelOrder(request, { params: Promise.resolve({ id: '102' }) });
      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.ok).toBe(true);
      expect(json.order.status).toBe('cancelled');
    });

    it('rejects cancellation when order is already shipped/processing', async () => {
      vi.spyOn(verifyAuth, 'verifyCustomerRequest').mockResolvedValueOnce({
        ok: true,
        customer: { id: 123, email: customerEmail, name: 'Test Customer' },
      });

      vi.spyOn(wooOrders, 'getWooOrderForEmail').mockResolvedValueOnce({
        id: 102,
        status: 'processing',
        billing: { email: customerEmail },
      } as unknown as wooOrders.WooOrderLike);

      vi.spyOn(wooOrders, 'appStatusFromWoo').mockReturnValueOnce('shipped');

      const request = new Request('https://preview.himalayankoh.com/api/account/orders/102/cancel', {
        method: 'POST',
      });
      const response = await cancelOrder(request, { params: Promise.resolve({ id: '102' }) });
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toMatch(/only pending orders can be cancelled/i);
    });

    it('returns 404 when trying to cancel an order belonging to another customer', async () => {
      vi.spyOn(verifyAuth, 'verifyCustomerRequest').mockResolvedValueOnce({
        ok: true,
        customer: { id: 123, email: customerEmail, name: 'Test Customer' },
      });

      vi.spyOn(wooOrders, 'getWooOrderForEmail').mockResolvedValueOnce(null);

      const request = new Request('https://preview.himalayankoh.com/api/account/orders/999/cancel', {
        method: 'POST',
      });
      const response = await cancelOrder(request, { params: Promise.resolve({ id: '999' }) });
      expect(response.status).toBe(404);
    });
  });
});
