import {
  sendWholesaleInquiryEmails,
  sendWholesaleQuoteApprovalEmail,
  sendWholesaleQuoteDeclinedEmail,
  type WholesaleQuoteApprovalLine,
} from '@/lib/email/wholesaleInquiry';
import { siteBaseUrl } from '@/lib/email/sendEmail';
import { getWholesaleRecord, upsertWholesaleRecord } from './store';

/** Controlled admin resend, using the original snapshots rather than today's prices. */
export async function resendInquiryNotification(id: number, actor: string) {
  const quote = await getWholesaleRecord('quotes', id);
  let account: Record<string, unknown> | null = null;
  if (Number(quote.account_id) > 0) {
    try {
      account = await getWholesaleRecord('accounts', Number(quote.account_id));
    } catch {
      account = null;
    }
  }
  const contact =
    quote.buyer_contact && typeof quote.buyer_contact === 'object'
      ? (quote.buyer_contact as Record<string, unknown>)
      : null;

  const buyerEmail = String(contact?.email || account?.email || '').trim();
  const buyerBusiness = String(contact?.business || account?.company || 'Wholesale Buyer').trim();
  const buyerContactName = String(contact?.name || account?.contact_name || buyerBusiness).trim();
  const buyerPhone = String(contact?.phone || account?.phone || '').trim();

  const lines = Array.isArray(quote.lines) ? (quote.lines as Record<string, unknown>[]) : [];
  if (!lines.length) throw new Error('This inquiry has no stored product lines.');
  const shipping = quote.shipping_address as Record<string, unknown> | null;
  const reference = String(quote.ref || `HK-WS-Q${String(id).padStart(5, '0')}`);
  const snapshots = lines.map((line) => ({
    name: String(line.name || ''),
    sku: String(line.wholesaleSku || ''),
    units: Number(line.units),
    unitPrice: typeof line.unitPriceIndicative === 'number' ? line.unitPriceIndicative : null,
  }));
  const result = await sendWholesaleInquiryEmails({
    reference,
    buyer: {
      businessName: buyerBusiness,
      contactName: buyerContactName,
      email: buyerEmail,
      phone: buyerPhone,
    },
    lines: snapshots,
    currency: String(quote.currency || 'USD'),
    estimatedMerchandise: snapshots.every((line) => line.unitPrice !== null)
      ? Math.round(snapshots.reduce((sum, line) => sum + line.units * (line.unitPrice ?? 0), 0) * 100) / 100
      : null,
    shippingAddress: String(shipping?.address || account?.billing_address || ''),
    notes: String(quote.notes || ''),
    adminUrl: `${siteBaseUrl()}/admin/wholesale/inquiries`,
  });
  await upsertWholesaleRecord(
    'audit',
    {
      at: new Date().toISOString(),
      actor,
      entity: 'quotes',
      entity_id: id,
      action: result.adminNotified && result.buyerAcknowledged ? 'inquiry_email_accepted' : 'inquiry_email_failed',
      detail: { ...result, reference, operation: 'admin_resend' },
    },
    { actor }
  );
  return result;
}

