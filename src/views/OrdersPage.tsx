import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  formatCustomerOrderStatus,
  formatCustomerStatusDetail,
  orderStatusBadgeClass,
} from '../lib/orders/status';
import { trackOrderPageUrl } from '../lib/orders/tracking';
import { Package, ChevronRight, Truck, Check, Clock, XCircle, ShoppingCart } from 'lucide-react';
import { SkeletonOrderList } from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';
import DashboardSidebar from '../components/account/DashboardSidebar';
import { useAuthContext } from '../context/AuthContext';
import type { OrderWithItems } from '../lib/commerce/types';
import { useCart } from '../store/cartStore';
import { useToast } from '../context/ToastContext';

const statusIcons: Record<string, React.ReactNode> = {
  pending: <Clock size={16} />,
  confirmed: <Check size={16} />,
  processing: <Package size={16} />,
  shipped: <Truck size={16} />,
  delivered: <Check size={16} />,
  cancelled: <XCircle size={16} />,
};

export default function OrdersPage() {
  const { user, profile, session } = useAuthContext();
  const { addItem } = useCart();
  const toast = useToast();
  const [orders, setOrders] = useState<OrderWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<OrderWithItems | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  useEffect(() => {
    const fetchOrders = async () => {
      const token = session?.access_token;
      if (!user || !token) {
        setLoading(false);
        return;
      }

      try {
        const response = await fetch('/api/account/orders', {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        });
        if (!response.ok) {
          throw new Error(`Unable to read orders (${response.status})`);
        }
        const data = await response.json();
        setOrders(data.orders || []);
      } catch (err) {
        console.error('Failed to fetch orders:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchOrders();
  }, [user, session?.access_token]);

  const handleReorder = async (order: OrderWithItems) => {
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

  const handleCancelOrder = async (order: OrderWithItems) => {
    const token = session?.access_token;
    if (!token) return;
    if (!window.confirm(`Cancel order ${order.order_number}? This cannot be undone.`)) return;

    setCancellingId(order.id);
    try {
      const response = await fetch(`/api/account/orders/${order.id}/cancel`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || `Unable to cancel order (${response.status})`);
      }
      setOrders((current) =>
        current.map((o) => (o.id === order.id ? { ...o, status: 'cancelled' } : o))
      );
      setSelectedOrder((current) =>
        current?.id === order.id ? { ...current, status: 'cancelled' } : current
      );
      toast.success('Order cancelled.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to cancel order.');
    } finally {
      setCancellingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-warm-white">
      {/* Header */}
      <div className="bg-gradient-to-r from-charcoal to-charcoal-light py-12 md:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="font-serif text-3xl md:text-4xl font-bold text-white"
          >
            My Purchases
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-white/70 mt-2"
          >
            View your orders, invoices, payment status, and shipment tracking
          </motion.p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 md:py-12">
        <div className="grid lg:grid-cols-4 gap-8">
          <DashboardSidebar profile={profile} user={user} />
          <div className="lg:col-span-3">
        {loading ? (
          <SkeletonOrderList count={3} />
        ) : orders.length === 0 ? (
          <EmptyState
            icon={<Package size={48} />}
            title="No Orders Yet"
            description="You haven't placed any orders yet. Start shopping to see your orders here."
            action={{ label: 'Browse Products', href: '/products' }}
          />
        ) : (
          <div className="grid lg:grid-cols-3 gap-8">
            {/* Orders List */}
            <div className="lg:col-span-2 space-y-4">
              {orders.map((order, i) => (
                <motion.div
                  key={order.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  onClick={() => setSelectedOrder(order)}
                  className={`bg-white rounded-2xl shadow-md p-6 cursor-pointer hover:shadow-lg transition-shadow ${
                    selectedOrder?.id === order.id ? 'ring-2 ring-himalayan' : ''
                  }`}
                >
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <p className="font-semibold text-charcoal">{order.order_number}</p>
                      <p className="text-sm text-charcoal-light">
                        {new Date(order.created_at).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      <span
                        className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${
                          orderStatusBadgeClass(order.status, order.payment_status)
                        }`}
                      >
                        {statusIcons[order.status] || statusIcons.processing}
                        {formatCustomerOrderStatus(order.status, order.payment_status)}
                      </span>
                      {order.payment_status === 'paid' && (
                        <span className="text-xs font-semibold text-green-700">Payment confirmed</span>
                      )}
                    </div>
                  </div>

                  <p className="text-sm text-charcoal-light mb-4">
                    {formatCustomerStatusDetail(
                      order.status,
                      order.payment_status,
                      Boolean(order.tracking_number),
                    )}
                  </p>

                  <div className="flex items-center gap-4">
                    <div className="flex -space-x-3">
                      {order.order_items.slice(0, 3).map((item, j) => (
                        <img
                          key={j}
                          src={item.product_image || '/images/placeholder-product.svg'}
                          alt={item.product_name}
                          className="w-12 h-12 rounded-lg border-2 border-white object-cover"
                        />
                      ))}
                      {order.order_items.length > 3 && (
                        <div className="w-12 h-12 rounded-lg border-2 border-white bg-gray-100 flex items-center justify-center text-xs font-semibold text-charcoal">
                          +{order.order_items.length - 3}
                        </div>
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-charcoal-light">
                        {order.order_items.length} item{order.order_items.length > 1 ? 's' : ''}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-charcoal">${order.total.toFixed(2)}</p>
                      <ChevronRight size={18} className="text-gray-300 ml-auto" />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-gray-100">
                    <Link
                      to={`/orders/${order.id}`}
                      className="px-4 py-2 bg-himalayan text-white rounded-lg text-sm font-semibold hover:bg-himalayan-dark transition-colors"
                    >
                      View Details
                    </Link>
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        handleReorder(order);
                      }}
                      className="inline-flex items-center gap-2 px-4 py-2 border border-gray-200 text-charcoal rounded-lg text-sm font-semibold hover:bg-gray-50 transition-colors"
                    >
                      <ShoppingCart size={14} />
                      Reorder
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Order Details */}
            <div className="lg:col-span-1">
              {selectedOrder ? (
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="bg-white rounded-2xl shadow-md p-6 sticky top-[var(--header-height)]"
                >
                  <h3 className="font-serif text-lg font-bold text-charcoal mb-4">
                    Order Details
                  </h3>

                  <div className="space-y-3 mb-6">
                    <div className="flex justify-between text-sm">
                      <span className="text-charcoal-light">Order Number</span>
                      <span className="font-medium text-charcoal">{selectedOrder.order_number}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-charcoal-light">Date</span>
                      <span className="font-medium text-charcoal">
                        {new Date(selectedOrder.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-charcoal-light">Status</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${orderStatusBadgeClass(selectedOrder.status, selectedOrder.payment_status)}`}>
                        {formatCustomerOrderStatus(selectedOrder.status, selectedOrder.payment_status)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-charcoal-light">Payment</span>
                      <span className="font-medium text-charcoal capitalize">{selectedOrder.payment_status}</span>
                    </div>
                    {selectedOrder.tracking_number && (
                      <div className="flex flex-col gap-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-charcoal-light">Tracking</span>
                          <span className="font-medium text-charcoal">{selectedOrder.tracking_number}</span>
                        </div>
                        <Link
                          to={trackOrderPageUrl(selectedOrder.order_number, selectedOrder.email)}
                          className="inline-flex items-center justify-center px-3 py-2 bg-himalayan text-white rounded-lg text-xs font-semibold hover:bg-himalayan-dark transition-colors"
                        >
                          Track package
                        </Link>
                      </div>
                    )}
                    {!selectedOrder.tracking_number && (
                      <Link
                        to={trackOrderPageUrl(selectedOrder.order_number, selectedOrder.email)}
                        className="inline-flex items-center justify-center px-3 py-2 border border-himalayan text-himalayan rounded-lg text-xs font-semibold hover:bg-himalayan/5 transition-colors"
                      >
                        Order status
                      </Link>
                    )}
                  </div>

                  <div className="border-t border-gray-100 pt-4 mb-4">
                    <h4 className="font-semibold text-charcoal mb-3">Items</h4>
                    <div className="space-y-3">
                      {selectedOrder.order_items.map((item) => (
                        <div key={item.id} className="flex items-center gap-3">
                          <img
                            src={item.product_image || '/images/placeholder-product.svg'}
                            alt={item.product_name}
                            className="w-12 h-12 rounded-lg object-cover"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-charcoal truncate">
                              {item.product_name}
                            </p>
                            <p className="text-xs text-charcoal-light">
                              Qty: {item.quantity} × ${item.unit_price.toFixed(2)}
                            </p>
                          </div>
                          <p className="text-sm font-semibold text-charcoal">
                            ${item.total_price.toFixed(2)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="border-t border-gray-100 pt-4 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-charcoal-light">Subtotal</span>
                      <span className="text-charcoal">${selectedOrder.subtotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-charcoal-light">Shipping</span>
                      <span className="text-charcoal">${selectedOrder.shipping_cost.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-charcoal-light">Tax</span>
                      <span className="text-charcoal">${selectedOrder.tax_amount.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-lg pt-2 border-t border-gray-100">
                      <span className="text-charcoal">Total</span>
                      <span className="text-himalayan">${selectedOrder.total.toFixed(2)}</span>
                    </div>
                  </div>

                  {selectedOrder.status === 'pending' && (
                    <button
                      onClick={() => handleCancelOrder(selectedOrder)}
                      disabled={cancellingId === selectedOrder.id}
                      className="w-full mt-6 px-4 py-3 border-2 border-red-200 text-red-600 rounded-xl hover:bg-red-50 transition-colors font-medium disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {cancellingId === selectedOrder.id ? 'Cancelling…' : 'Cancel Order'}
                    </button>
                  )}
                  <button
                    onClick={() => handleReorder(selectedOrder)}
                    className="w-full mt-3 px-4 py-3 bg-himalayan text-white rounded-xl hover:bg-himalayan-dark transition-colors font-medium"
                  >
                    Reorder Items
                  </button>
                </motion.div>
              ) : (
                <div className="bg-white rounded-2xl shadow-md p-6 text-center">
                  <Package size={48} className="mx-auto mb-4 text-gray-200" />
                  <p className="text-charcoal-light">Select an order to view details</p>
                </div>
              )}
            </div>
          </div>
        )}
          </div>
        </div>
      </div>
    </div>
  );
}
