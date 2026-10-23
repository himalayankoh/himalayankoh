import { sendWholesaleInquiryEmails } from '@/lib/email/wholesaleInquiry';
import { siteBaseUrl } from '@/lib/email/sendEmail';
import { getWholesaleRecord, upsertWholesaleRecord } from './store';

/** Controlled admin resend, using the original snapshots rather than today's prices. */
export async function resendInquiryNotification(id: number, actor: string) {
  const quote = await getWholesaleRecord('quotes', id);
  const account = await getWholesaleRecord('accounts', Number(quote.account_id));
  const lines = Array.isArray(quote.lines) ? quote.lines as Record<string, unknown>[] : [];
  if (!lines.length) throw new Error('This inquiry has no stored product lines.');
  const shipping = quote.shipping_address as Record<string, unknown> | null;
  const reference = String(quote.ref || `HK-WS-Q${String(id).padStart(5, '0')}`);
  const snapshots = lines.map((line) => ({
    name: String(line.name || ''), sku: String(line.wholesaleSku || ''), units: Number(line.units),
    unitPrice: typeof line.unitPriceIndicative === 'number' ? line.unitPriceIndicative : null,
  }));
  const result = await sendWholesaleInquiryEmails({
    reference,
    buyer: { businessName: String(account.company || ''), contactName: String(account.contact_name || ''), email: String(account.email || ''), phone: String(account.phone || '') },
    lines: snapshots, currency: String(quote.currency || 'USD'),
    estimatedMerchandise: snapshots.every((line) => line.unitPrice !== null)
      ? Math.round(snapshots.reduce((sum, line) => sum + line.units * (line.unitPrice ?? 0), 0) * 100) / 100 : null,
    shippingAddress: String(shipping?.address || account.billing_address || ''), notes: String(quote.notes || ''),
    adminUrl: `${siteBaseUrl()}/admin/wholesale/inquiries`,
  });
  await upsertWholesaleRecord('audit', {
    at: new Date().toISOString(), actor, entity: 'quotes', entity_id: id,
    action: result.adminNotified && result.buyerAcknowledged ? 'inquiry_email_accepted' : 'inquiry_email_failed',
    detail: { ...result, reference, operation: 'admin_resend' },
  }, { actor });
  return result;
}
