'use client';

import { useState } from 'react';
import {
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  FileText,
  Mail,
  MapPin,
  Package,
  Phone,
  Printer,
  Save,
  Send,
  Truck,
  User,
  X,
} from 'lucide-react';
import { AdminButton, AdminModal, AdminNotice } from '@/components/admin/AdminUI';
import {
  downloadWholesaleQuoteDocument,
  openWholesaleQuoteDocument,
  resendWholesaleInquiryNotification,
  saveWholesaleRecord,
  type WholesaleRow,
} from '@/lib/admin/wholesaleConsoleApi';
import { SELECT, TEXTAREA } from '@/components/admin/adminTheme';
import { text, useWriter } from './ui';

function money(value: unknown, currency = 'USD'): string {
  const num = typeof value === 'number' ? value : Number(String(value || 0).replace(/[^0-9.-]+/g, ''));
  if (!Number.isFinite(num)) return '—';
  return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    return isNaN(d.getTime())
      ? dateStr
      : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

export default function InquiryDetail({
  inquiry,
  audit = [],
  reload,
  close,
}: {
  inquiry: WholesaleRow;
  audit?: WholesaleRow[];
  reload: () => Promise<void> | void;
  close: () => void;
}) {
  const id = Number(inquiry.id);
  const ref = text(inquiry.ref) || `HK-WS-Q${String(id).padStart(5, '0')}`;
  const status = text(inquiry.status, 'SUBMITTED').toUpperCase();
  const currency = text(inquiry.currency, 'USD');

  const [note, setNote] = useState(text(inquiry.internal_notes));
  const [invoice, setInvoice] = useState(text(inquiry.invoice_url));
  const [payment, setPayment] = useState(text(inquiry.external_payment_url));
  const [quotedTotal, setQuotedTotal] = useState(text(inquiry.sell_total));
  const [validUntil, setValidUntil] = useState(text(inquiry.valid_until));
  const [confirmation, setConfirmation] = useState<'quote' | 'resend' | null>(null);
  const [showAudit, setShowAudit] = useState(false);

  const writer = useWriter();

  const lines = Array.isArray(inquiry.lines) ? (inquiry.lines as Record<string, unknown>[]) : [];
  const contact =
    inquiry.buyer_contact && typeof inquiry.buyer_contact === 'object'
      ? (inquiry.buyer_contact as Record<string, unknown>)
      : null;
  const shipping =
    inquiry.shipping_address && typeof inquiry.shipping_address === 'object'
      ? (inquiry.shipping_address as Record<string, unknown>)
      : null;
  const buyerNotes = text(inquiry.notes);
  const createdAt = text(inquiry.created_at || inquiry.submitted_at);
  const events = audit.filter((event) => Number(event.entity_id) === id && event.entity === 'quotes');

  // Calculate merchandise subtotal
  const merchandiseTotal = lines.reduce((acc, line) => {
    const subtotal = Number(line.lineSubtotalIndicative ?? line.line_total ?? 0);
    if (subtotal > 0) return acc + subtotal;
    const units = Number(line.units ?? 0);
    const unitPrice = Number(line.unitPriceIndicative ?? line.unit_price ?? 0);
    return acc + units * unitPrice;
  }, 0);

  const finalTotalNum = Number(quotedTotal) || merchandiseTotal;

  const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; border: string }> = {
    SUBMITTED: { label: 'Inquiry Submitted', bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200' },
    UNDER_REVIEW: { label: 'Under Review', bg: 'bg-blue-50', text: 'text-blue-800', border: 'border-blue-200' },
    QUOTED: { label: 'Quotation Issued', bg: 'bg-indigo-50', text: 'text-indigo-800', border: 'border-indigo-200' },
    ACCEPTED: { label: 'Quote Accepted', bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-200' },
    EXPIRED: { label: 'Expired / Lapsed', bg: 'bg-gray-100', text: 'text-gray-600', border: 'border-gray-200' },
  };

  const statusBadge = STATUS_CONFIG[status] || STATUS_CONFIG.SUBMITTED;

  async function handleSaveQuotation() {
    setConfirmation(null);
    await writer.run(async () => {
      await saveWholesaleRecord(
        'quotes',
        {
          status: 'QUOTED',
          sell_total: Number(quotedTotal),
          valid_until: validUntil,
          revisionReason: 'Trade desk updated final quotation',
          internal_notes: note,
          invoice_url: invoice,
          external_payment_url: payment,
        },
        id
      );
      await reload();
    }, 'Final quotation updated successfully.');
  }

  async function handleSaveDetails() {
    await writer.run(async () => {
      await saveWholesaleRecord(
        'quotes',
        {
          internal_notes: note,
          invoice_url: invoice,
          external_payment_url: payment,
        },
        id
      );
      await reload();
    }, 'Inquiry details saved.');
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-charcoal/12 bg-white shadow-lg transition-all">
      {/* Top Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-charcoal/10 bg-warm-white/70 px-6 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-himalayan text-white shadow-sm">
            <FileText size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold tracking-tight text-charcoal">Wholesale Quotation Invoice</h2>
              <span className="font-mono text-xs font-semibold text-charcoal/70 bg-charcoal/5 px-2 py-0.5 rounded-md">
                #{ref}
              </span>
            </div>
            <p className="text-xs text-charcoal-light mt-0.5">
              Received on {formatDate(createdAt)} · Delivery basis: {text(inquiry.incoterm, 'FOB')} (Houston Warehouse)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${statusBadge.bg} ${statusBadge.text} ${statusBadge.border}`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            {statusBadge.label}
          </span>
          <button
            type="button"
            onClick={close}
            className="rounded-lg p-2 text-charcoal-light hover:bg-charcoal/5 hover:text-charcoal transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {writer.error ? (
        <div className="p-4 border-b border-red-100 bg-red-50 text-red-800 text-sm">{writer.error}</div>
      ) : null}
      {writer.saved ? (
        <div className="p-4 border-b border-green-100 bg-green-50 text-green-800 text-sm">{writer.saved}</div>
      ) : null}

      <div className="p-6 space-y-6">
        {/* Customer & Shipping Section (2-Column Invoice Cards) */}
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Bill To / Buyer */}
          <div className="rounded-xl border border-charcoal/10 bg-white p-4 space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-charcoal-light">
              <Building2 size={14} className="text-himalayan" />
              <span>Bill To / Wholesale Buyer</span>
            </div>
            <div>
              <p className="font-bold text-sm text-charcoal">{text(contact?.business) || 'Trade Customer'}</p>
              <p className="text-xs text-charcoal-light flex items-center gap-1.5 mt-1">
                <User size={13} className="text-charcoal-light/70" />
                {text(contact?.name) || 'Attn: Store Manager'}
              </p>
              {text(contact?.email) ? (
                <p className="text-xs text-charcoal-light flex items-center gap-1.5 mt-0.5">
                  <Mail size={13} className="text-charcoal-light/70" />
                  <a href={`mailto:${text(contact?.email)}`} className="text-himalayan hover:underline">
                    {text(contact?.email)}
                  </a>
                </p>
              ) : null}
              {text(contact?.phone) ? (
                <p className="text-xs text-charcoal-light flex items-center gap-1.5 mt-0.5">
                  <Phone size={13} className="text-charcoal-light/70" />
                  {text(contact?.phone)}
                </p>
              ) : null}
            </div>
          </div>

          {/* Ship To / Destination */}
          <div className="rounded-xl border border-charcoal/10 bg-white p-4 space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-charcoal-light">
              <MapPin size={14} className="text-himalayan" />
              <span>Ship To / Delivery Destination</span>
            </div>
            <div>
              <p className="text-sm font-medium text-charcoal whitespace-pre-wrap">
                {text(shipping?.address) || '12620 FM 1960 W Ste A-4, Houston, TX 77065, United States'}
              </p>
              <p className="text-xs text-charcoal-light flex items-center gap-1.5 mt-2">
                <Truck size={13} className="text-charcoal-light/70" />
                Method: Standard Freight Delivery from Houston, TX
              </p>
            </div>
          </div>
        </div>

        {/* Buyer Notes Callout (if any) */}
        {buyerNotes && (
          <div className="rounded-xl border border-charcoal/10 bg-warm-white/60 p-3.5 text-xs text-charcoal space-y-1">
            <span className="font-semibold text-charcoal flex items-center gap-1.5">
              <FileText size={13} className="text-himalayan" />
              Buyer Notes & Special Instructions:
            </span>
            <p className="text-charcoal-light whitespace-pre-wrap pl-4">{buyerNotes}</p>
          </div>
        )}

        {/* Invoice Line Items Table */}
        <div className="overflow-hidden rounded-xl border border-charcoal/10">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-charcoal/10 bg-warm-white/70 text-[11px] font-bold uppercase tracking-wider text-charcoal-light">
              <tr>
                <th scope="col" className="px-4 py-3">Item & SKU</th>
                <th scope="col" className="px-4 py-3 text-right">Case Packaging</th>
                <th scope="col" className="px-4 py-3 text-right">Quantity</th>
                <th scope="col" className="px-4 py-3 text-right">Piece Price</th>
                <th scope="col" className="px-4 py-3 text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-charcoal/8 bg-white">
              {lines.length ? (
                lines.map((line, idx) => {
                  const units = Number(line.units ?? 0);
                  const casePack = Number(line.casePackUnits ?? 0);
                  const boxes = casePack > 0 ? Math.floor(units / casePack) : null;
                  const unitPrice = Number(line.unitPriceIndicative ?? line.unit_price ?? 0);
                  const subtotal = Number(line.lineSubtotalIndicative ?? line.line_total ?? units * unitPrice);

                  return (
                    <tr key={idx} className="hover:bg-charcoal/[0.02] transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-charcoal text-sm">{text(line.name) || 'Wholesale Item'}</div>
                        <div className="flex items-center gap-2 mt-0.5 font-mono text-[11px] text-charcoal-light">
                          <span>{text(line.wholesaleSku) || 'No SKU'}</span>
                          {line.wooProductId ? (
                            <span className="rounded bg-charcoal/5 px-1.5 py-0.2 text-[10px]">
                              Woo #{String(line.wooProductId)}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-charcoal whitespace-nowrap">
                        {casePack > 0 ? (
                          <span>{casePack} pcs / box</span>
                        ) : (
                          <span className="text-charcoal-light">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-charcoal whitespace-nowrap">
                        {boxes !== null ? (
                          <span>
                            {boxes} {boxes === 1 ? 'box' : 'boxes'} ({units} pcs)
                          </span>
                        ) : (
                          <span>{units} pcs</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-charcoal whitespace-nowrap">
                        {money(unitPrice, currency)}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-charcoal whitespace-nowrap">
                        {money(subtotal, currency)}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-charcoal-light">
                    No line items found on this inquiry.
                  </td>
                </tr>
              )}
            </tbody>

            {/* Invoice Totals Summary Footer */}
            <tfoot className="border-t-2 border-charcoal/10 bg-warm-white/40 text-xs">
              <tr>
                <td colSpan={3} className="px-4 py-2.5" />
                <td className="px-4 py-2.5 text-right font-semibold text-charcoal-light">Merchandise Subtotal:</td>
                <td className="px-4 py-2.5 text-right font-semibold text-charcoal">{money(merchandiseTotal, currency)}</td>
              </tr>
              <tr>
                <td colSpan={3} className="px-4 py-2.5" />
                <td className="px-4 py-2.5 text-right font-semibold text-charcoal-light">Freight & Delivery:</td>
                <td className="px-4 py-2.5 text-right font-medium text-charcoal-light">
                  {Number(quotedTotal) > merchandiseTotal
                    ? money(Number(quotedTotal) - merchandiseTotal, currency)
                    : 'Included / Free Pickup'}
                </td>
              </tr>
              <tr className="border-t border-charcoal/10 bg-warm-white">
                <td colSpan={3} className="px-4 py-3" />
                <td className="px-4 py-3 text-right text-sm font-bold text-charcoal">Final Quoted Total:</td>
                <td className="px-4 py-3 text-right text-base font-extrabold text-himalayan-dark">
                  {money(finalTotalNum, currency)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Quotation Management & Final Quote Form */}
        <div className="rounded-xl border border-charcoal/10 bg-warm-white/40 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={16} className="text-himalayan" />
              <h3 className="text-sm font-bold text-charcoal">Quotation & Pricing Controls</h3>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  void writer.run(
                    () => openWholesaleQuoteDocument(id),
                    'Quotation opened in new tab for printing.'
                  );
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-charcoal/15 bg-white px-2.5 py-1 text-xs font-semibold text-charcoal hover:bg-charcoal/5 transition-colors"
              >
                <Printer size={13} />
                Print Invoice
              </button>
              <button
                type="button"
                onClick={() => {
                  void writer.run(
                    () => downloadWholesaleQuoteDocument(id),
                    'Quotation PDF downloaded.'
                  );
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-charcoal/15 bg-white px-2.5 py-1 text-xs font-semibold text-charcoal hover:bg-charcoal/5 transition-colors"
              >
                <Download size={13} />
                Download PDF
              </button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-charcoal mb-1" htmlFor="final-quote-total">
                Final Quoted Total (USD)
              </label>
              <input
                id="final-quote-total"
                type="number"
                step="0.01"
                className={`${SELECT} text-sm font-bold`}
                value={quotedTotal}
                onChange={(e) => setQuotedTotal(e.target.value)}
                placeholder={merchandiseTotal.toFixed(2)}
              />
              <p className="text-[11px] text-charcoal-light mt-1">
                Enter total including merchandise and agreed freight.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-charcoal mb-1" htmlFor="valid-through-date">
                Valid Through Date
              </label>
              <input
                id="valid-through-date"
                type="date"
                className={`${SELECT} text-sm`}
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
              />
              <p className="text-[11px] text-charcoal-light mt-1">Date when this price quotation expires.</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-charcoal mb-1" htmlFor="invoice-url">
                Stripe / Invoice URL (Optional)
              </label>
              <input
                id="invoice-url"
                className={`${SELECT} text-xs`}
                value={invoice}
                onChange={(e) => setInvoice(e.target.value)}
                placeholder="https://buy.stripe.com/..."
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-charcoal mb-1" htmlFor="payment-url">
                External Payment URL (Optional)
              </label>
              <input
                id="payment-url"
                className={`${SELECT} text-xs`}
                value={payment}
                onChange={(e) => setPayment(e.target.value)}
                placeholder="https://..."
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-charcoal mb-1" htmlFor="internal-notes">
              Private Internal Notes (Never shown to customer)
            </label>
            <textarea
              id="internal-notes"
              className={TEXTAREA}
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Freight quotes, carrier tracking, or dealer communication history..."
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <div className="flex flex-wrap gap-2">
              <AdminButton
                variant="primary"
                icon={Save}
                onClick={() => setConfirmation('quote')}
                disabled={writer.saving}
              >
                {writer.saving ? 'Updating…' : 'Record Final Quotation'}
              </AdminButton>
              <AdminButton variant="secondary" onClick={() => void handleSaveDetails()} disabled={writer.saving}>
                Save Notes & Links
              </AdminButton>
              <AdminButton variant="ghost" icon={Send} onClick={() => setConfirmation('resend')}>
                Resend Email
              </AdminButton>
            </div>

            <button
              type="button"
              onClick={() => setShowAudit(!showAudit)}
              className="text-xs text-charcoal-light hover:text-charcoal flex items-center gap-1 transition-colors"
            >
              <Clock size={12} />
              {showAudit ? 'Hide Audit Log' : `View Activity Log (${events.length})`}
            </button>
          </div>
        </div>

        {/* Collapsible Activity Log */}
        {showAudit && (
          <div className="rounded-xl border border-charcoal/10 bg-warm-white/40 p-4 space-y-2">
            <h4 className="text-xs font-bold text-charcoal uppercase tracking-wider">Activity History</h4>
            {events.length ? (
              <ul className="space-y-1.5 text-xs text-charcoal-light">
                {events.map((event, idx) => (
                  <li key={idx} className="flex items-center gap-2 border-l-2 border-himalayan/40 pl-2.5">
                    <span className="font-mono text-[11px] text-charcoal">
                      {formatDate(text(event.at || event.created_at))}
                    </span>
                    <span>·</span>
                    <span className="font-medium text-charcoal">{text(event.action).replaceAll('_', ' ')}</span>
                    <span>·</span>
                    <span>{text(event.actor)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-charcoal-light">No logged activity events for this quotation.</p>
            )}
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
      {confirmation && (
        <AdminModal
          title={confirmation === 'quote' ? 'Confirm Final Quotation' : 'Confirm Notification Resend'}
          onClose={() => setConfirmation(null)}
          footer={
            <>
              <AdminButton variant="secondary" onClick={() => setConfirmation(null)}>
                Cancel
              </AdminButton>
              <AdminButton
                variant="primary"
                onClick={() => {
                  if (confirmation === 'quote') {
                    void handleSaveQuotation();
                  } else {
                    setConfirmation(null);
                    void writer.run(async () => {
                      const res = await resendWholesaleInquiryNotification(id);
                      if (!res.adminNotified || !res.buyerAcknowledged) {
                        throw new Error(res.error || 'One or more notifications could not be sent.');
                      }
                      await reload();
                    }, 'Notification emails accepted by mail transport.');
                  }
                }}
              >
                Confirm
              </AdminButton>
            </>
          }
        >
          <p className="text-sm text-charcoal">
            {confirmation === 'quote'
              ? `Confirm and update final quotation total to ${money(Number(quotedTotal) || merchandiseTotal, currency)} for ${ref}?`
              : `Resend quotation inquiry notification for ${ref} to buyer and trade desk?`}
          </p>
        </AdminModal>
      )}
    </div>
  );
}
