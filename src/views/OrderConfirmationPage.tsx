import { useEffect, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CheckCircle, Loader2, Package } from 'lucide-react';
import OrderTrackingPanel from '../components/orders/OrderTrackingPanel';
import OrderProgressSteps from '../components/orders/OrderProgressSteps';
import { useAuthContext } from '../context/AuthContext';
import { getErrorMessage } from '../lib/errors';
import {
  formatCustomerOrderStatus,
  orderStatusBadgeClass,
} from '../lib/orders/status';
import { trackOrderPageUrl } from '../lib/orders/tracking';
import { ordersApi } from '../lib/orders/client';
import type { Json, OrderWithItems } from '../lib/supabase/database.types';

interface LocationState {
  order?: OrderWithItems;
}

interface ShippingAddress {
  fullName?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

export default function OrderConfirmationPage() {
  const { state } = useLocation();
  const [searchParams] = useSearchParams();
  const { user } = useAuthContext();
  const orderId = searchParams.get('orderId');
  const stateOrder = (state as LocationState | null)?.order;

  const [order, setOrder] = useState<OrderWithItems | null>(stateOrder ?? null);
  const [loading, setLoading] = useState(Boolean(orderId && !stateOrder));
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (stateOrder) {
      setOrder(stateOrder);
      setLoading(false);
    }
  }, [stateOrder]);

  useEffect(() => {
    if (!orderId) return;

    let cancelled = false;
    setLoading(true);
    setLoadError(null);

    void ordersApi
      .getOrderById(orderId)
      .then((fetched) => {
        if (cancelled) return;
        if (fetched) {
          setOrder(fetched);
        } else if (!stateOrder) {
          setLoadError('We could not find this order. Check your email for confirmation.');
        }
      })
      .catch((err) => {
        if (!cancelled && !stateOrder) {
          setLoadError(getErrorMessage(err, 'Unable to load order confirmation.'));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [orderId, user?.id, stateOrder]);

  const shippingAddress = toShippingAddress(order?.shipping_address);

  if (loading) {
    return (
      <div className="min-h-screen bg-warm-white flex items-center justify-center px-4">
        <div className="text-center">
          <Loader2 size={40} className="animate-spin text-himalayan mx-auto mb-4" />
          <p className="text-charcoal-light text-sm">Loading your order confirmation…</p>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-warm-white py-16">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <div className="bg-white rounded-2xl shadow-md p-12">
            <Package size={64} className="mx-auto mb-6 text-gray-200" />
            <h1 className="font-serif text-3xl font-bold text-charcoal mb-3">Order confirmation unavailable</h1>
            <p className="text-charcoal-light mb-6">
              {loadError || 'We could not find an order in this checkout session.'}
            </p>
            <Link to="/products" className="inline-flex items-center justify-center px-6 py-3 bg-himalayan hover:bg-himalayan-dark text-white font-semibold rounded-xl transition-colors">
              Continue Shopping
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-warm-white">
      <div className="bg-gradient-to-r from-charcoal to-charcoal-light py-12 md:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 text-center">
          <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
            <CheckCircle size={64} className="mx-auto mb-4 text-himalayan" />
          </motion.div>
          <h1 className="font-serif text-3xl md:text-4xl font-bold text-white">Order Confirmed</h1>
          <p className="text-white/70 mt-2">Thank you. Your order has been received.</p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 md:py-12">
        {order.payment_status === 'pending' && order.payment_method === 'invoice' && (
          <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-950">
            <p className="font-semibold">Invoice order — awaiting payment</p>
            <p className="mt-1 text-amber-900/90">
              Your order is saved as <strong>pending</strong> until payment is confirmed. Himalayan Koh will contact you at{' '}
              <strong>{order.email}</strong> to complete payment, then move the order to processing and shipping.
            </p>
          </div>
        )}
        {order.payment_status === 'paid' && (
          <div className="mb-6 rounded-xl border border-green-200 bg-green-50 px-5 py-4 text-sm text-green-950">
            <p className="font-semibold">Payment received — thank you!</p>
            <p className="mt-1">Your card payment was successful. We will process and ship your order soon.</p>
          </div>
        )}
        <div className="grid lg:grid-cols-3 gap-8">
          <section className="lg:col-span-2 bg-white rounded-2xl shadow-md p-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-5 border-b border-gray-100">
              <div>
                <p className="text-sm text-charcoal-light">Order Number</p>
                <h2 className="font-serif text-2xl font-bold text-charcoal">{order.order_number}</h2>
              </div>
              <span className={`self-start md:self-center px-3 py-1 rounded-full text-sm font-medium ${orderStatusBadgeClass(order.status, order.payment_status)}`}>
                {formatCustomerOrderStatus(order.status, order.payment_status)}
              </span>
            </div>

            <div className="py-5 border-b border-gray-100">
              <h3 className="font-semibold text-charcoal mb-3">Order progress</h3>
              <OrderProgressSteps status={order.status} paymentStatus={order.payment_status} />
            </div>

            <div className="pt-5">
              <h3 className="font-semibold text-charcoal mb-4">Items</h3>
              <div className="space-y-4">
                {order.order_items.map((item) => (
                  <div key={item.id} className="flex gap-4">
                    <img src={item.product_image || '/images/placeholder-product.svg'} alt={item.product_name} className="w-16 h-16 rounded-lg object-cover bg-gray-100" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-charcoal line-clamp-2">{item.product_name}</p>
                      <p className="text-sm text-charcoal-light">
                        Qty {item.quantity} × ${item.unit_price.toFixed(2)}{item.grain_size ? ` · ${item.grain_size}` : ''}
                      </p>
                    </div>
                    <p className="font-semibold text-charcoal">${item.total_price.toFixed(2)}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <aside className="lg:col-span-1 space-y-6">
            <OrderTrackingPanel
              orderNumber={order.order_number}
              email={order.email}
              status={order.status}
              paymentStatus={order.payment_status}
              carrier={order.shipping_carrier}
              service={order.shipping_service}
              trackingNumber={order.tracking_number}
              trackingUrl={order.tracking_url}
              compact
            />
            <p className="text-xs text-charcoal-light text-center">
              <Link to={trackOrderPageUrl(order.order_number, order.email)} className="text-himalayan font-semibold hover:underline">
                Open full tracking page
              </Link>
            </p>

            <section className="bg-white rounded-2xl shadow-md p-6">
              <h3 className="font-serif text-lg font-bold text-charcoal mb-4">Invoice Summary</h3>
              <div className="space-y-2">
                <SummaryRow label="Subtotal" value={order.subtotal} />
                {order.discount_amount > 0 && <SummaryRow label="Discount" value={-order.discount_amount} />}
                <SummaryRow label="Shipping" value={order.shipping_cost} />
                <SummaryRow label="Tax" value={order.tax_amount} />
                <div className="flex justify-between font-bold text-lg pt-3 border-t border-gray-100">
                  <span className="text-charcoal">Total</span>
                  <span className="text-himalayan">${order.total.toFixed(2)}</span>
                </div>
              </div>
            </section>

            <section className="bg-white rounded-2xl shadow-md p-6">
              <h3 className="font-serif text-lg font-bold text-charcoal mb-4">Payment Status</h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-charcoal-light">Method</span>
                  <span className="font-medium text-charcoal capitalize">
                    {order.payment_method === 'stripe_card' ? 'Credit / debit card' : order.payment_method || 'invoice'}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-charcoal-light">Status</span>
                  <span className="px-3 py-1 rounded-full bg-yellow-100 text-yellow-700 text-sm font-medium capitalize">
                    {order.payment_status}
                  </span>
                </div>
              </div>
            </section>

            <section className="bg-white rounded-2xl shadow-md p-6">
              <h3 className="font-serif text-lg font-bold text-charcoal mb-4">Shipping Address</h3>
              <div className="text-sm text-charcoal-light leading-6">
                <p className="font-medium text-charcoal">{shippingAddress.fullName}</p>
                <p>{shippingAddress.addressLine1}</p>
                {shippingAddress.addressLine2 && <p>{shippingAddress.addressLine2}</p>}
                <p>{[shippingAddress.city, shippingAddress.state, shippingAddress.postalCode].filter(Boolean).join(', ')}</p>
                <p>{shippingAddress.country}</p>
              </div>
            </section>

            <div className="flex flex-col gap-3">
              {user && (
                <Link to="/account?tab=orders" className="w-full flex items-center justify-center px-6 py-3 bg-charcoal hover:bg-charcoal-light text-white font-semibold rounded-xl transition-colors">
                  View in My Purchases
                </Link>
              )}
              <Link to="/products" className="w-full flex items-center justify-center px-6 py-3 bg-himalayan hover:bg-himalayan-dark text-white font-semibold rounded-xl transition-colors">
                Continue Shopping
              </Link>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-charcoal-light">{label}</span>
      <span className={value < 0 ? 'text-green-700' : 'text-charcoal'}>
        {value < 0 ? '-' : ''}${Math.abs(value).toFixed(2)}
      </span>
    </div>
  );
}

function toShippingAddress(value: Json | undefined): ShippingAddress {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as ShippingAddress;
}
