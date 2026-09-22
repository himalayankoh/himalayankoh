import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, CheckCircle, CreditCard, Loader2, MapPin, PackageCheck, ShieldCheck, Truck } from 'lucide-react';
import { useAuthContext } from '../context/AuthContext';
import StripePaymentForm from '../components/checkout/StripePaymentForm';
import {
  calculateOrderTotals,
  supportedCoupons,
  type ShippingMethod,
} from '../lib/orders/totals';
import { ordersApi } from '../lib/orders/client';
import type { OrderWithItems } from '../lib/supabase/database.types';
import { publicEnv } from '../lib/env';
import { useCart } from '../store/cartStore';
import { getStripeClientConfig, type StripePublicConfig } from '../lib/stripe/clientConfig';
import { getShippoClientConfig } from '../lib/shippo/clientConfig';
import {
  createStripePaymentIntent,
  verifyStripeOrderPayment,
} from '../lib/payments/stripe';
import {
  clearPendingStripeCheckout,
  savePendingStripeCheckout,
} from '../lib/payments/stripeSessionStorage';
import { getErrorMessage } from '../lib/errors';
import { useToast } from '../context/ToastContext';
import { orderConfirmationUrl } from '../lib/orders/paths';
import { formatUsPostalCode, normalizeUsState } from '../lib/address/usStates';
import { fetchShippoRates, validateShippingAddressClient, type AddressValidationResponse } from '../lib/shippo/client';
import type { CheckoutShippingAddress, ShippoRate } from '../lib/shippo/types';

function pickDefaultShippoRateId(rates: ShippoRate[]): string | null {
  if (rates.length === 0) return null;
  const usps = rates.find((rate) => /usps/i.test(rate.provider));
  return usps?.objectId ?? rates[0]?.objectId ?? null;
}
const inputClass = 'w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm text-charcoal focus:outline-none focus:ring-2 focus:ring-himalayan/30 focus:border-himalayan transition-all';
const labelClass = 'block text-sm font-semibold text-charcoal mb-1.5';

const initialForm = {
  email: '',
  phone: '',
  fullName: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  state: '',
  postalCode: '',
  country: 'United States',
  billingFullName: '',
  billingAddressLine1: '',
  billingAddressLine2: '',
  billingCity: '',
  billingState: '',
  billingPostalCode: '',
  billingCountry: 'United States',
  notes: '',
};

type CheckoutForm = typeof initialForm;
type FieldErrors = Partial<Record<keyof CheckoutForm | 'coupon', string>>;
type PaymentMethod = 'invoice' | 'stripe';

interface StripeCheckoutSession {
  order: OrderWithItems;
  clientSecret: string;
  paymentIntentId: string;
}

