import { useMemo, useState } from 'react';
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from '@stripe/react-stripe-js';
import { loadStripe, type StripeElementsOptions } from '@stripe/stripe-js';
import { Loader2 } from 'lucide-react';
import { getStripeSuccessUrl } from '../../lib/payments/checkoutUrls';

interface StripePaymentFormProps {
  clientSecret: string;
  amountLabel: string;
  publishableKey: string;
  disabled?: boolean;
  onSuccess: () => Promise<void>;
  onError: (message: string) => void;
}

function PaymentFormInner({
  amountLabel,
  disabled,
  onSuccess,
  onError,
}: Omit<StripePaymentFormProps, 'clientSecret' | 'publishableKey'>) {
  const stripe = useStripe();
  const elements = useElements();
  const [paying, setPaying] = useState(false);
  const [elementReady, setElementReady] = useState(false);
  const [elementError, setElementError] = useState<string | null>(null);

  const handlePayment = async () => {
    if (!stripe || !elements || disabled) return;

    setPaying(true);
    try {
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: getStripeSuccessUrl(),
        },
        redirect: 'if_required',
      });

      if (error) {
        onError(error.message || 'Card payment failed. Please try again.');
        return;
      }

      if (paymentIntent && paymentIntent.status !== 'succeeded') {
        onError('Payment is still processing. Please wait a moment and try again.');
        return;
      }

      await onSuccess();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Card payment failed.');
    } finally {
      setPaying(false);
    }
  };

  return (
    <div className="space-y-4">
      {!elementReady && !elementError && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-charcoal-light">
          Loading secure card, Klarna and Afterpay payment fields…
        </div>
      )}
      {elementError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Payment fields could not load. {elementError} Please refresh this page and try again.
        </div>
      )}
      <PaymentElement
        onReady={() => {
          setElementReady(true);
          setElementError(null);
        }}
        onLoadError={(event) => {
          setElementReady(false);
          setElementError(event.error?.message || 'Stripe was unable to load the available payment methods.');
        }}
        options={{
          layout: 'tabs',
          paymentMethodOrder: ['card', 'klarna', 'afterpay_clearpay'],
          fields: {
            billingDetails: {
              name: 'auto',
            },
          },
        }}
      />
      <button
        type="button"
        onClick={handlePayment}
        disabled={!stripe || !elements || !elementReady || paying || disabled}
        className="w-full flex items-center justify-center gap-2 py-4 bg-charcoal hover:bg-charcoal-light disabled:bg-gray-300 text-white font-semibold rounded-xl transition-colors"
      >
        {paying && <Loader2 size={18} className="animate-spin" />}
        {paying ? 'Processing...' : `Pay ${amountLabel}`}
      </button>
    </div>
  );
}

export default function StripePaymentForm({
  clientSecret,
  amountLabel,
  publishableKey,
  disabled,
  onSuccess,
  onError,
}: StripePaymentFormProps) {
  const stripePromise = useMemo(
    () => (publishableKey ? loadStripe(publishableKey) : null),
    [publishableKey],
  );

  if (!stripePromise) {
    return (
      <p className="text-sm text-red-600">
        Card payments are not configured yet. An administrator can add the Stripe
        publishable key under Admin → Settings → Service &amp; API Keys, or set
        NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_… for local development.
      </p>
    );
  }

  const options: StripeElementsOptions = {
    clientSecret,
    appearance: {
      theme: 'stripe',
      variables: {
        colorPrimary: '#c45c26',
        borderRadius: '12px',
        fontSizeBase: '16px',
        spacingUnit: '5px',
      },
      rules: {
        '.Input': {
          border: '1px solid #d1d5db',
          boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)',
          padding: '14px',
        },
        '.Input:focus': {
          border: '2px solid #c45c26',
          boxShadow: '0 0 0 3px rgba(196, 92, 38, 0.12)',
        },
        '.Label': {
          fontWeight: '600',
          color: '#2f2a26',
          marginBottom: '8px',
        },
        '.Tab': {
          border: '1px solid #d1d5db',
          padding: '12px',
        },
        '.Tab--selected': {
          border: '2px solid #c45c26',
          boxShadow: '0 0 0 3px rgba(196, 92, 38, 0.10)',
        },
      },
    },
  };

  return (
    <Elements stripe={stripePromise} options={options}>
      <PaymentFormInner
        amountLabel={amountLabel}
        disabled={disabled}
        onSuccess={onSuccess}
        onError={onError}
      />
    </Elements>
  );
}
