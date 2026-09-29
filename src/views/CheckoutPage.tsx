import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, CheckCircle, CreditCard, Loader2, MapPin, PackageCheck, ShieldCheck, Truck } from 'lucide-react';
import { useAuthContext } from '../context/AuthContext';
import StripePaymentForm from '../components/checkout/StripePaymentForm';
import StagingTestPaymentForm from '../components/checkout/StagingTestPaymentForm';
import { submitStagingSimulatorPayment } from '../lib/payments/stagingSimulatorClient';
import {
  STAGING_SIMULATOR_UNAVAILABLE_MESSAGE,
  STAGING_TEST_CUSTOMER_NAME,
  STAGING_TEST_EMAIL,
  type StagingTestOutcome,
} from '../lib/payments/stagingSimulator';
import {
  calculateOrderTotals,
  supportedCoupons,
  type ShippingMethod,
} from '../lib/orders/totals';
import { ordersApi } from '../lib/orders/client';
import type { OrderWithItems } from '../lib/commerce/types';
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
  const { items, clearCart, isLoaded, isLoading, updateCustomerAddress, serverTax } = useCart();
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
    // Retail is card-or-nothing, so it must never *hold* `invoice` as its
    // selection even before the Stripe config has loaded. The legacy checkout
    // keeps the old default.
    retailOnly || publicEnv.stripePublishableKey ? 'stripe' : 'invoice'
  );
  const [stripeSession, setStripeSession] = useState<StripeCheckoutSession | null>(null);
  const [paymentCompleting, setPaymentCompleting] = useState(false);
  const [stripeConfig, setStripeConfig] = useState<StripePublicConfig | null>(null);
  /** False until the server has answered — a payment form must not mount before that. */
  const [stripeConfigLoaded, setStripeConfigLoaded] = useState(false);
  const [shippoRuntimeEnabled, setShippoRuntimeEnabled] = useState<boolean | null>(null);
  const [shippingSelected, setShippingSelected] = useState(false);
  const [authoritativeTax, setAuthoritativeTax] = useState<number | null>(null);
  const stripePaymentRef = useRef<HTMLDivElement>(null);
  const preparingPaymentRef = useRef(false);

  const normalizedState = normalizeUsState(form.state);

  useEffect(() => {
    if (!normalizedState) {
      setAuthoritativeTax(null);
      return;
    }
    let cancelled = false;
    updateCustomerAddress({
      country: form.country === 'United States' ? 'US' : form.country,
      state: normalizedState,
      city: form.city,
      postalCode: form.postalCode,
    })
      .then((res) => {
        if (!cancelled && res && typeof res.totalTax === 'number' && res.totalTax > 0) {
          setAuthoritativeTax(res.totalTax);
        } else if (!cancelled) {
          setAuthoritativeTax(null);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [normalizedState, form.city, form.postalCode, form.country, updateCustomerAddress]);

  const shippoEnabled = shippoRuntimeEnabled ?? publicEnv.shippoEnabled;
  const showShippoPanel = shippoEnabled && (
    shippoRatesLoading ||
    Boolean(shippoRatesError) ||
    shippoRates.length > 0 ||
    shippoRatesAttempted
  );
  const selectedShippoRate = shippoRates.find((rate) => rate.objectId === selectedShippoRateId) || null;
  const useLiveShippoRates = shippoEnabled && shippoRates.length > 0 && Boolean(selectedShippoRate);
  // The server decides, and it is the only thing that may decide.
  //
  // `configured` means "both keys are present AND from the same Stripe mode", which
  // is the only answer that guarantees the card form can confirm the PaymentIntent
  // this deployment created. A baked-in publishable key is NOT evidence of that: a
  // `pk_live_` compiled into a test deployment would load Stripe.js in live mode
  // against a test intent — the broken checkout `readiness.ts` exists to prevent.
  // So there is deliberately no fallback to `publicEnv` here; the page stays
  // fail-closed until the server has answered.
  const stripeEnabled = stripeConfig?.configured === true;
  const stripePublishableKey = stripeConfig?.publishableKey ?? '';
  const stripeMode = stripeConfig?.mode ?? 'test';
  // The payment priority, decided by the server in `/api/stripe/config`: a real card
  // form when Stripe may charge, the staging-only simulator when it may not, and an
  // honest refusal otherwise. Reading one field rather than combining `configured`
  // with a simulator flag is deliberate — the order is the server's answer, so this
  // screen cannot mount a form the routes would refuse. An invoice is never an option.
  const stagingSimulatorEnabled = stripeConfig?.checkoutPaymentOption === 'staging_simulator';

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
        taxAmountOverride: authoritativeTax ?? (serverTax ?? undefined),
        destinationState: normalizedState || undefined,
      }
    ),
    [couponCode, items, shippingMethod, useLiveShippoRates, selectedShippoRate?.amount, authoritativeTax, serverTax, normalizedState]
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
      })
      // Loaded either way: a failed config fetch means "Stripe is not usable here",
      // not "keep waiting". `finally` is what lets the payment section stop saying
      // "checking…" and say the honest thing instead.
      .finally(() => setStripeConfigLoaded(true));
  }, []);

  useEffect(() => {
    // Retail is card-or-nothing. An invoice is never a retail payment method, so the
    // retail page must not hold `invoice` as its selection even while Stripe is
    // unconfigured — otherwise the submit path would still be an invoice path that
    // only the render layer hides, which is exactly the fallback this replaced.
    if (retailOnly) setPaymentMethod('stripe');
  }, [retailOnly]);

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

    // Only when there is genuinely no way to pay: the simulator is a real payment
    // path here, so blocking submit would contradict the form the page just mounted.
    if (paymentMethod === 'stripe' && !stripeEnabled && !stagingSimulatorEnabled) {
      nextErrors.coupon =
        'Card payments are not available yet. An administrator can add the Stripe keys under Admin → Settings → Service & API Keys.';
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

    // Retail pays from the payment section's own button — the Stripe Element's Pay
    // button, or the simulator's Test pay button. Reaching here means there is no
    // payment path at all, which is the one case that must say so.
    if (retailOnly) {
      if (stripeEnabled || stagingSimulatorEnabled) return;
      setError(STAGING_SIMULATOR_UNAVAILABLE_MESSAGE);
      return;
    }

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

      if (!retailOnly && paymentMethod === 'invoice') {
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
        setError('Complete card payment below.');
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

  /**
   * The staging-only simulated payment.
   *
   * The same checkout payload the card path sends, plus the simulated outcome — and
   * no card data at all. A decline is handled as the expected QA result it is: the
   * error is shown and the shopper stays on the page with their cart and their
   * reserved order, so the retry test is the same flow as the success test.
   */
  const handleStagingTestPayment = async (outcome: StagingTestOutcome) => {
    if (items.length === 0) {
      setError('Your cart is empty.');
      return;
    }
    if (!validateForm()) {
      setError('Please fix the highlighted checkout fields.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const shippingAddress = buildShippingAddress(form);
      const billingAddress = billingSameAsShipping ? shippingAddress : buildBillingAddress(form);

      const result = await submitStagingSimulatorPayment({
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
        outcome,
      });

      if (result.declined) {
        // The order is untouched and unpaid, and the cart is still full: nothing to
        // navigate to, and the shopper can pay again with the success test card.
        setError(result.message);
        return;
      }

      // The server has already marked the store's order paid, so the confirmation is
      // rendered from the store's own record rather than a client-side placeholder.
      navigate(orderConfirmationUrl(result.orderId), { state: { order: result.order } });
      await clearCart();
    } catch (err) {
      setError(getErrorMessage(err, 'The simulated payment could not be completed.'));
    } finally {
      setSubmitting(false);
    }
  };

  /** A clearly fake customer, so a QA order is never attributed to a real person. */
  const useStagingTestCustomer = () => {
    setForm((prev) => ({ ...prev, fullName: STAGING_TEST_CUSTOMER_NAME, email: STAGING_TEST_EMAIL }));
    setFieldErrors({});
  };

  if (!isLoaded || (isLoading && items.length === 0)) {
    return (
      <div className="min-h-screen bg-warm-white py-24">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <div className="bg-white rounded-2xl shadow-md p-12">
            <Loader2 size={48} className="animate-spin mx-auto mb-5 text-himalayan" />
            <h1 className="font-serif text-2xl font-bold text-charcoal mb-2">Preparing your checkout…</h1>
            <p className="text-charcoal-light text-sm">Loading your cart and securing your items from Himalayan Koh.</p>
          </div>
        </div>
      </div>
    );
  }

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
      <div className="bg-cream border-b border-himalayan-line py-6 md:py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <Link to="/products" className="inline-flex items-center gap-2 text-white/70 hover:text-white mb-4 text-sm">
            <ArrowLeft size={16} />
            Continue Shopping
          </Link>
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="font-serif text-3xl md:text-4xl font-bold text-charcoal"
          >
            Checkout
          </motion.h1>
          <p className="text-charcoal-light mt-2 max-w-2xl">
            Secure order review, shipping details, and payment preparation for Himalayan Koh products.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="max-w-7xl mx-auto px-4 sm:px-6 py-8 md:py-12">
        {/*
          Legacy checkout only. Retail has exactly one payment path, so the Payment
          section owns that message rather than two banners saying it at once.
        */}
        {!retailOnly && paymentMethod === 'stripe' && !stripeEnabled && (
          <div className="mb-6 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            <p className="font-semibold">Card payments are currently unavailable.</p>
            <p className="mt-2">Please choose another available payment method or contact our team for help.</p>
          </div>
        )}
        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <section className="bg-white rounded-2xl border border-himalayan-line/60 shadow-sm p-4 sm:p-6">
              <h2 className="font-serif text-xl font-bold text-charcoal mb-2">Contact Information</h2>
              {!user && (
                <p className="mb-5 text-sm text-charcoal-light">
                  Checking out as a guest — no account needed. You&rsquo;ll get an email confirmation and order tracking link once you pay.
                </p>
              )}
              <div className="grid md:grid-cols-2 gap-4">
                <Field label="Email address" error={fieldErrors.email}>
                  <input required type="email" name="email" autoComplete="email" value={form.email} onChange={(event) => handleChange('email', event.target.value)} placeholder="you@example.com" className={inputClass} />
                </Field>
                <Field label="Phone number">
                  <input type="tel" name="phone" autoComplete="tel" value={form.phone} onChange={(event) => handleChange('phone', event.target.value)} placeholder="(832) 224-6466" className={inputClass} />
                </Field>
              </div>
            </section>

            <section className="bg-white rounded-2xl border border-himalayan-line/60 shadow-sm p-4 sm:p-6">
              <div className="flex items-center gap-2 mb-5">
                <Truck size={20} className="text-himalayan" />
                <h2 className="font-serif text-xl font-bold text-charcoal">Shipping Address</h2>
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <Field label="Full name" error={fieldErrors.fullName}>
                  <input required name="fullName" autoComplete="shipping name" value={form.fullName} onChange={(event) => handleChange('fullName', event.target.value)} placeholder="Full name" className={inputClass} />
                </Field>
                <Field label="Address line 1" error={fieldErrors.addressLine1}>
                  <input required name="addressLine1" autoComplete="shipping address-line1" value={form.addressLine1} onChange={(event) => handleChange('addressLine1', event.target.value)} placeholder="Street address" className={inputClass} />
                </Field>
                <Field label="Address line 2">
                  <input name="addressLine2" autoComplete="shipping address-line2" value={form.addressLine2} onChange={(event) => handleChange('addressLine2', event.target.value)} placeholder="Suite, building, ranch name" className={inputClass} />
                </Field>
                <Field label="City" error={fieldErrors.city}>
                  <input required name="city" autoComplete="shipping address-level2" value={form.city} onChange={(event) => handleChange('city', event.target.value)} placeholder="City" className={inputClass} />
                </Field>
                <Field label="State" error={fieldErrors.state}>
                  <input required name="state" autoComplete="shipping address-level1" value={form.state} onChange={(event) => handleChange('state', event.target.value)} placeholder="State" className={inputClass} />
                </Field>
                <Field label="Postal code" error={fieldErrors.postalCode}>
                  <input required name="postalCode" autoComplete="shipping postal-code" value={form.postalCode} onChange={(event) => handleChange('postalCode', event.target.value)} placeholder="Postal code" className={inputClass} />
                </Field>
                <Field label="Country" error={fieldErrors.country}>
                  <input required name="country" autoComplete="shipping country-name" value={form.country} onChange={(event) => handleChange('country', event.target.value)} placeholder="Country" className={inputClass} />
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

            <section className="bg-white rounded-2xl border border-himalayan-line/60 shadow-sm p-4 sm:p-6">
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
            <section className="bg-white rounded-2xl border border-himalayan-line/60 shadow-sm p-4 sm:p-6">
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

            <section className="bg-white rounded-2xl border border-himalayan-line/60 shadow-sm p-4 sm:p-6">
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
                ) : stagingSimulatorEnabled ? (
                  <StagingTestPaymentForm
                    amountLabel={`$${totals.total.toFixed(2)}`}
                    disabled={submitting || paymentCompleting}
                    onPay={handleStagingTestPayment}
                    onUseTestCustomer={useStagingTestCustomer}
                  />
                ) : (
                  <div className="mt-5 rounded-2xl border border-himalayan/30 bg-himalayan/5 p-5 text-sm text-charcoal-light">
                    {submitting ? (
                      <span className="flex items-center gap-2"><Loader2 size={16} className="animate-spin" /> Preparing secure payment…</span>
                    ) : !stripeConfigLoaded ? (
                      <span className="flex items-center gap-2"><Loader2 size={16} className="animate-spin" /> Checking payment options…</span>
                    ) : !stripeEnabled ? (
                      <div className="space-y-1.5">
                        <p className="font-semibold text-charcoal flex items-center gap-2">
                          <CreditCard size={18} className="text-himalayan" />
                          Online payment is temporarily unavailable
                        </p>
                        <p className="text-xs text-charcoal-light">
                          Card and digital wallet payments are being configured. Please contact us to complete your purchase.
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
                  ? 'Pay securely with your card at checkout.'
                  : 'Card payments are not configured on this site.'}
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
                        ? 'Continue to enter your payment details securely.'
                        : 'Secure card payment via Stripe. Enter card number, expiry, and CVC on the next step.'
                      : 'Card payment is currently unavailable.'}
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

            <section className="bg-white rounded-2xl border border-himalayan-line/60 shadow-sm p-4 sm:p-6">
              <h2 className="font-serif text-xl font-bold text-charcoal mb-5">Delivery Notes</h2>
              <textarea
                value={form.notes}
                onChange={(event) => handleChange('notes', event.target.value)}
                aria-label="Delivery notes" name="deliveryNotes" placeholder="Gate code, delivery instructions, ranch drop-off notes, or product preferences"
                className={`${inputClass} min-h-28 resize-none`}
              />
            </section>
          </div>

          <aside className="lg:col-span-1">
            <div className="bg-white rounded-2xl border border-himalayan-line/60 shadow-sm p-4 sm:p-6 sticky top-[var(--header-height)]">
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
                    aria-label="Coupon code" name="coupon" placeholder="Enter coupon code"
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
                    ? stripeSession
                      ? 'Enter your payment details in the Payment section to confirm your order.'
                      : stripeEnabled
                        ? 'Enter your secure payment details in the Payment section to continue.'
                        : stagingSimulatorEnabled
                          ? 'Complete the Test Payment section to confirm this staging order. No real money is charged.'
                          : 'Online payment is temporarily unavailable.'
                    : paymentMethod === 'stripe' && stripeEnabled
                    ? stripeSession
                      ? 'Complete card payment below to confirm your order.'
                      : 'Step 1: Continue to payment, then enter your card details on this page.'
                    : 'Online payment is temporarily unavailable.'}
                </p>
              </div>

              {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

              {/*
                This button only renders when the order cannot be paid inline. For
                retail that means a disabled label that says what is actually wrong —
                a greyed-out "Pay $99.90" reads as a broken button rather than as
                payment not being open yet, and neither is an invoice action.
              */}
              {/*
                Hidden whenever the payment section owns the action, simulator included:
                two buttons that both look like "pay" is how one of them gets clicked for
                the wrong reason.
              */}
              {(!retailOnly || (!stripeEnabled && !stagingSimulatorEnabled)) && (
              <button
                type="submit"
                disabled={submitting || (retailOnly && !stripeEnabled && !stagingSimulatorEnabled) || (paymentMethod === 'stripe' && Boolean(stripeSession))}
                className="w-full mt-6 flex items-center justify-center gap-2 py-4 bg-himalayan hover:bg-himalayan-dark disabled:bg-gray-300 text-white font-semibold rounded-xl transition-colors shadow-lg shadow-himalayan/25"
              >
                {submitting && <Loader2 size={18} className="animate-spin" />}
                {submitting
                  ? paymentMethod === 'stripe' ? 'Preparing payment…' : 'Placing order…'
                  : retailOnly
                    ? !stripeConfigLoaded
                      ? 'Checking payment options…'
                      : !stripeEnabled
                        ? 'Online payment unavailable'
                        : stripeSession
                          ? 'Enter card details above'
                          : `Pay $${totals.total.toFixed(2)}`
                    : paymentMethod === 'stripe'
                      ? stripeSession ? 'Enter card details above' : 'Continue to payment'
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
      {error && <span role="alert" className="text-xs text-red-600 mt-1 block">{error}</span>}
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
      aria-pressed={active}
      className={`text-left rounded-xl border p-4 transition-colors ${active ? 'border-himalayan bg-himalayan/10' : 'border-gray-200 hover:border-himalayan/40'}`}
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
