/** Stripe + order payment metadata stored on PaymentIntent and orders table. */
export interface StripePaymentMetadata {
  email: string;
  order_id?: string;
  checkout_session_id?: string;
  coupon_code?: string;
  shipping_method?: 'standard' | 'expedited';
  cart_item_count?: string;
  integration?: string;
}

export interface StripePaymentIntentResult {
  clientSecret: string;
  paymentIntentId: string;
  amount: number;
  currency: 'usd';
  mode: 'test' | 'live';
  /** The WooCommerce order this payment is for — reserved before the payment. */
  reservedOrderId: string;
}

export interface StripeVerifyPaymentResult {
  ok: boolean;
  orderId?: string;
  paymentIntentId: string;
  // 'paid' for cards/synchronous methods; 'pending' for async BNPL (Klarna,
  // Afterpay/Clearpay, Affirm) where the webhook finalizes the order shortly after.
  paymentStatus: 'paid' | 'pending';
  pending?: boolean;
  status?: string;
  alreadyPaid?: boolean;
}

export type OrderPaymentStatus = 'pending' | 'paid' | 'failed';

export interface OrderPaymentRecord {
  orderId: string;
  paymentIntentId: string;
  paymentStatus: OrderPaymentStatus;
  paymentMethod: 'stripe_card' | 'invoice';
  paymentProvider: 'stripe' | 'invoice';
}
