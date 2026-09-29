import { useMemo, useState } from 'react';
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from '@stripe/react-stripe-js';
import { loadStripe, type StripeElementsOptions } from '@stripe/stripe-js';
import { LockKeyhole, Loader2 } from 'lucide-react';
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
        onError(error.message || 'Payment could not be completed. Please try again.');
        return;
      }

      if (paymentIntent?.status === 'processing') {
        window.location.assign(`${getStripeSuccessUrl()}?payment_intent=${encodeURIComponent(paymentIntent.id)}`);
        return;
      }

      if (paymentIntent && paymentIntent.status !== 'succeeded') {
        onError('Payment was not completed. Please check the selected payment method before continuing.');
        return;
      }

      await onSuccess();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Payment could not be completed.');
    } finally {
      setPaying(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-xl border border-himalayan-line/70 bg-warm-white px-4 py-3">
        <LockKeyhole size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-himalayan" />
        <div>
          <p className="text-sm font-semibold text-charcoal">Choose a secure payment method</p>
          <p className="mt-0.5 text-xs leading-relaxed text-charcoal-light">
            Stripe shows the card and pay-over-time options available for this order and location.
          </p>
        </div>
      </div>
      {!elementReady && !elementError && (
        <div role="status" aria-live="polite" className="rounded-xl border border-himalayan-line/70 bg-warm-white px-4 py-3 text-sm text-charcoal-light">
          Loading available payment methods…
        </div>
      )}
      {elementError && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
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
          layout: 'accordion',
          paymentMethodOrder: ['card', 'klarna', 'afterpay_clearpay', 'affirm'],
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
        className="w-full flex items-center justify-center gap-2 rounded-xl bg-himalayan px-4 py-4 font-semibold text-white shadow-sm transition-colors hover:bg-himalayan-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-himalayan disabled:cursor-not-allowed disabled:bg-gray-300"
      >
        {paying && <Loader2 size={18} className="animate-spin" />}
        {paying ? 'Confirming payment…' : `Continue securely · ${amountLabel}`}
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
        Secure payments are not configured yet. An administrator can add the Stripe
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
