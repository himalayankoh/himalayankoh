import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Loader2, Package, ShoppingCart } from 'lucide-react';
import DashboardSidebar from '../components/account/DashboardSidebar';
import OrderProgressSteps from '../components/orders/OrderProgressSteps';
import OrderTrackingPanel from '../components/orders/OrderTrackingPanel';
import {
  formatCustomerOrderStatus,
  orderStatusBadgeClass,
} from '../lib/orders/status';
import { useAuthContext } from '../context/AuthContext';
import type { Json, OrderWithItems } from '../lib/commerce/databaseTypes';
import { useCart } from '../store/cartStore';

interface ShippingAddress {
  fullName?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

export default function OrderDetailPage() {
  const { orderId } = useParams();
  const { user, profile, session } = useAuthContext();
  const { addItem } = useCart();
  const [order, setOrder] = useState<OrderWithItems | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchOrder = async () => {
      const token = session?.access_token;
      if (!orderId || !user || !token) {
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(`/api/account/orders/${orderId}`, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        });
        if (response.status === 404) {
          setError('Order not found.');
          return;
        }
        if (!response.ok) {
          throw new Error(`Unable to load order (${response.status})`);
        }
        const data = await response.json();
        setOrder(data.order);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load order');
      } finally {
        setLoading(false);
      }
    };

    fetchOrder();
  }, [orderId, user, session?.access_token]);

  const handleReorder = async () => {
    if (!order) return;

    for (const item of order.order_items) {
      await addItem({
        id: item.product_id,
        name: item.product_name,
        price: item.unit_price,
        image: item.product_image || '',
        grainSize: item.grain_size || undefined,
      }, item.quantity);
    }
  };

  const shippingAddress = toShippingAddress(order?.shipping_address);

  return (
    <div className="min-h-screen bg-warm-white">
      <div className="bg-gradient-to-r from-charcoal to-charcoal-light py-12 md:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <Link to="/account?tab=orders" className="inline-flex items-center gap-2 text-white/70 hover:text-white mb-4 text-sm">
            <ArrowLeft size={16} />
            Back to Orders
          </Link>
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="font-serif text-3xl md:text-4xl font-bold text-white"
          >
            Order Details
          </motion.h1>
          <p className="text-white/70 mt-2 text-sm">Invoice, payment status, and live shipment tracking</p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 md:py-12">
        <div className="grid lg:grid-cols-4 gap-8">
          <DashboardSidebar profile={profile} user={user} />

          <div className="lg:col-span-3">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 size={40} className="animate-spin text-himalayan" />
              </div>
            ) : error || !order ? (
              <div className="bg-white rounded-2xl shadow-md p-12 text-center">
                <Package size={64} className="mx-auto mb-6 text-gray-200" />
                <h2 className="font-serif text-2xl font-bold text-charcoal mb-2">Order Not Found</h2>
                <p className="text-charcoal-light">{error || 'We could not find this order.'}</p>
              </div>
            ) : (
              <div className="space-y-6">
                <section className="bg-white rounded-2xl shadow-md p-6">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                    <div>
                      <p className="text-sm text-charcoal-light">Order Number</p>
                      <h2 className="font-serif text-2xl font-bold text-charcoal">{order.order_number}</h2>
                      <p className="text-sm text-charcoal-light mt-1">
                        Placed {new Date(order.created_at).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })}
                      </p>
                    </div>
                    <div className="flex flex-col items-start md:items-end gap-2">
                      <span className={`px-3 py-1 rounded-full text-sm font-medium ${orderStatusBadgeClass(order.status, order.payment_status)}`}>
                        {formatCustomerOrderStatus(order.status, order.payment_status)}
                      </span>
                      {order.payment_status === 'paid' && (
                        <span className="text-xs font-semibold text-green-700">Payment confirmed · ${order.total.toFixed(2)}</span>
                      )}
                    </div>
                    <button
                      onClick={handleReorder}
                      className="inline-flex items-center justify-center gap-2 px-5 py-3 bg-himalayan text-white rounded-xl font-semibold hover:bg-himalayan-dark transition-colors"
                    >
                      <ShoppingCart size={18} />
                      Reorder
                    </button>
                  </div>

                  <OrderProgressSteps status={order.status} paymentStatus={order.payment_status} />
                </section>

                <OrderTrackingPanel
                  orderNumber={order.order_number}
                  email={order.email}
                  status={order.status}
                  paymentStatus={order.payment_status}
                  carrier={order.shipping_carrier}
                  service={order.shipping_service}
                  trackingNumber={order.tracking_number}
                  trackingUrl={order.tracking_url}
                />

                <div className="grid lg:grid-cols-3 gap-6">
                  <section className="lg:col-span-2 bg-white rounded-2xl shadow-md p-6">
                    <h3 className="font-serif text-lg font-bold text-charcoal mb-4">Items</h3>
                    <div className="space-y-4">
                      {order.order_items.map((item) => (
                        <div key={item.id} className="flex gap-4">
                          <img src={item.product_image || '/images/placeholder-product.svg'} alt={item.product_name} className="w-16 h-16 rounded-lg object-cover bg-gray-100" />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-charcoal line-clamp-2">{item.product_name}</p>
                            <p className="text-sm text-charcoal-light">
                              Qty {item.quantity} x ${item.unit_price.toFixed(2)}{item.grain_size ? ` · ${item.grain_size}` : ''}
                            </p>
                          </div>
                          <p className="font-semibold text-charcoal">${item.total_price.toFixed(2)}</p>
                        </div>
                      ))}
                    </div>
                  </section>

                  <aside className="space-y-6">
                    <section className="bg-white rounded-2xl shadow-md p-6">
                      <h3 className="font-serif text-lg font-bold text-charcoal mb-4">Invoice Summary</h3>
                      <SummaryRow label="Subtotal" value={order.subtotal} />
                      <SummaryRow label="Shipping" value={order.shipping_cost} />
                      <SummaryRow label="Tax" value={order.tax_amount} />
                      <div className="flex justify-between font-bold text-lg pt-3 mt-3 border-t border-gray-100">
                        <span className="text-charcoal">Total</span>
                        <span className="text-himalayan">${order.total.toFixed(2)}</span>
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
                  </aside>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between text-sm py-1">
      <span className="text-charcoal-light">{label}</span>
      <span className="text-charcoal">${value.toFixed(2)}</span>
    </div>
  );
}

function toShippingAddress(value: Json | undefined): ShippingAddress {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as ShippingAddress;
}
