import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, CheckCircle } from 'lucide-react';
import { useAuthContext } from '../context/AuthContext';
import { ordersApi } from '../lib/orders/client';
import { verifyStripeOrderPayment } from '../lib/payments/stripe';
import {
  clearPendingStripeCheckout,
  loadPendingStripeCheckout,
} from '../lib/payments/stripeSessionStorage';
import { orderConfirmationUrl } from '../lib/orders/paths';
import { useCart } from '../store/cartStore';

type Status = 'loading' | 'error';

export default function CheckoutSuccessPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuthContext();
  const { clearCart } = useCart();
  const [status, setStatus] = useState<Status>('loading');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function finalize() {
      const redirectStatus = searchParams.get('redirect_status');
      const paymentIntentId =
        searchParams.get('payment_intent') || searchParams.get('payment_intent_id');

      if (redirectStatus === 'failed') {
        if (!cancelled) {
          navigate('/checkout/failed?reason=declined', { replace: true });
        }
        return;
      }

      const pending = loadPendingStripeCheckout();
      const intentId = paymentIntentId || pending?.paymentIntentId;

      if (!intentId) {
        if (!cancelled) {
          setStatus('error');
          setMessage('We could not match this payment to an order. Return to checkout or contact support.');
        }
        return;
      }

      if (pending?.paymentIntentId && paymentIntentId && pending.paymentIntentId !== paymentIntentId) {
        if (!cancelled) {
          setStatus('error');
          setMessage('Payment reference does not match your order. Please contact support.');
        }
        return;
      }

      try {
        const verifyResult = await verifyStripeOrderPayment({ paymentIntentId: intentId });
        if (!verifyResult.orderId) {
          throw new Error('Payment succeeded, but the order is still being finalized. Please return to checkout shortly.');
        }
        clearPendingStripeCheckout();
        await clearCart();

        if (cancelled) return;

        const order = await ordersApi.getOrderById(verifyResult.orderId);
        navigate(orderConfirmationUrl(verifyResult.orderId), {
          replace: true,
          state: {
            order: order
              ? {
                  ...order,
                  payment_status: verifyResult.paymentStatus === 'pending' ? ('pending' as const) : ('paid' as const),
                }
              : undefined,
          },
        });
      } catch (err) {
        if (!cancelled) {
          setStatus('error');
          setMessage(
            err instanceof Error
              ? err.message
              : 'Unable to confirm payment. If you were charged, contact support with your email.'
          );
        }
      }
    }

    void finalize();
    return () => {
      cancelled = true;
    };
  }, [searchParams, navigate, user?.id, clearCart]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-warm-white flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <Loader2 size={40} className="animate-spin text-himalayan mx-auto mb-4" />
          <h1 className="font-serif text-2xl font-bold text-charcoal mb-2">Confirming your payment</h1>
          <p className="text-charcoal-light text-sm">Please keep this tab open for a moment.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-warm-white py-16 px-4 sm:px-6">
      <div className="max-w-lg mx-auto bg-white rounded-2xl shadow-md p-8 text-center">
        <CheckCircle size={48} className="mx-auto mb-4 text-amber-500" />
        <h1 className="font-serif text-2xl font-bold text-charcoal mb-2">Payment issue</h1>
        <p className="text-charcoal-light text-sm mb-6">{message}</p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            to="/checkout"
            className="inline-flex justify-center px-6 py-3 bg-himalayan hover:bg-himalayan-dark text-white font-semibold rounded-xl transition-colors"
          >
            Return to checkout
          </Link>
          <Link
            to="/contact"
            className="inline-flex justify-center px-6 py-3 border border-gray-200 text-charcoal font-semibold rounded-xl hover:bg-gray-50 transition-colors"
          >
            Contact support
          </Link>
        </div>
      </div>
    </div>
  );
}
