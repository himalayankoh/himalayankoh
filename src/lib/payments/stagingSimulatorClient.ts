/**
 * The browser's half of the staging payment simulator.
 *
 * The typed test card is classified **here**, in `classifyTestCard`, and only the
 * resulting outcome travels — so no card number, expiry or CVC is ever put in a
 * request body. A decline is a normal answer, not an exception: `402` comes back as
 * `{ declined: true }`, because "the test card was declined" is an expected result of
 * a QA run rather than a failure of the app.
 */

import type { CartItem } from '../../store/cartStore';
import type { OrderWithItems } from '../commerce/types';
import { getCustomerAccessToken } from '../auth/customerClient';
import { readApiError } from '../stripe/errors';
import type { StagingTestOutcome } from './stagingSimulator';

export interface StagingSimulatorPayload {
  email: string;
  phone?: string;
  shippingAddress: {
    fullName: string;
    addressLine1: string;
    addressLine2?: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  billingAddress?: StagingSimulatorPayload['shippingAddress'];
  couponCode?: string;
  shippingMethod?: 'standard' | 'expedited';
  shippoRateId?: string;
  shippingCarrier?: string;
  shippingService?: string;
  notes?: string;
  userId?: string;
  /** Display only — the server prices the order from the cart, not from here. */
  items: Pick<CartItem, 'id' | 'name' | 'quantity' | 'price' | 'grainSize'>[];
  /** The only fact the simulator invents. Never derived from a card number here. */
  outcome: StagingTestOutcome;
}

export type StagingSimulatorResult =
  | {
      declined: false;
      order: OrderWithItems;
      orderId: string;
      orderNumber: string;
      transactionRef: string;
      paymentMethodTitle: string;
    }
  | { declined: true; orderId: string; orderNumber: string; message: string };

export async function submitStagingSimulatorPayment(
  payload: StagingSimulatorPayload,
): Promise<StagingSimulatorResult> {
  // The signed-in customer's own session, when there is one — identical to the card
  // path, so a QA order belongs to the account that placed it. A guest is fine.
  const token = getCustomerAccessToken();
  const response = await fetch('/api/payments/staging-simulator', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      email: payload.email,
      phone: payload.phone,
      shippingAddress: payload.shippingAddress,
      billingAddress: payload.billingAddress,
      couponCode: payload.couponCode,
      shippingMethod: payload.shippingMethod,
      shippoRateId: payload.shippoRateId,
      shippingCarrier: payload.shippingCarrier,
      shippingService: payload.shippingService,
      notes: payload.notes,
      userId: payload.userId,
      outcome: payload.outcome,
      items: payload.items.map((item) => ({
        id: item.id,
        name: item.name,
        quantity: item.quantity,
        price: item.price,
        grainSize: item.grainSize,
      })),
    }),
  });

  if (response.status === 402) {
    const body = (await response.json().catch(() => ({}))) as {
      message?: string;
      error?: string;
      orderId?: string;
      orderNumber?: string;
    };
    return {
      declined: true,
      orderId: body.orderId ?? '',
      orderNumber: body.orderNumber ?? '',
      message: body.message || body.error || 'Test payment declined. No money was charged.',
    };
  }

  if (!response.ok) {
    throw new Error(await readApiError(response, 'The simulated payment could not be completed.'));
  }

  return response.json() as Promise<StagingSimulatorResult>;
}
