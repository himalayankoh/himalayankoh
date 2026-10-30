import type { Order } from '@/lib/commerce/types';

export async function updateAdminOrderStatus(
  accessToken: string,
  params: {
    orderId: string;
    status: Order['status'];
    paymentStatus?: Order['payment_status'];
    trackingNumber?: string;
  },
): Promise<void> {
  const response = await fetch('/api/admin/orders/update-status', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(params),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || 'Unable to update order status.');
  }
}
