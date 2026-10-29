/**
 * The wholesale inquiry notification.
 *
 * ## Why this is a mail of its own
 *
 * A retail order is a payment; a wholesale inquiry is a conversation. The trade desk
 * needs the reference, the buyer's business, the lines and quantities, the indicative
 * value and the buyer's own words, in one message it can answer by replying to it. So
 * the notification is sent **from** the wholesale mailbox **with `Reply-To` set to the
 * buyer** — the team answers the buyer without copying an address by hand, and the
 * message still passes SPF/DKIM because it is not forged as the buyer.
 *
 * ## What it is not
 *
 * It is not the record. The inquiry is stored first, in full, and this mail is a
 * notification *about* that row: if delivery fails the inquiry still exists and the
 * console shows the failure. That ordering is the only way "never silently lose an
 * inquiry" can be true.
 *
 * ## Recipient
 *
 * `ws@himalayankoh.com`, overridable with `WHOLESALE_INQUIRY_EMAIL`. The address is
 * verified by shape before use; a typo in an environment variable must not send a
 * buyer's commercial details to a stranger.
 */

import { sendEmail } from './sendEmail';

export interface InquiryLine {
  name: string;
  sku: string;
  units: number;
  /** The price the buyer was shown for one unit, in `currency`. Null when no tier exists. */
  unitPrice: number | null;
}

export interface WholesaleInquiryInput {
  reference: string;
  buyer: {
    businessName: string;
    contactName: string;
    email: string;
    phone?: string;
  };
  lines: InquiryLine[];
  currency: string;
  /** The sum of the lines at the prices shown, or null when a line has no price. */
  estimatedMerchandise: number | null;
  shippingAddress?: string;
  destinationPort?: string;
  notes?: string;
  /** Absolute link to the inquiry in the admin console. */
  adminUrl: string;
}

const EMAIL_SHAPE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Where a wholesale inquiry notification goes. Falls back to the documented mailbox. */
export function wholesaleInquiryRecipient(): string {
  const configured = (process.env.WHOLESALE_INQUIRY_EMAIL || '').trim();
  if (configured && EMAIL_SHAPE.test(configured)) return configured;
  return 'ws@himalayankoh.com';
}

/** The address a buyer sees as the sender of wholesale mail. */
export function wholesaleSender(): string {
  const configured = (process.env.WHOLESALE_FROM_EMAIL || '').trim();
  if (configured && EMAIL_SHAPE.test(configured)) return configured;
  return 'ws@himalayankoh.com';
}

