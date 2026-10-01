import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Loader2, Search } from 'lucide-react';
import OrderTrackingPanel from '../components/orders/OrderTrackingPanel';
import { getErrorMessage } from '../lib/errors';

interface TrackResponse {
  order: {
    orderNumber: string;
    status: string;
    paymentStatus: string;
    paymentMethod: string | null;
    total: number;
    carrier: string | null;
    service: string | null;
    trackingNumber: string | null;
    trackingUrl: string | null;
  };
  tracking: {
    status: string;
    statusDetails: string;
    events: {
      status: string;
      statusDetails: string;
      statusDate: string | null;
      location: string | null;
    }[];
  } | null;
}

export default function TrackOrderPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [orderNumber, setOrderNumber] = useState(searchParams.get('order') || '');
  const [email, setEmail] = useState(searchParams.get('email') || '');
  const [result, setResult] = useState<TrackResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lookup = useCallback(async (nextOrder: string, nextEmail: string) => {
    if (!nextOrder.trim() || !nextEmail.trim()) return;

    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/orders/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderNumber: nextOrder.trim(),
          email: nextEmail.trim(),
        }),
      });
      const body = (await response.json()) as TrackResponse & { error?: string };
      if (!response.ok) {
        throw new Error(body.error || 'Unable to find order.');
      }
      setResult(body);
    } catch (err) {
      setResult(null);
      setError(getErrorMessage(err, 'Unable to load tracking.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const order = searchParams.get('order');
    const mail = searchParams.get('email');
    if (order && mail) {
      setOrderNumber(order);
      setEmail(mail);
      void lookup(order, mail);
    }
  }, [searchParams, lookup]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setSearchParams({
      order: orderNumber.trim(),
      email: email.trim(),
    });
    void lookup(orderNumber, email);
  };

  return (
    <div className="min-h-screen bg-warm-white">
      <div className="bg-gradient-to-r from-charcoal to-charcoal-light py-10 md:py-14">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <motion.span
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-block px-3 py-1 bg-himalayan/20 text-himalayan text-xs font-semibold tracking-wider uppercase rounded-full mb-3"
          >
            Order Tracking
          </motion.span>
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="font-serif text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-3 leading-tight"
          >
            Track Your Order
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-white/75 text-base md:text-lg max-w-xl mx-auto leading-relaxed"
          >
            Enter your order number and email for live shipment updates.
          </motion.p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 md:py-12 space-y-6">
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-md p-6 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-charcoal mb-1.5">Order number</label>
            <input
              value={orderNumber}
              onChange={(event) => setOrderNumber(event.target.value)}
              placeholder="HK-20260529-4996"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-himalayan/30 focus:border-himalayan transition-all"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-charcoal mb-1.5">Email used at checkout</label>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-himalayan/30 focus:border-himalayan transition-all"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-3.5 bg-himalayan hover:bg-himalayan-dark disabled:bg-gray-300 text-white font-semibold rounded-xl transition-colors"
          >
            {loading ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}
            {loading ? 'Looking up…' : 'Track order'}
          </button>
        </form>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        {result && (
          <OrderTrackingPanel
            orderNumber={result.order.orderNumber}
            email={email}
            status={result.order.status}
            paymentStatus={result.order.paymentStatus}
            carrier={result.order.carrier}
            service={result.order.service}
            trackingNumber={result.order.trackingNumber}
            trackingUrl={result.order.trackingUrl}
            liveStatus={result.tracking?.status}
            liveStatusDetails={result.tracking?.statusDetails}
            events={result.tracking?.events}
            onRefresh={() => void lookup(orderNumber, email)}
            refreshing={loading}
          />
        )}

        <p className="text-center text-sm text-charcoal-light">
          Need help? <Link to="/contact" className="text-himalayan font-semibold hover:underline">Contact us</Link>
        </p>
      </div>
    </div>
  );
}
