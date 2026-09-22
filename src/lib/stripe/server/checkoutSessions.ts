import type { CreateOrderData } from '@/lib/supabase/api/orders';
import { getSupabaseAdmin } from './supabaseAdmin';
import { serverCreateOrder } from '@/lib/orders/serverCreateOrder';
import type { OrderWithItems } from '@/lib/supabase/database.types';

export type CheckoutSessionStatus = 'pending' | 'processing' | 'paid' | 'failed';

/** Only a signed Stripe success event may create an order. */
export function shouldFinalizeSuccessfulPayment(eventType: string): boolean {
  return eventType === 'payment_intent.succeeded';
}

export interface CheckoutSessionData extends CreateOrderData {
  userId?: string | null;
  /**
   * The WooCommerce cart this payment was started for.
   *
   * Recorded because the webhook that creates the order runs without a browser
   * and therefore without the cart cookie — this is how it finds the same cart to
   * price and empty. The value is a cart token, not the old guest session id.
   */
  cartToken?: string | null;
}

export interface CheckoutSession {
  id: string;
  status: CheckoutSessionStatus;
  paymentIntentId: string | null;
  orderId: string | null;
  data: CheckoutSessionData;
  cartFingerprint: string;
}

function mapSession(row: any): CheckoutSession {
  return {
    id: String(row.id),
    status: row.status as CheckoutSessionStatus,
    paymentIntentId: row.payment_intent_id || null,
    orderId: row.order_id || null,
    data: row.checkout_data as CheckoutSessionData,
    cartFingerprint: String(row.cart_fingerprint || ''),
  };
}

export async function createCheckoutSession(input: {
  data: CheckoutSessionData;
  cartFingerprint: string;
}): Promise<CheckoutSession> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await (supabase as any)
    .from('stripe_checkout_sessions')
    .insert({
      checkout_data: input.data,
      cart_fingerprint: input.cartFingerprint,
      status: 'pending',
    })
    .select('*')
    .single();
  if (error) throw error;
  return mapSession(data);
}

export async function attachPaymentIntent(sessionId: string, paymentIntentId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await (supabase as any)
    .from('stripe_checkout_sessions')
    .update({ payment_intent_id: paymentIntentId, updated_at: new Date().toISOString() })
    .eq('id', sessionId)
    .eq('status', 'pending');
  if (error) throw error;
}

export async function getCheckoutSession(id: string): Promise<CheckoutSession | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await (supabase as any)
    .from('stripe_checkout_sessions')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? mapSession(data) : null;
}

export async function finalizeCheckoutSession(
  sessionId: string,
  paymentIntentId: string,
  paymentMethod = 'stripe_card',
): Promise<{ order: OrderWithItems | null; alreadyFinalized: boolean }> {
  const supabase = getSupabaseAdmin();
  const session = await getCheckoutSession(sessionId);
  if (!session) throw new Error('Checkout session not found.');
  if (session.paymentIntentId && session.paymentIntentId !== paymentIntentId) {
    throw new Error('Payment does not match checkout session.');
  }
  if (session.status === 'paid' && session.orderId) {
    return { order: null, alreadyFinalized: true };
  }

  // Claim the session before creating the order. Stripe retries the same event;
  // only one delivery can move a pending session into processing.
  const { data: claimed, error: claimError } = await (supabase as any)
    .from('stripe_checkout_sessions')
    .update({ status: 'processing', payment_intent_id: paymentIntentId, updated_at: new Date().toISOString() })
    .eq('id', sessionId)
    .in('status', ['pending', 'failed'])
    .select('*')
    .maybeSingle();
  if (claimError) throw claimError;
  if (!claimed) {
    const latest = await getCheckoutSession(sessionId);
    if (latest?.status === 'paid') return { order: null, alreadyFinalized: true };
    return { order: null, alreadyFinalized: false };
  }

  try {
    const order = await serverCreateOrder(
      {
        ...session.data,
        paymentProvider: 'stripe',
        paymentMethod,
        paymentIntentId,
        paymentStatus: 'paid',
        clearCart: true,
      },
      {
        userId: session.data.userId || null,
        cartToken: session.data.cartToken || null,
      },
    );
    const { error } = await (supabase as any)
      .from('stripe_checkout_sessions')
      .update({ status: 'paid', order_id: order.id, updated_at: new Date().toISOString() })
      .eq('id', sessionId)
      .eq('status', 'processing');
    if (error) throw error;
    return { order, alreadyFinalized: false };
  } catch (error) {
    await (supabase as any)
      .from('stripe_checkout_sessions')
      .update({ status: 'failed', updated_at: new Date().toISOString() })
      .eq('id', sessionId)
      .eq('status', 'processing');
    throw error;
  }
}