function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Money in a stable form: two decimals, thousands separators, no locale surprises. */
export function formatMoney(value: number, currency: string): string {
  const amount = Number.isFinite(value) ? value : 0;
  return `${currency || 'USD'} ${amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** The lines and total as both the HTML and the text body need them. */
function lineRows(input: WholesaleInquiryInput): Array<{
  name: string;
  sku: string;
  units: number;
  unitPrice: number | null;
  subtotal: number | null;
}> {
  return input.lines.map((line) => ({
    name: line.name,
    sku: line.sku,
    units: line.units,
    unitPrice: line.unitPrice,
    subtotal: line.unitPrice === null ? null : Number((line.unitPrice * line.units).toFixed(2)),
  }));
}

/** The subject, so the console's mail list groups one inquiry's mail together. */
export function inquirySubject(input: WholesaleInquiryInput): string {
  return `Wholesale inquiry ${input.reference} — ${input.buyer.businessName}`;
}

/** The HTML body of the trade-desk notification. */
export function buildInquiryHtml(input: WholesaleInquiryInput): string {
  const rows = lineRows(input)
    .map(
      (line) => `<tr>
        <td style="padding:6px 8px;border-bottom:1px solid #eee">${escapeHtml(line.name)}${
          line.sku ? `<br /><span style="color:#777;font-size:12px">${escapeHtml(line.sku)}</span>` : ''
        }</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${line.units}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${
          line.unitPrice === null ? 'no tier price' : escapeHtml(formatMoney(line.unitPrice, input.currency))
        }</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${
          line.subtotal === null ? '—' : escapeHtml(formatMoney(line.subtotal, input.currency))
        }</td>
      </tr>`
    )
    .join('');

  return `<div style="font-family:Arial,Helvetica,sans-serif;color:#2d2722;line-height:1.55;max-width:720px">
  <h2 style="margin:0 0 4px">Wholesale inquiry ${escapeHtml(input.reference)}</h2>
  <p style="margin:0 0 16px;color:#777">Submitted ${escapeHtml(new Date().toISOString().slice(0, 16).replace('T', ' '))} UTC · this is an inquiry, not a paid order.</p>

  <h3 style="margin:18px 0 6px;font-size:15px">Buyer</h3>
  <p style="margin:0">
    <strong>${escapeHtml(input.buyer.businessName)}</strong><br />
    ${escapeHtml(input.buyer.contactName)}<br />
    ${escapeHtml(input.buyer.email)}${input.buyer.phone ? `<br />${escapeHtml(input.buyer.phone)}` : ''}
  </p>

  <h3 style="margin:18px 0 6px;font-size:15px">Requested lines</h3>
  <table style="width:100%;border-collapse:collapse;font-size:14px">
    <thead><tr>
      <th style="text-align:left;padding:6px 8px;border-bottom:2px solid #ddd">Product</th>
      <th style="text-align:right;padding:6px 8px;border-bottom:2px solid #ddd">Units</th>
      <th style="text-align:right;padding:6px 8px;border-bottom:2px solid #ddd">Unit price (indicative)</th>
      <th style="text-align:right;padding:6px 8px;border-bottom:2px solid #ddd">Line subtotal</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <p style="margin:10px 0 0;font-size:15px">
    <strong>Estimated merchandise total:</strong> ${input.estimatedMerchandise === null ? 'not priced' : escapeHtml(formatMoney(input.estimatedMerchandise, input.currency))}
  </p>
  <p style="margin:6px 0 0;color:#777;font-size:13px">
    Indicative only. Final shipping, applicable taxes, availability and payment terms are confirmed by the trade desk.
  </p>

  <h3 style="margin:18px 0 6px;font-size:15px">Shipping / destination</h3>
  <p style="margin:0">${escapeHtml(input.shippingAddress || 'Not supplied')}${
    input.destinationPort ? `<br />Preferred port: ${escapeHtml(input.destinationPort)}` : ''
  }</p>

  ${
    input.notes
      ? `<h3 style="margin:18px 0 6px;font-size:15px">Buyer notes</h3><p style="margin:0;white-space:pre-wrap">${escapeHtml(
          input.notes
        )}</p>`
      : ''
  }

  <p style="margin:22px 0 0">
    <a href="${escapeHtml(input.adminUrl)}" style="background:#8d4133;color:#fff;padding:10px 18px;border-radius:999px;text-decoration:none;font-weight:600">
      Open in the admin console
    </a>
  </p>
  <p style="margin:14px 0 0;color:#777;font-size:12px">
    Replying to this email answers ${escapeHtml(input.buyer.contactName)} directly.
  </p>
</div>`;
}

/** The plain-text body, for clients that do not render HTML. */
export function buildInquiryText(input: WholesaleInquiryInput): string {
  const lines = lineRows(input)
    .map(
      (line) =>
        `- ${line.name}${line.sku ? ` (${line.sku})` : ''}: ${line.units} units @ ${
          line.unitPrice === null ? 'no tier price' : formatMoney(line.unitPrice, input.currency)
        } = ${line.subtotal === null ? '—' : formatMoney(line.subtotal, input.currency)}`
    )
    .join('\n');

  return [
    `Wholesale inquiry ${input.reference}`,
    '',
    `Buyer: ${input.buyer.businessName}`,
    `Contact: ${input.buyer.contactName}`,
    `Email: ${input.buyer.email}`,
    input.buyer.phone ? `Phone: ${input.buyer.phone}` : '',
    '',
    'Lines:',
    lines || '(none)',
    '',
    `Estimated merchandise total: ${
      input.estimatedMerchandise === null ? 'not priced' : formatMoney(input.estimatedMerchandise, input.currency)
    }`,
    'Indicative only — shipping, taxes, availability and payment terms are confirmed by the trade desk.',
    '',
    `Shipping: ${input.shippingAddress || 'Not supplied'}`,
    input.destinationPort ? `Preferred port: ${input.destinationPort}` : '',
    '',
    input.notes ? `Buyer notes:\n${input.notes}` : '',
    '',
    `Open in the admin console: ${input.adminUrl}`,
    `Reply to this email to answer ${input.buyer.contactName}.`,
  ]
    .filter((line) => line !== '')
    .join('\n');
}

/** The buyer's acknowledgement. Short, and it promises only a reply. */
export function buildAcknowledgementHtml(input: WholesaleInquiryInput): string {
  return `<div style="font-family:Arial,Helvetica,sans-serif;color:#2d2722;line-height:1.55;max-width:640px">
  <h2 style="margin:0 0 10px">We have your wholesale inquiry</h2>
  <p>Hello ${escapeHtml(input.buyer.contactName)},</p>
  <p>
    Thank you for your inquiry. Your reference is <strong>${escapeHtml(input.reference)}</strong>.
    Our wholesale team will confirm availability, shipping and payment terms, then send you a quotation.
  </p>
  <p style="color:#777;font-size:13px">
    The prices you saw are indicative and are not a quotation. No payment has been taken.
  </p>
  <p>Himalayan Koh — Wholesale Department<br />ws@himalayankoh.com</p>
</div>`;
}

export interface InquiryDeliveryResult {
  /** The trade-desk notification. */
  adminNotified: boolean;
  /** The buyer's acknowledgement. */
  buyerAcknowledged: boolean;
  error: string;
}

/**
 * Sends both messages.
 *
 * Each is independent: a failure to acknowledge the buyer does not stop the trade desk
 * being told, and vice versa. The caller records the result; nothing here throws,
 * because a mail outage must never turn a stored inquiry into an error response.
 */
export async function sendWholesaleInquiryEmails(input: WholesaleInquiryInput): Promise<InquiryDeliveryResult> {
  const recipient = wholesaleInquiryRecipient();
  const from = wholesaleSender();
  const subject = inquirySubject(input);

  let adminNotified = false;
  let error = '';

  try {
    adminNotified = await sendEmail({
      to: recipient,
      subject,
      html: buildInquiryHtml(input),
      text: buildInquiryText(input),
      from: `Himalayan Koh Wholesale <${from}>`,
      fromName: 'Himalayan Koh Wholesale',
      replyTo: input.buyer.email,
    });
    if (!adminNotified) error = `The trade desk notification to ${recipient} was not delivered.`;
  } catch (sendError) {
    error = sendError instanceof Error ? sendError.message : 'The trade desk notification failed.';
  }

  let buyerAcknowledged = false;
  try {
    buyerAcknowledged = await sendEmail({
      to: input.buyer.email,
      subject: `We have your wholesale inquiry ${input.reference}`,
      html: buildAcknowledgementHtml(input),
      text: `Hello ${input.buyer.contactName},\n\nWe have your wholesale inquiry ${input.reference}. Our wholesale team will confirm availability, shipping and payment terms, then send a quotation.\n\nThe prices you saw are indicative and are not a quotation. No payment has been taken.\n\nHimalayan Koh — Wholesale Department\nws@himalayankoh.com`,
      from: `Himalayan Koh Wholesale <${from}>`,
      fromName: 'Himalayan Koh Wholesale',
      replyTo: from,
    });
  } catch {
    buyerAcknowledged = false;
  }

  return { adminNotified, buyerAcknowledged, error };
}
/* ------------------------------------------------------------------ */
/* Quotation Decision Emails (Approval / Decline)                     */
/* ------------------------------------------------------------------ */

export interface WholesaleQuoteApprovalLine {
  name: string;
  sku: string;
  units: number;
  boxes?: number;
  unitPrice: number;
  subtotal: number;
}

export interface WholesaleQuoteApprovalInput {
  reference: string;
  buyer: {
    businessName: string;
    contactName: string;
    email: string;
    phone?: string;
  };
  lines: WholesaleQuoteApprovalLine[];
  currency: string;
  quotedTotal: number;
  validUntil: string;
  deliveryMethod?: string;
  destinationAddress?: string;
  paymentUrl?: string;
  invoiceUrl?: string;
  portalUrl: string;
  notes?: string;
}

export interface WholesaleQuoteDeclineInput {
  reference: string;
  buyer: {
    businessName: string;
    contactName: string;
    email: string;
  };
  reason?: string;
  portalUrl: string;
}

export function buildQuoteApprovalHtml(input: WholesaleQuoteApprovalInput): string {
  const lineRows = input.lines
    .map(
      (l) => `
    <tr>
      <td style="padding:8px 10px;border-bottom:1px solid #eee;font-size:13px">
        <strong>${escapeHtml(l.name)}</strong>
        ${l.sku ? `<br/><span style="color:#888;font-size:11px">${escapeHtml(l.sku)}</span>` : ''}
      </td>
      <td style="padding:8px 10px;border-bottom:1px solid #eee;font-size:13px;text-align:center">
        ${l.boxes ? `<strong>${l.boxes}</strong> boxes<br/><span style="color:#888;font-size:11px">(${l.units} pcs)</span>` : `${l.units} units`}
      </td>
      <td style="padding:8px 10px;border-bottom:1px solid #eee;font-size:13px;text-align:right">
        ${escapeHtml(formatMoney(l.unitPrice, input.currency))}
      </td>
      <td style="padding:8px 10px;border-bottom:1px solid #eee;font-size:13px;text-align:right;font-weight:600">
        ${escapeHtml(formatMoney(l.subtotal, input.currency))}
      </td>
    </tr>
  `
    )
    .join('');

  return `<div style="font-family:Arial,Helvetica,sans-serif;color:#2d2722;line-height:1.55;max-width:640px;margin:0 auto;padding:24px;border:1px solid #e7ded5;border-radius:12px;background:#ffffff">
  <div style="border-bottom:2px solid #8d4133;padding-bottom:12px;margin-bottom:20px">
    <h2 style="margin:0;color:#8d4133;font-size:20px;letter-spacing:-0.02em">Himalayan Koh Wholesale Quotation</h2>
    <p style="margin:4px 0 0;font-size:13px;color:#777">Quotation Reference: <strong>${escapeHtml(input.reference)}</strong></p>
  </div>

  <p style="margin:0 0 14px;font-size:14px">Hello ${escapeHtml(input.buyer.contactName || input.buyer.businessName)},</p>
  <p style="margin:0 0 16px;font-size:14px">
    Thank you for your interest in Himalayan Koh. Our trade desk has reviewed your wholesale inquiry and issued your official quotation below.
  </p>

  <div style="background:#fbf8f5;border:1px solid #ebd9cf;border-radius:8px;padding:14px;margin-bottom:20px">
    <table style="width:100%;font-size:13px;border-collapse:collapse">
      <tr>
        <td style="color:#666;padding:4px 0">Quoted Total:</td>
        <td style="font-weight:bold;font-size:16px;color:#8d4133;text-align:right;padding:4px 0">${escapeHtml(formatMoney(input.quotedTotal, input.currency))}</td>
      </tr>
      <tr>
        <td style="color:#666;padding:4px 0">Valid Through:</td>
        <td style="font-weight:600;text-align:right;padding:4px 0">${escapeHtml(input.validUntil)}</td>
      </tr>
      ${input.deliveryMethod ? `<tr><td style="color:#666;padding:4px 0">Delivery Basis:</td><td style="text-align:right;padding:4px 0">${escapeHtml(input.deliveryMethod)}</td></tr>` : ''}
      ${input.destinationAddress ? `<tr><td style="color:#666;padding:4px 0">Destination:</td><td style="text-align:right;padding:4px 0">${escapeHtml(input.destinationAddress)}</td></tr>` : ''}
    </table>
  </div>

  <h3 style="margin:0 0 8px;font-size:13px;color:#2d2722;text-transform:uppercase;letter-spacing:0.05em">Quotation Line Items</h3>
  <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:20px">
    <thead>
      <tr style="background:#f4efe9">
        <th style="text-align:left;padding:8px 10px;border-bottom:1px solid #ddd">Product</th>
        <th style="text-align:center;padding:8px 10px;border-bottom:1px solid #ddd">Boxes / Qty</th>
        <th style="text-align:right;padding:8px 10px;border-bottom:1px solid #ddd">Unit Price</th>
        <th style="text-align:right;padding:8px 10px;border-bottom:1px solid #ddd">Total</th>
      </tr>
    </thead>
    <tbody>${lineRows}</tbody>
    <tfoot>
      <tr>
        <td colspan="3" style="text-align:right;padding:10px 8px;font-weight:bold;font-size:14px">Final Quoted Total:</td>
        <td style="text-align:right;padding:10px 8px;font-weight:bold;font-size:15px;color:#8d4133">${escapeHtml(formatMoney(input.quotedTotal, input.currency))}</td>
      </tr>
    </tfoot>
  </table>

  ${input.paymentUrl || input.invoiceUrl ? `
    <div style="margin:22px 0;text-align:center">
      <a href="${escapeHtml(input.paymentUrl || input.invoiceUrl || '')}" style="display:inline-block;background:#8d4133;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 24px;border-radius:8px;font-size:14px">
        Pay & Confirm Order Online
      </a>
    </div>
  ` : `
    <div style="margin:22px 0;text-align:center">
      <a href="${escapeHtml(input.portalUrl)}" style="display:inline-block;background:#8d4133;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 24px;border-radius:8px;font-size:14px">
        View & Accept in Wholesale Portal
      </a>
    </div>
  `}

  <p style="margin:20px 0 0;font-size:12px;color:#777;border-top:1px solid #eee;padding-top:12px">
    If you have any questions or require revisions, reply directly to this email or contact <a href="mailto:ws@himalayankoh.com" style="color:#8d4133">ws@himalayankoh.com</a>.<br/>
    Himalayan Koh Wholesale Department · Houston, TX
  </p>
</div>`;
}

export function buildQuoteApprovalText(input: WholesaleQuoteApprovalInput): string {
  const lines = input.lines
    .map(
      (l) =>
        `- ${l.name}${l.sku ? ` (${l.sku})` : ''}: ${l.boxes ? `${l.boxes} boxes (${l.units} pcs)` : `${l.units} units`} @ ${formatMoney(l.unitPrice, input.currency)} = ${formatMoney(l.subtotal, input.currency)}`
    )
    .join('\n');

  return [
    `Himalayan Koh Wholesale Quotation ${input.reference}`,
    '',
    `Hello ${input.buyer.contactName || input.buyer.businessName},`,
    '',
    `Your wholesale quotation ${input.reference} has been approved by our trade desk.`,
    '',
    `Final Quoted Total: ${formatMoney(input.quotedTotal, input.currency)}`,
    `Valid Through: ${input.validUntil}`,
    input.deliveryMethod ? `Delivery Basis: ${input.deliveryMethod}` : '',
    input.destinationAddress ? `Destination: ${input.destinationAddress}` : '',
    '',
    'Line items:',
    lines,
    '',
    input.paymentUrl ? `Pay online: ${input.paymentUrl}` : '',
    `Access your Wholesale Portal: ${input.portalUrl}`,
    '',
    'Himalayan Koh Wholesale Department',
    'ws@himalayankoh.com',
  ]
    .filter((line) => line !== '')
    .join('\n');
}

export async function sendWholesaleQuoteApprovalEmail(
  input: WholesaleQuoteApprovalInput
): Promise<{ buyerNotified: boolean; adminNotified: boolean; error: string }> {
  const recipient = wholesaleInquiryRecipient();
  const from = wholesaleSender();
  const subject = `Official Wholesale Quotation ${input.reference} — Himalayan Koh`;

  let buyerNotified = false;
  let adminNotified = false;
  let error = '';

  try {
    buyerNotified = await sendEmail({
      to: input.buyer.email,
      subject,
      html: buildQuoteApprovalHtml(input),
      text: buildQuoteApprovalText(input),
      from: `Himalayan Koh Wholesale <${from}>`,
      fromName: 'Himalayan Koh Wholesale',
      replyTo: from,
    });
    if (!buyerNotified) {
      error = 'Delivery to buyer email could not be completed.';
    }
  } catch (err) {
    error = err instanceof Error ? err.message : 'Failed to send quotation to buyer.';
  }

  try {
    adminNotified = await sendEmail({
      to: recipient,
      subject: `[ISSUED] Quotation ${input.reference} sent to ${input.buyer.businessName}`,
      html: buildQuoteApprovalHtml(input),
      text: buildQuoteApprovalText(input),
      from: `Himalayan Koh Wholesale <${from}>`,
      fromName: 'Himalayan Koh Wholesale Desk',
      replyTo: input.buyer.email,
    });
  } catch {
    adminNotified = false;
  }

  return { buyerNotified, adminNotified, error };
}

export function buildQuoteDeclinedHtml(input: WholesaleQuoteDeclineInput): string {
  return `<div style="font-family:Arial,Helvetica,sans-serif;color:#2d2722;line-height:1.55;max-width:640px;margin:0 auto;padding:24px;border:1px solid #e7ded5;border-radius:12px;background:#ffffff">
  <div style="border-bottom:2px solid #8d4133;padding-bottom:12px;margin-bottom:20px">
    <h2 style="margin:0;color:#8d4133;font-size:20px;letter-spacing:-0.02em">Wholesale Inquiry Update</h2>
    <p style="margin:4px 0 0;font-size:13px;color:#777">Inquiry Reference: <strong>${escapeHtml(input.reference)}</strong></p>
  </div>

  <p style="margin:0 0 14px;font-size:14px">Hello ${escapeHtml(input.buyer.contactName || input.buyer.businessName)},</p>
  <p style="margin:0 0 14px;font-size:14px">
    Thank you for submitting inquiry <strong>${escapeHtml(input.reference)}</strong> for Himalayan Koh wholesale products.
  </p>
  <p style="margin:0 0 14px;font-size:14px">
    After review by our trade desk, we are unable to fulfill or proceed with this quotation at this time.
  </p>

  ${input.reason ? `
    <div style="background:#fbf8f5;border-left:3px solid #8d4133;padding:12px 14px;margin:16px 0;border-radius:0 6px 6px 0">
      <strong style="font-size:13px;color:#8d4133">Note from Trade Desk:</strong>
      <p style="margin:4px 0 0;font-size:13px;color:#444">${escapeHtml(input.reason)}</p>
    </div>
  ` : ''}

  <p style="margin:0 0 14px;font-size:14px">
    If you would like to adjust your required quantities or discuss alternative delivery arrangements, our team remains at your service.
  </p>

  <p style="margin:20px 0 0;font-size:12px;color:#777;border-top:1px solid #eee;padding-top:12px">
    Himalayan Koh Wholesale Department · <a href="mailto:ws@himalayankoh.com" style="color:#8d4133">ws@himalayankoh.com</a>
  </p>
</div>`;
}

export function buildQuoteDeclinedText(input: WholesaleQuoteDeclineInput): string {
  return [
    `Wholesale Inquiry Update ${input.reference}`,
    '',
    `Hello ${input.buyer.contactName || input.buyer.businessName},`,
    '',
    `Thank you for submitting inquiry ${input.reference} for Himalayan Koh wholesale products.`,
    'After review by our trade desk, we are unable to fulfill or proceed with this quotation at this time.',
    input.reason ? `\nNote from Trade Desk: ${input.reason}\n` : '',
    'If you would like to adjust your required quantities or discuss alternative delivery arrangements, please feel free to reach out.',
    '',
    'Himalayan Koh Wholesale Department',
    'ws@himalayankoh.com',
  ]
    .filter((line) => line !== '')
    .join('\n');
}

export async function sendWholesaleQuoteDeclinedEmail(
  input: WholesaleQuoteDeclineInput
): Promise<{ buyerNotified: boolean; error: string }> {
  const from = wholesaleSender();
  const subject = `Update regarding Wholesale Inquiry ${input.reference} — Himalayan Koh`;

  let buyerNotified = false;
  let error = '';

  try {
    buyerNotified = await sendEmail({
      to: input.buyer.email,
      subject,
      html: buildQuoteDeclinedHtml(input),
      text: buildQuoteDeclinedText(input),
      from: `Himalayan Koh Wholesale <${from}>`,
      fromName: 'Himalayan Koh Wholesale',
      replyTo: from,
    });
    if (!buyerNotified) {
      error = 'Delivery to buyer email could not be completed.';
    }
  } catch (err) {
    error = err instanceof Error ? err.message : 'Failed to send decline notice to buyer.';
  }

  return { buyerNotified, error };
}
