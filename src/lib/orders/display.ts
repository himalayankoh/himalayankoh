export function formatPaymentMethod(method: string | null | undefined): string {
  if (!method || method === 'invoice') return 'Invoice';
  if (method === 'stripe_card' || method === 'stripe') return 'Credit / debit card';
  // Named exactly as the order stores it, and never as a card: this payment was
  // simulated on staging, so an operator reading the queue must be able to tell it
  // apart from a real one at a glance.
  if (method === 'staging_test_card') return 'Staging Test Card';
  if (method === 'stripe_klarna') return 'Klarna';
  if (method === 'stripe_afterpay_clearpay') return 'Afterpay / Clearpay';
  if (method === 'stripe_affirm') return 'Affirm';
  return method.replace(/^stripe_/, '').replace(/_/g, ' ');
}

export function formatPaymentStatus(status: string | null | undefined): string {
  if (!status) return 'Unknown';
  return status.replace(/_/g, ' ');
}