/** Controlled admin dispatch for Quotation Approval or Decline */
export async function sendQuoteDecisionNotification(
  id: number,
  decision: 'approve' | 'decline',
  actor: string,
  options?: { reason?: string; isCounterOffer?: boolean; counterNote?: string }
) {
  const quote = await getWholesaleRecord('quotes', id);
  let account: Record<string, unknown> | null = null;
  if (Number(quote.account_id) > 0) {
    try {
      account = await getWholesaleRecord('accounts', Number(quote.account_id));
    } catch {
      account = null;
    }
  }
  const contact =
    quote.buyer_contact && typeof quote.buyer_contact === 'object'
      ? (quote.buyer_contact as Record<string, unknown>)
      : null;

  const buyerEmail = String(contact?.email || account?.email || '').trim();
  const buyerBusiness = String(contact?.business || account?.company || 'Wholesale Buyer').trim();
  const buyerContactName = String(contact?.name || account?.contact_name || buyerBusiness).trim();
  const buyerPhone = String(contact?.phone || account?.phone || '').trim();

  if (!buyerEmail) {
    throw new Error('This quotation does not have a valid buyer email address.');
  }

  const reference = String(quote.ref || `HK-WS-Q${String(id).padStart(5, '0')}`);
  const portalUrl = `${siteBaseUrl()}/wholesale/portal`;

  if (decision === 'approve') {
    const lines = Array.isArray(quote.lines) ? (quote.lines as Record<string, unknown>[]) : [];
    const quotedLines: WholesaleQuoteApprovalLine[] = lines.map((line) => {
      const units = Number(line.units) || 0;
      const unitPrice =
        typeof line.unitPriceIndicative === 'number'
          ? line.unitPriceIndicative
          : typeof line.unitPrice === 'number'
            ? line.unitPrice
            : 0;
      const subtotal =
        typeof line.lineSubtotal === 'number'
          ? line.lineSubtotal
          : Math.round(units * unitPrice * 100) / 100;
      const boxes = typeof line.boxes === 'number' ? line.boxes : typeof line.cartons === 'number' ? line.cartons : undefined;
      return {
        name: String(line.name || 'Wholesale Product'),
        sku: String(line.wholesaleSku || line.sku || ''),
        units,
        boxes,
        unitPrice,
        subtotal,
      };
    });

    const quotedTotal = Number(quote.sell_total) || quotedLines.reduce((sum, l) => sum + l.subtotal, 0);
    const validUntil = String(quote.valid_until || new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10));
    const shipping = quote.shipping_address as Record<string, unknown> | null;

    const result = await sendWholesaleQuoteApprovalEmail({
      reference,
      buyer: {
        businessName: buyerBusiness,
        contactName: buyerContactName,
        email: buyerEmail,
        phone: buyerPhone,
      },
      lines: quotedLines,
      currency: String(quote.currency || 'USD'),
      quotedTotal,
      validUntil,
      deliveryMethod: String(quote.incoterm || 'FOB Houston Warehouse Dispatch'),
      destinationAddress: String(shipping?.address || quote.destination || account?.billing_address || ''),
      paymentUrl: quote.external_payment_url ? String(quote.external_payment_url) : undefined,
      invoiceUrl: quote.invoice_url ? String(quote.invoice_url) : undefined,
      portalUrl,
      notes: quote.notes ? String(quote.notes) : undefined,
      isCounterOffer: options?.isCounterOffer,
      counterNote: options?.counterNote,
    });

    await upsertWholesaleRecord(
      'audit',
      {
        at: new Date().toISOString(),
        actor,
        entity: 'quotes',
        entity_id: id,
        action: result.buyerNotified ? (options?.isCounterOffer ? 'quote_counter_offer_email_sent' : 'quote_approved_email_sent') : (options?.isCounterOffer ? 'quote_counter_offer_email_failed' : 'quote_approved_email_failed'),
        detail: { ...result, reference, operation: options?.isCounterOffer ? 'admin_quote_counter_offer' : 'admin_quote_approve', quotedTotal, validUntil, isCounterOffer: options?.isCounterOffer, counterNote: options?.counterNote },
      },
      { actor }
    );

    return result;
  } else {
    // Decline
    const reason = options?.reason ? String(options.reason).trim() : undefined;
    const result = await sendWholesaleQuoteDeclinedEmail({
      reference,
      buyer: {
        businessName: buyerBusiness,
        contactName: buyerContactName,
        email: buyerEmail,
      },
      reason,
      portalUrl,
    });

    await upsertWholesaleRecord(
      'audit',
      {
        at: new Date().toISOString(),
        actor,
        entity: 'quotes',
        entity_id: id,
        action: result.buyerNotified ? 'quote_decline_email_sent' : 'quote_decline_email_failed',
        detail: { ...result, reference, operation: 'admin_quote_decline', reason },
      },
      { actor }
    );

    return result;
  }
}