export default function CheckoutPage({ retailOnly = false }: { retailOnly?: boolean }) {
  const navigate = useNavigate();
  const { user, profile } = useAuthContext();
  const { items, clearCart } = useCart();
  const toast = useToast();
  const [form, setForm] = useState({
    ...initialForm,
    email: user?.email || '',
    phone: profile?.phone || '',
    fullName: profile?.full_name || '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [couponInput, setCouponInput] = useState('');
  const [couponCode, setCouponCode] = useState('');
  const [shippingMethod, setShippingMethod] = useState<ShippingMethod>('standard');
  const [shippoRates, setShippoRates] = useState<ShippoRate[]>([]);
  const [selectedShippoRateId, setSelectedShippoRateId] = useState<string | null>(null);
  const [shippoRatesLoading, setShippoRatesLoading] = useState(false);
  const [shippoRatesError, setShippoRatesError] = useState<string | null>(null);
  const [shippoRatesAttempted, setShippoRatesAttempted] = useState(false);
  const [addressValidation, setAddressValidation] = useState<AddressValidationResponse | null>(null);
  const [addressValidating, setAddressValidating] = useState(false);
  const [billingSameAsShipping, setBillingSameAsShipping] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(() =>
    publicEnv.stripePublishableKey ? 'stripe' : 'invoice'
  );
  const [stripeSession, setStripeSession] = useState<StripeCheckoutSession | null>(null);
  const [paymentCompleting, setPaymentCompleting] = useState(false);
  const [stripeConfig, setStripeConfig] = useState<StripePublicConfig | null>(null);
  const [shippoRuntimeEnabled, setShippoRuntimeEnabled] = useState<boolean | null>(null);
  const [shippingSelected, setShippingSelected] = useState(false);
  const stripePaymentRef = useRef<HTMLDivElement>(null);
  const preparingPaymentRef = useRef(false);

  const shippoEnabled = shippoRuntimeEnabled ?? publicEnv.shippoEnabled;
  const showShippoPanel = shippoEnabled && (
    shippoRatesLoading ||
    Boolean(shippoRatesError) ||
    shippoRates.length > 0 ||
    shippoRatesAttempted
  );
  const selectedShippoRate = shippoRates.find((rate) => rate.objectId === selectedShippoRateId) || null;
  const useLiveShippoRates = shippoEnabled && shippoRates.length > 0 && Boolean(selectedShippoRate);
  const stripeEnabled = stripeConfig?.configured ?? Boolean(publicEnv.stripePublishableKey);
  const stripePublishableKey = stripeConfig?.publishableKey ?? publicEnv.stripePublishableKey;
  const stripeMode = stripeConfig?.mode ?? (stripePublishableKey.startsWith('pk_live_') ? 'live' : 'test');

  const totals = useMemo(
    () => calculateOrderTotals(
      items.map((item) => ({
        quantity: item.quantity,
        unitPrice: item.price,
      })),
      {
        couponCode,
        shippingMethod,
        shippingCostOverride: useLiveShippoRates ? selectedShippoRate?.amount : undefined,
      }
    ),
    [couponCode, items, shippingMethod, useLiveShippoRates, selectedShippoRate?.amount]
  );

  const paymentDetailsReady = Boolean(
    form.email.trim() &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email) &&
    form.fullName.trim() &&
    form.addressLine1.trim() &&
    form.city.trim() &&
    form.state.trim() &&
    form.postalCode.trim() &&
    form.country.trim() &&
    (billingSameAsShipping || (
      form.billingFullName.trim() &&
      form.billingAddressLine1.trim() &&
      form.billingCity.trim() &&
      form.billingState.trim() &&
      form.billingPostalCode.trim() &&
      form.billingCountry.trim()
    ))
  );
  const shippingReadyForPayment = !shippoEnabled || useLiveShippoRates || shippoRatesAttempted;
  const addressReady = Boolean(
    form.fullName.trim() &&
    form.addressLine1.trim() &&
    form.city.trim() &&
    form.state.trim() &&
    form.postalCode.trim() &&
    form.country.trim()
  );
  const canAutoPreparePayment =
    retailOnly &&
    paymentMethod === 'stripe' &&
    stripeEnabled &&
    items.length > 0 &&
    shippingSelected &&
    shippingReadyForPayment &&
    paymentDetailsReady;

  useEffect(() => {
    getStripeClientConfig()
      .then((config) => setStripeConfig(config))
      .catch((error) => console.error('Unable to load Stripe config:', error));
  }, []);

  useEffect(() => {
    const onCartWarning = (event: Event) => {
      // The store's own words. It no longer claims the line was removed, because
      // nothing removes it: WooCommerce refuses the line when the order is written,
      // and the customer can still see and adjust it in their cart.
      const detail = (event as CustomEvent<Array<{ message: string }>>).detail || [];
      if (detail.length > 0) setError(detail.map((item) => item.message).join(' '));
    };
    window.addEventListener('cart-validation-warning', onCartWarning);
    return () => window.removeEventListener('cart-validation-warning', onCartWarning);
  }, []);

  useEffect(() => {
    getStripeClientConfig()
      .then((config) => setStripeConfig(config))
      .catch((error) => {
        console.error('Unable to load Stripe config:', error);
        setStripeConfig(null);
      });
  }, []);

  useEffect(() => {
    if (retailOnly) {
      setPaymentMethod(stripeEnabled ? 'stripe' : 'invoice');
    }
  }, [retailOnly, stripeEnabled]);

  useEffect(() => {
    getShippoClientConfig()
      .then((config) => setShippoRuntimeEnabled(config.enabled))
      .catch((error) => {
        console.error('Unable to load Shippo config:', error);
        setShippoRuntimeEnabled(false);
      });
  }, []);

  useEffect(() => {
    if (!shippoEnabled || items.length === 0) {
      setShippoRates([]);
      setSelectedShippoRateId(null);
      setAddressValidation(null);
      return;
    }

    const addressReady =
      form.fullName.trim() &&
      form.addressLine1.trim() &&
      form.city.trim() &&
      form.state.trim() &&
      form.postalCode.trim() &&
      form.country.trim();

    if (!addressReady) {
      setShippoRates([]);
      setSelectedShippoRateId(null);
      setAddressValidation(null);
      setShippoRatesAttempted(false);
      return;
    }

    const timer = window.setTimeout(async () => {
      setAddressValidating(true);
      setShippoRatesLoading(true);
      setShippoRatesError(null);

      const shippingAddress = buildShippingAddress(form);

      try {
        const validation = await validateShippingAddressClient({
          address: shippingAddress,
          email: form.email,
        });
        setAddressValidation(validation);

        const normalized = validation.normalizedAddress;
        const recommended = validation.recommendedAddress;
        const streetSuggestion =
          recommended &&
          (recommended.addressLine1.toLowerCase() !== normalized.addressLine1.toLowerCase() ||
            recommended.city.toLowerCase() !== normalized.city.toLowerCase());

        setForm((current) => {
          if (streetSuggestion) {
            if (current.state === normalized.state && current.postalCode === normalized.postalCode) {
              return current;
            }
            return {
              ...current,
              state: normalized.state,
              postalCode: normalized.postalCode,
            };
          }

          const next = {
            ...current,
            addressLine1: normalized.addressLine1,
            addressLine2: normalized.addressLine2 || '',
            city: normalized.city,
            state: normalized.state,
            postalCode: normalized.postalCode,
          };

          if (
            current.addressLine1 === next.addressLine1 &&
            current.addressLine2 === next.addressLine2 &&
            current.city === next.city &&
            current.state === next.state &&
            current.postalCode === next.postalCode
          ) {
            return current;
          }

          return next;
        });

        const result = await fetchShippoRates({
          address: normalized,
          email: form.email,
          items: items.map((item) => ({
            productId: item.id,
            quantity: item.quantity,
          })),
        });

        setShippoRates(result.rates);
        setShippoRatesAttempted(true);
        setSelectedShippoRateId((current) => {
          if (current && result.rates.some((rate) => rate.objectId === current)) {
            return current;
          }
          return pickDefaultShippoRateId(result.rates);
        });
        // A rate is auto-picked above (the cheapest option renders
        // pre-highlighted), but shippingSelected otherwise only flips true
        // from an explicit card click — leaving Payment stuck on "select a
        // shipping method" even though one is already visibly selected,
        // until the shopper re-clicks the option that already looks chosen.
        // Auto-picking counts as picked.
        if (result.rates.length > 0) setShippingSelected(true);
      } catch (err) {
        setShippoRates([]);
        setSelectedShippoRateId(null);
        setShippoRatesAttempted(true);
        setShippoRatesError(err instanceof Error ? err.message : 'Unable to load live shipping rates.');
      } finally {
        setAddressValidating(false);
        setShippoRatesLoading(false);
      }
    }, 700);

    return () => window.clearTimeout(timer);
  }, [
    shippoEnabled,
    items,
    form.fullName,
    form.addressLine1,
    form.addressLine2,
    form.city,
    form.state,
    form.postalCode,
    form.country,
    form.email,
  ]);

  // Whenever a live Shippo rate isn't in play (Shippo disabled, still
  // loading, or fell back after an error), the flat Standard/Expedited
  // cards render with one already visually highlighted — but that's a
  // different flag (shippingSelected) than the auto-pick above only
  // handles for the live-rate path. Keep it in sync with the flat-rate
  // fallback too, so Payment doesn't stay stuck on "select a shipping
  // method" once a real address is entered, matching what the shopper
  // already sees selected on screen.
  useEffect(() => {
    if (useLiveShippoRates) return;
    setShippingSelected(addressReady);
  }, [useLiveShippoRates, addressReady]);

  const applySuggestedAddress = () => {
    if (!addressValidation?.recommendedAddress) return;
    const suggested = addressValidation.recommendedAddress;
    setForm((current) => ({
      ...current,
      addressLine1: suggested.addressLine1,
      addressLine2: suggested.addressLine2 || '',
      city: suggested.city,
      state: suggested.state,
      postalCode: suggested.postalCode,
      country: suggested.country,
    }));
    setAddressValidation((current) =>
      current
        ? {
            ...current,
            isValid: true,
            recommendedAddress: undefined,
            messages: [],
            normalizedAddress: suggested,
          }
        : current,
    );
  };

  const handleChange = (field: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
    if (
      field === 'addressLine1' ||
      field === 'addressLine2' ||
      field === 'city' ||
      field === 'state' ||
      field === 'postalCode' ||
      field === 'country'
    ) {
      setAddressValidation(null);
      setShippingSelected(false);
    }
  };

  const applyCoupon = () => {
    const nextCoupon = couponInput.trim().toUpperCase();
    if (!nextCoupon) {
      setCouponCode('');
      setFieldErrors((current) => ({ ...current, coupon: undefined }));
      return;
    }

    if (!supportedCoupons[nextCoupon]) {
      setFieldErrors((current) => ({ ...current, coupon: 'Coupon code is not valid.' }));
      setCouponCode('');
      return;
    }

    setCouponCode(nextCoupon);
    setFieldErrors((current) => ({ ...current, coupon: undefined }));
  };

  const validateForm = () => {
    const nextErrors: FieldErrors = {};
    const requiredFields: (keyof CheckoutForm)[] = [
      'email',
      'fullName',
      'addressLine1',
      'city',
      'state',
      'postalCode',
      'country',
    ];

    requiredFields.forEach((field) => {
      if (!form[field].trim()) nextErrors[field] = 'Required';
    });

    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      nextErrors.email = 'Enter a valid email.';
    }

    if (!billingSameAsShipping) {
      ([
        'billingFullName',
        'billingAddressLine1',
        'billingCity',
        'billingState',
        'billingPostalCode',
        'billingCountry',
      ] as (keyof CheckoutForm)[]).forEach((field) => {
        if (!form[field].trim()) nextErrors[field] = 'Required';
      });
    }

    if (paymentMethod === 'stripe' && !stripeEnabled) {
      nextErrors.coupon =
        'Card payments need a Stripe publishable key and secret key configured in environment variables or Supabase settings.';
    }

    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const prepareStripePayment = useCallback(async () => {
    if (stripeSession || preparingPaymentRef.current) return;

    preparingPaymentRef.current = true;
    setSubmitting(true);
    setError(null);

    try {
      const shippingAddress = buildShippingAddress(form);
      const billingAddress = billingSameAsShipping
        ? shippingAddress
        : buildBillingAddress(form);
      const paymentIntent = await createStripePaymentIntent({
        email: form.email,
        phone: form.phone || undefined,
        shippingAddress,
        billingAddress,
        couponCode,
        shippingMethod,
        shippoRateId: useLiveShippoRates ? selectedShippoRate?.objectId : undefined,
        shippingCarrier: useLiveShippoRates ? selectedShippoRate?.provider : undefined,
        shippingService: useLiveShippoRates ? selectedShippoRate?.serviceName : undefined,
        notes: form.notes || undefined,
        userId: user?.id,
        items,
      });

      // The order is the store's own, reserved before this payment — so the id
      // shown here is already the real one, not a placeholder the webhook swaps
      // for a different one later.
      const pendingOrder = {
        id: paymentIntent.reservedOrderId,
        order_number: paymentIntent.reservedOrderId,
        total: paymentIntent.amount / 100,
      } as OrderWithItems;
      setStripeSession({
        order: pendingOrder,
        clientSecret: paymentIntent.clientSecret,
        paymentIntentId: paymentIntent.paymentIntentId,
      });
      savePendingStripeCheckout({
        reservedOrderId: paymentIntent.reservedOrderId,
        paymentIntentId: paymentIntent.paymentIntentId,
      });
      requestAnimationFrame(() => {
        stripePaymentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to prepare payment.'));
    } finally {
      preparingPaymentRef.current = false;
      setSubmitting(false);
    }
  }, [
    billingSameAsShipping,
    couponCode,
    form,
    items,
    selectedShippoRate?.amount,
    selectedShippoRate?.objectId,
    selectedShippoRate?.provider,
    selectedShippoRate?.serviceName,
    shippingMethod,
    stripeSession,
    useLiveShippoRates,
    user?.id,
  ]);

  useEffect(() => {
    if (!canAutoPreparePayment || stripeSession || submitting) return;
    void prepareStripePayment();
  }, [canAutoPreparePayment, prepareStripePayment, stripeSession, submitting]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (items.length === 0) {
      setError('Your cart is empty.');
      return;
    }

    if (!validateForm()) {
      setError('Please fix the highlighted checkout fields.');
      return;
    }

    if (retailOnly && stripeEnabled) return;

    setSubmitting(true);
    try {
      const shippingAddress = buildShippingAddress(form);
      const billingAddress = billingSameAsShipping
        ? shippingAddress
        : buildBillingAddress(form);

      const orderPayload = {
        email: form.email,
        phone: form.phone || undefined,
        shippingAddress,
        billingAddress,
        couponCode,
        shippingMethod,
        shippingCostOverride: useLiveShippoRates ? selectedShippoRate?.amount : undefined,
        shippoRateId: useLiveShippoRates ? selectedShippoRate?.objectId : undefined,
        shippingCarrier: useLiveShippoRates ? selectedShippoRate?.provider : undefined,
        shippingService: useLiveShippoRates ? selectedShippoRate?.serviceName : undefined,
        notes: form.notes || undefined,
      };

      if (paymentMethod === 'invoice') {
        const order = await ordersApi.createOrder({
          ...orderPayload,
          paymentProvider: 'invoice',
          paymentMethod: 'invoice',
          paymentStatus: 'pending',
        });
        await clearCart();
        navigate(orderConfirmationUrl(order.id), { state: { order } });
        return;
      }

      if (stripeSession) {
        setError('Complete card payment below, or switch to invoice checkout.');
        return;
      }
      await prepareStripePayment();
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to place order.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleStripePaymentSuccess = async () => {
    if (!stripeSession) return;

    setPaymentCompleting(true);
    setSubmitting(true);
    setError(null);
    try {
      let verification = await verifyStripeOrderPayment({
        paymentIntentId: stripeSession.paymentIntentId,
      });
      for (let attempt = 0; attempt < 5 && !verification.orderId; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 1200));
        verification = await verifyStripeOrderPayment({ paymentIntentId: stripeSession.paymentIntentId });
      }
      if (!verification.orderId) {
        throw new Error('Payment succeeded. Your order is being finalized; your cart and checkout details are preserved. Refresh shortly to see confirmation.');
      }
      const paidOrder = {
        ...stripeSession.order,
        id: verification.orderId,
        payment_status: verification.paymentStatus === 'paid' ? 'paid' : 'pending',
        payment_method: 'stripe_card',
      } as OrderWithItems;

      clearPendingStripeCheckout();
      navigate(orderConfirmationUrl(paidOrder.id), { state: { order: paidOrder } });
      await clearCart();
    } catch (err) {
      setPaymentCompleting(false);
      toast.error(getErrorMessage(err, 'Payment succeeded but order confirmation failed. Contact support with your email.'));
    } finally {
      setSubmitting(false);
    }
  };

  if (items.length === 0 && !submitting && !stripeSession && !paymentCompleting) {
    return (
      <div className="min-h-screen bg-warm-white py-16">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <div className="bg-white rounded-2xl shadow-md p-12">
            <PackageCheck size={64} className="mx-auto mb-6 text-gray-200" />
            <h1 className="font-serif text-3xl font-bold text-charcoal mb-3">Your cart is empty</h1>
            <p className="text-charcoal-light mb-6">Add products to your cart before checking out.</p>
            <Link to="/products" className="inline-flex items-center justify-center px-6 py-3 bg-himalayan hover:bg-himalayan-dark text-white font-semibold rounded-xl transition-colors">
              Browse Products
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-warm-white">
      <div className="bg-gradient-to-r from-charcoal to-charcoal-light py-12 md:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <Link to="/products" className="inline-flex items-center gap-2 text-white/70 hover:text-white mb-4 text-sm">
            <ArrowLeft size={16} />
            Continue Shopping
          </Link>
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="font-serif text-3xl md:text-4xl font-bold text-white"
          >
            Checkout
          </motion.h1>
          <p className="text-white/70 mt-2 max-w-2xl">
            Secure order review, shipping details, and payment preparation for Himalayan Koh products.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="max-w-7xl mx-auto px-4 sm:px-6 py-8 md:py-12">
        {paymentMethod === 'stripe' && !stripeEnabled && (
          <div className="mb-6 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            <p className="font-semibold">Payments not configured on this machine</p>
            <ul className="mt-2 list-disc pl-5 space-y-1">
              <li>
                Add Stripe test keys to <code className="text-xs">.env.local</code>, then restart with{' '}
                <code className="text-xs">npm run dev:clean</code>.
              </li>
            </ul>
          </div>
        )}
        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <section className="bg-white rounded-2xl shadow-md p-6">
              <h2 className="font-serif text-xl font-bold text-charcoal mb-2">Contact Information</h2>
              {!user && (
                <p className="mb-5 text-sm text-charcoal-light">
                  Checking out as a guest — no account needed. You&rsquo;ll get an email confirmation and order tracking link once you pay.
                </p>
              )}
              <div className="grid md:grid-cols-2 gap-4">
                <Field label="Email address" error={fieldErrors.email}>
                  <input required type="email" value={form.email} onChange={(event) => handleChange('email', event.target.value)} placeholder="you@example.com" className={inputClass} />
                </Field>
                <Field label="Phone number">
                  <input value={form.phone} onChange={(event) => handleChange('phone', event.target.value)} placeholder="(832) 224-6466" className={inputClass} />
                </Field>
              </div>
            </section>

            <section className="bg-white rounded-2xl shadow-md p-6">
              <div className="flex items-center gap-2 mb-5">
                <Truck size={20} className="text-himalayan" />
                <h2 className="font-serif text-xl font-bold text-charcoal">Shipping Address</h2>
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <Field label="Full name" error={fieldErrors.fullName}>
                  <input required value={form.fullName} onChange={(event) => handleChange('fullName', event.target.value)} placeholder="Full name" className={inputClass} />
                </Field>
                <Field label="Address line 1" error={fieldErrors.addressLine1}>
                  <input required value={form.addressLine1} onChange={(event) => handleChange('addressLine1', event.target.value)} placeholder="Street address" className={inputClass} />
                </Field>
                <Field label="Address line 2">
                  <input value={form.addressLine2} onChange={(event) => handleChange('addressLine2', event.target.value)} placeholder="Suite, building, ranch name" className={inputClass} />
                </Field>
                <Field label="City" error={fieldErrors.city}>
                  <input required value={form.city} onChange={(event) => handleChange('city', event.target.value)} placeholder="City" className={inputClass} />
                </Field>
                <Field label="State" error={fieldErrors.state}>
                  <input required value={form.state} onChange={(event) => handleChange('state', event.target.value)} placeholder="State" className={inputClass} />
                </Field>
                <Field label="Postal code" error={fieldErrors.postalCode}>
                  <input required value={form.postalCode} onChange={(event) => handleChange('postalCode', event.target.value)} placeholder="Postal code" className={inputClass} />
                </Field>
                <Field label="Country" error={fieldErrors.country}>
                  <input required value={form.country} onChange={(event) => handleChange('country', event.target.value)} placeholder="Country" className={inputClass} />
                </Field>
              </div>

              {(addressValidating || addressValidation) && (
                <div className="mt-4">
                  {addressValidating && (
                    <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-charcoal-light flex items-center gap-2">
                      <Loader2 size={16} className="animate-spin text-himalayan" />
                      Verifying your shipping address…
                    </div>
                  )}
                  {!addressValidating && addressValidation?.isValid && !addressValidation.recommendedAddress && (
                    <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900 flex items-start gap-2">
                      <CheckCircle size={18} className="text-green-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold">Address verified</p>
                        <p className="mt-1 text-green-800/90">
                          Your shipping address is confirmed{addressValidation.source === 'shippo' ? ' with USPS' : ''}. Live carrier rates use this address.
                        </p>
                      </div>
                    </div>
                  )}
                  {!addressValidating && addressValidation?.recommendedAddress && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                      <div className="flex items-start gap-2">
                        <MapPin size={18} className="text-himalayan flex-shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <p className="font-semibold">Did you mean this address?</p>
                          <p className="mt-2 leading-6">
                            {formatAddressLines(addressValidation.recommendedAddress)}
                          </p>
                          {addressValidation.messages.length > 0 && (
                            <p className="mt-2 text-amber-900/90">{addressValidation.messages[0]}</p>
                          )}
                          <button
                            type="button"
                            onClick={applySuggestedAddress}
                            className="mt-3 inline-flex items-center justify-center px-4 py-2 bg-himalayan text-white rounded-lg text-sm font-semibold hover:bg-himalayan-dark transition-colors"
                          >
                            Use suggested address
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                  {!addressValidating &&
                    addressValidation &&
                    !addressValidation.isValid &&
                    !addressValidation.recommendedAddress && (
                      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                        <p className="font-semibold">Please double-check your address</p>
                        <p className="mt-1">
                          {addressValidation.messages[0] ||
                            'We could not fully verify this address. Fix any typos or use standard USPS formatting.'}
                        </p>
                      </div>
                    )}
                </div>
              )}
            </section>

            <section className="bg-white rounded-2xl shadow-md p-6">
              <h2 className="font-serif text-xl font-bold text-charcoal mb-5">Shipping Method</h2>

              {showShippoPanel && (
                <div className="mb-4 rounded-xl border border-himalayan/20 bg-himalayan/5 px-4 py-3 text-sm">
                  {shippoRatesLoading && (
                    <p className="text-charcoal-light mt-1 flex items-center gap-2">
                      <Loader2 size={14} className="animate-spin" />
                      Fetching rates for your address...
                    </p>
                  )}
                  {!shippoRatesLoading && shippoRatesError && (
                    <p className="text-amber-800 mt-1">{shippoRatesError} Using standard flat rates below.</p>
                  )}
                  {!shippoRatesLoading && shippoRates.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {shippoRates.map((rate) => (
                        <button
                          key={rate.objectId}
                          type="button"
                          onClick={() => {
                            setSelectedShippoRateId(rate.objectId);
                            setShippingSelected(true);
                          }}
                          className={`w-full text-left rounded-xl border p-3 transition-colors ${
                            selectedShippoRateId === rate.objectId
                              ? 'border-himalayan bg-white'
                              : 'border-gray-200 hover:border-himalayan/40'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="font-semibold text-charcoal">{rate.provider} — {rate.serviceName}</p>
                              <p className="text-xs text-charcoal-light mt-0.5">
                                {rate.estimatedDays ? `${rate.estimatedDays} business days` : 'Estimated delivery varies'}
                              </p>
                            </div>
                            <span className="font-bold text-himalayan">${rate.amount.toFixed(2)}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  {!shippoRatesLoading && shippoRates.length === 0 && !shippoRatesError && shippoRatesAttempted && (
                    <p className="text-charcoal-light mt-1">
                      Live carrier rates are unavailable for this address — flat rates apply below.
                    </p>
                  )}
                </div>
              )}

              {!useLiveShippoRates && (
              <div className="grid md:grid-cols-2 gap-4">
                <ShippingOption
                  active={shippingMethod === 'standard'}
                  title={totals.subtotal >= 50 ? 'Standard Shipping (Free)' : 'Standard Shipping'}
                  detail={totals.subtotal >= 50 ? 'Free over $50' : '3-7 business days'}
                  price={totals.subtotal >= 50 ? '$0.00' : '$9.95'}
                  onClick={() => {
                    setShippingMethod('standard');
                    setShippingSelected(true);
                  }}
                />
                <ShippingOption
                  active={shippingMethod === 'expedited'}
                  title="Expedited Shipping"
                  detail="2-4 business days"
                  price="$18.95"
                  onClick={() => {
                    setShippingMethod('expedited');
                    setShippingSelected(true);
                  }}
                />
              </div>
              )}
            </section>
            <section className="bg-white rounded-2xl shadow-md p-6">
              <h2 className="font-serif text-xl font-bold text-charcoal mb-5">Billing Details</h2>
              <label className="flex items-center gap-2 cursor-pointer mb-5">
                <input
                  type="checkbox"
                  checked={billingSameAsShipping}
                  onChange={(event) => setBillingSameAsShipping(event.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-himalayan focus:ring-himalayan"
                />
                <span className="text-sm text-charcoal">Billing address is the same as shipping</span>
              </label>

              {!billingSameAsShipping && (
                <div className="grid md:grid-cols-2 gap-4">
                  <Field label="Billing full name" error={fieldErrors.billingFullName}>
                    <input value={form.billingFullName} onChange={(event) => handleChange('billingFullName', event.target.value)} className={inputClass} />
                  </Field>
                  <Field label="Billing address line 1" error={fieldErrors.billingAddressLine1}>
                    <input value={form.billingAddressLine1} onChange={(event) => handleChange('billingAddressLine1', event.target.value)} className={inputClass} />
                  </Field>
                  <Field label="Billing address line 2">
                    <input value={form.billingAddressLine2} onChange={(event) => handleChange('billingAddressLine2', event.target.value)} className={inputClass} />
                  </Field>
                  <Field label="Billing city" error={fieldErrors.billingCity}>
                    <input value={form.billingCity} onChange={(event) => handleChange('billingCity', event.target.value)} className={inputClass} />
                  </Field>
                  <Field label="Billing state" error={fieldErrors.billingState}>
                    <input value={form.billingState} onChange={(event) => handleChange('billingState', event.target.value)} className={inputClass} />
                  </Field>
                  <Field label="Billing postal code" error={fieldErrors.billingPostalCode}>
                    <input value={form.billingPostalCode} onChange={(event) => handleChange('billingPostalCode', event.target.value)} className={inputClass} />
                  </Field>
                  <Field label="Billing country" error={fieldErrors.billingCountry}>
                    <input value={form.billingCountry} onChange={(event) => handleChange('billingCountry', event.target.value)} className={inputClass} />
                  </Field>
                </div>
              )}
            </section>

            <section className="bg-white rounded-2xl shadow-md p-6">
              <h2 className={`font-serif text-xl font-bold text-charcoal ${retailOnly ? '' : 'mb-2'}`}>Payment</h2>
              {retailOnly ? (
                stripeSession ? (
                  <div
                    ref={stripePaymentRef}
                    className="mt-5 rounded-2xl border-2 border-himalayan/50 bg-white p-5 shadow-lg shadow-himalayan/10"
                  >
                    <p className="text-sm text-charcoal-light mb-4">
                      Secure payment for order {stripeSession.order.order_number} ·{' '}
                      <strong className="text-charcoal">${totals.total.toFixed(2)}</strong>
                    </p>
                    <StripePaymentForm
                      clientSecret={stripeSession.clientSecret}
                      publishableKey={stripePublishableKey}
                      amountLabel={`$${totals.total.toFixed(2)}`}
                      disabled={submitting || paymentCompleting}
                      onSuccess={handleStripePaymentSuccess}
                      onError={(message) => toast.error(message)}
                    />
                  </div>
                ) : (
                  <div className="mt-5 rounded-2xl border border-himalayan/30 bg-himalayan/5 p-5 text-sm text-charcoal-light">
                    {submitting ? (
                      <span className="flex items-center gap-2"><Loader2 size={16} className="animate-spin" /> Preparing secure payment…</span>
                    ) : !stripeEnabled ? (
                      <div className="space-y-1.5">
                        <p className="font-semibold text-charcoal flex items-center gap-2">
                          <CreditCard size={18} className="text-himalayan" />
                          Online card payment is being configured on staging
                        </p>
                        <p className="text-xs text-charcoal-light">
                          Checkout fail-safe is active: click <strong>Place order (invoice)</strong> below to place your order with invoice/bank transfer. We will email you payment details.
                        </p>
                      </div>
                    ) : (
                      'Complete your shipping address and select a shipping method to load payment options.'
                    )}
                  </div>
                )
              ) : (
                <>
                <p className="text-sm text-charcoal-light mb-5">
                {stripeEnabled
                  ? 'Pay securely with your card at checkout. Invoice billing is available on request.'
                  : 'Card payments are not configured on this site. Place your order and pay by invoice.'}
              </p>

              <div className="grid md:grid-cols-2 gap-4">
                <button
                  type="button"
                  disabled={!stripeEnabled}
                  onClick={() => {
                    setPaymentMethod('stripe');
                    setStripeSession(null);
                  }}
                  className={`relative text-left rounded-2xl border p-4 transition-colors ${
                    paymentMethod === 'stripe'
                      ? 'border-himalayan bg-himalayan/10 ring-2 ring-himalayan/30'
                      : stripeEnabled
                        ? 'border-gray-200 hover:border-himalayan/40'
                        : 'border-gray-200 bg-gray-50 cursor-not-allowed opacity-80'
                  }`}
                >
                  {stripeEnabled && (
                    <span className="absolute top-3 right-3 rounded-full bg-himalayan px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                      Recommended
                    </span>
                  )}
                  <CreditCard size={20} className="text-himalayan mb-2" />
                  <p className="font-semibold text-charcoal">Pay with Card</p>
                  <p className="text-sm text-charcoal-light mt-1">
                    {stripeEnabled
                      ? stripeMode === 'test'
                        ? 'Enter card details after clicking Continue — test card 4242 4242 4242 4242.'
                        : 'Secure card payment via Stripe. Enter card number, expiry, and CVC on the next step.'
                      : 'Add Stripe keys to enable online card payment.'}
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPaymentMethod('invoice');
                    setStripeSession(null);
                  }}
                  className={`text-left rounded-2xl border p-4 transition-colors ${paymentMethod === 'invoice' ? 'border-charcoal/30 bg-gray-50' : 'border-gray-200 hover:border-gray-300'}`}
                >
                  <PackageCheck size={20} className="text-charcoal-light mb-2" />
                  <p className="font-semibold text-charcoal">Pay by Invoice</p>
                  <p className="text-sm text-charcoal-light mt-1">
                    No card required now. We will email you to arrange payment before shipping.
                  </p>
                </button>
              </div>

              {paymentMethod === 'stripe' && stripeEnabled && !stripeSession && (
                <div className="mt-5 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm text-charcoal-light">
                  <p className="font-semibold text-charcoal mb-1">How card checkout works</p>
                  <ol className="list-decimal pl-5 space-y-1">
                    <li>Click <strong>Continue to payment</strong> to save your order.</li>
                    <li>Enter your card number, expiry date, and security code in the secure form below.</li>
                    <li>Click <strong>Pay ${totals.total.toFixed(2)}</strong> — your order is confirmed when payment succeeds.</li>
                  </ol>
                </div>
              )}
                </>
              )}
            </section>

            <section className="bg-white rounded-2xl shadow-md p-6">
              <h2 className="font-serif text-xl font-bold text-charcoal mb-5">Delivery Notes</h2>
              <textarea
                value={form.notes}
                onChange={(event) => handleChange('notes', event.target.value)}
                placeholder="Gate code, delivery instructions, ranch drop-off notes, or product preferences"
                className={`${inputClass} min-h-28 resize-none`}
              />
            </section>
          </div>

          <aside className="lg:col-span-1">
            <div className="bg-white rounded-2xl shadow-md p-6 sticky top-[var(--header-height)]">
              <h2 className="font-serif text-xl font-bold text-charcoal mb-5">Order Summary</h2>
              <div className="space-y-4 mb-5">
                {items.map((item) => (
                  <div key={`${item.id}-${item.grainSize || ''}`} className="flex gap-3">
                    <img src={item.image} alt={item.name} className="w-14 h-14 rounded-lg object-cover bg-gray-100" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-charcoal line-clamp-2">{item.name}</p>
                      <p className="text-xs text-charcoal-light">Qty {item.quantity}{item.grainSize ? ` · ${item.grainSize}` : ''}</p>
                    </div>
                    <span className="text-sm font-semibold text-charcoal">${(item.price * item.quantity).toFixed(2)}</span>
                  </div>
                ))}
              </div>

              <div className="border-t border-gray-100 pt-4 mb-4">
                <label className={labelClass}>Coupon Code</label>
                <div className="flex gap-2">
                  <input
                    value={couponInput}
                    onChange={(event) => setCouponInput(event.target.value)}
                    placeholder="Enter coupon code"
                    className={inputClass}
                  />
                  <button type="button" onClick={applyCoupon} className="px-4 bg-charcoal text-white rounded-xl text-sm font-semibold hover:bg-charcoal-light">
                    Apply
                  </button>
                </div>
                {fieldErrors.coupon && <p className="text-xs text-red-600 mt-1">{fieldErrors.coupon}</p>}
                {couponCode && (
                  <p className="text-xs text-green-700 mt-2 flex items-center gap-1">
                    <CheckCircle size={14} />
                    {supportedCoupons[couponCode].label} applied
                  </p>
                )}
              </div>

              <div className="border-t border-gray-100 pt-4 space-y-2">
                <SummaryRow label="Subtotal" value={totals.subtotal} />
                {totals.discountAmount > 0 && <SummaryRow label="Discount" value={-totals.discountAmount} />}
                <SummaryRow label="Shipping" value={totals.shippingCost} />
                <SummaryRow label="Tax" value={totals.taxAmount} />
                <div className="flex justify-between font-bold text-lg pt-3 border-t border-gray-100">
                  <span className="text-charcoal">Total</span>
                  <span className="text-himalayan">${totals.total.toFixed(2)}</span>
                </div>
              </div>

              <div className="mt-5 flex items-start gap-2 text-xs text-charcoal-light">
                <ShieldCheck size={16} className="text-himalayan flex-shrink-0 mt-0.5" />
                <p>
                  {retailOnly
                    ? stripeEnabled
                      ? stripeSession
                        ? 'Enter your payment details in the Payment section to confirm your order.'
                        : 'Choose Enter secure payment details in the Payment section to continue.'
                      : 'Invoice checkout fail-safe active — submit order without upfront card.'
                    : paymentMethod === 'stripe' && stripeEnabled
                    ? stripeSession
                      ? 'Complete card payment below to confirm your order.'
                      : 'Step 1: Continue to payment, then enter your card details on this page.'
                    : 'Invoice order — no card needed. Payment will be arranged by email before shipping.'}
                </p>
              </div>

              {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

              {(!retailOnly || !stripeEnabled) && (
              <button
                type="submit"
                disabled={submitting || (paymentMethod === 'stripe' && Boolean(stripeSession))}
                className="w-full mt-6 flex items-center justify-center gap-2 py-4 bg-himalayan hover:bg-himalayan-dark disabled:bg-gray-300 text-white font-semibold rounded-xl transition-colors shadow-lg shadow-himalayan/25"
              >
                {submitting && <Loader2 size={18} className="animate-spin" />}
                {submitting
                  ? paymentMethod === 'stripe' ? 'Preparing payment…' : 'Placing order…'
                  : paymentMethod === 'stripe'
                    ? stripeSession
                      ? 'Enter card details above'
                      : retailOnly ? `Pay $${totals.total.toFixed(2)}` : 'Continue to payment'
                    : 'Place order (invoice)'}
              </button>
              )}
            </div>
          </aside>
        </div>
      </form>

      {!retailOnly && paymentMethod === 'stripe' && stripeSession && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pb-12">
          <div ref={stripePaymentRef} className="max-w-3xl rounded-2xl border-2 border-himalayan/50 bg-white p-6 shadow-xl shadow-himalayan/10">
            <h2 className="font-serif text-2xl font-bold text-charcoal mb-1">Secure payment</h2>
            <p className="text-sm text-charcoal-light mb-5">
              Order {stripeSession.order.order_number} · Total due now:{' '}
              <strong className="text-charcoal">${totals.total.toFixed(2)}</strong>
            </p>
            <StripePaymentForm
              clientSecret={stripeSession.clientSecret}
              publishableKey={stripePublishableKey}
              amountLabel={`$${totals.total.toFixed(2)}`}
              disabled={submitting || paymentCompleting}
              onSuccess={handleStripePaymentSuccess}
              onError={(message) => toast.error(message)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className={labelClass}>{label}</span>
      {children}
      {error && <span className="text-xs text-red-600 mt-1 block">{error}</span>}
    </label>
  );
}

function ShippingOption({ active, title, detail, price, onClick }: {
  active: boolean;
  title: string;
  detail: string;
  price: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-2xl border p-4 transition-colors ${active ? 'border-himalayan bg-himalayan/10' : 'border-gray-200 hover:border-himalayan/40'}`}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-semibold text-charcoal">{title}</p>
          <p className="text-sm text-charcoal-light mt-1">{detail}</p>
        </div>
        <span className="font-bold text-himalayan">{price}</span>
      </div>
    </button>
  );
}

function buildShippingAddress(form: CheckoutForm): CheckoutShippingAddress {
  const country = form.country.trim() || 'United States';
  const countryIsUs = country.toLowerCase().includes('united states') || country.toUpperCase() === 'US';

  return {
    fullName: form.fullName.trim(),
    addressLine1: form.addressLine1.trim(),
    addressLine2: form.addressLine2?.trim() || undefined,
    city: form.city.trim(),
    state: countryIsUs ? normalizeUsState(form.state) : form.state.trim(),
    postalCode: countryIsUs ? formatUsPostalCode(form.postalCode) : form.postalCode.trim(),
    country,
  };
}

function formatAddressLines(address: CheckoutShippingAddress): string {
  return [
    address.fullName,
    address.addressLine1,
    address.addressLine2,
    `${address.city}, ${address.state} ${address.postalCode}`,
    address.country,
  ]
    .filter(Boolean)
    .join(' · ');
}

function buildBillingAddress(form: CheckoutForm) {
  return {
    fullName: form.billingFullName,
    addressLine1: form.billingAddressLine1,
    addressLine2: form.billingAddressLine2 || undefined,
    city: form.billingCity,
    state: form.billingState,
    postalCode: form.billingPostalCode,
    country: form.billingCountry,
  };
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
