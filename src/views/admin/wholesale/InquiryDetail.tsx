'use client';
import { useState } from 'react';
import { saveWholesaleRecord, resendWholesaleInquiryNotification, type WholesaleRow } from '@/lib/admin/wholesaleConsoleApi';
import { Button, Field, Notice, Panel, TextArea, TextInput, text, useWriter } from './ui';

export default function InquiryDetail({ inquiry, audit, reload, close }: {
  inquiry: WholesaleRow; audit: WholesaleRow[]; reload: () => Promise<void> | void; close: () => void;
}) {
  const [note, setNote] = useState(text(inquiry.internal_notes));
  const [invoice, setInvoice] = useState(text(inquiry.invoice_url));
  const [payment, setPayment] = useState(text(inquiry.external_payment_url));
  const [quotedTotal, setQuotedTotal] = useState(text(inquiry.sell_total));
  const [validUntil, setValidUntil] = useState(text(inquiry.valid_until));
  const writer = useWriter();
  const id = Number(inquiry.id);
  const lines = Array.isArray(inquiry.lines) ? inquiry.lines as WholesaleRow[] : [];
  const contact = inquiry.buyer_contact as WholesaleRow | null;
  const shipping = inquiry.shipping_address as WholesaleRow | null;
  const events = audit.filter((event) => Number(event.entity_id) === id && event.entity === 'quotes');
  const money = (value: unknown) => typeof value === 'number' ? `${text(inquiry.currency, 'USD')} ${value.toFixed(2)}` : 'Not quoted';
  return <Panel title={`Inquiry ${text(inquiry.ref) || id}`} description="Original buyer request and price snapshots. This is not a paid order.">
    <div className="space-y-4 min-w-0">
      <Button onClick={close}>Close details</Button>
      {writer.error && <Notice kind="error">{writer.error}</Notice>}
      {writer.saved && <Notice kind="success">{writer.saved}</Notice>}
      <div className="grid gap-4 md:grid-cols-2 text-sm break-words">
        <div><h3 className="font-semibold">Buyer contact</h3><p>{text(contact?.business)} · {text(contact?.name)}</p><p>{text(contact?.email)} {text(contact?.phone)}</p></div>
        <div><h3 className="font-semibold">Shipping</h3><p className="whitespace-pre-wrap">{text(shipping?.address, 'Not recorded on this historical inquiry.')}</p></div>
      </div>
      <div className="space-y-2">
        {lines.map((line, index) => <div key={index} className="rounded-xl border border-charcoal/10 p-3 text-sm">
          <p className="font-semibold break-words">{text(line.name)}</p><p className="text-xs text-charcoal-light break-all">{text(line.wholesaleSku)} · Product {text(line.wooProductId)} {line.wooVariationId ? ` / variation ${text(line.wooVariationId)}` : ''}</p>
          <p>{text(line.units)} units × {money(line.unitPriceIndicative)} · {money(line.lineSubtotalIndicative)}</p>
        </div>)}
      </div>
      <p className="text-sm whitespace-pre-wrap">Buyer notes: {text(inquiry.notes, 'None')}</p>
      <div className="rounded-xl border border-charcoal/10 p-4 space-y-3">
        <h3 className="font-semibold text-sm">Final quotation</h3>
        <p className="text-xs text-charcoal-light">After reviewing stock, shipping and taxes, enter the final total and validity. This records your quotation; it does not take payment or automatically email the buyer. Send the final invoice through the Wholesale mailbox after saving.</p>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Final quoted total (USD)"><TextInput type="number" value={quotedTotal} onChange={setQuotedTotal} /></Field>
          <Field label="Valid through"><TextInput type="date" value={validUntil} onChange={setValidUntil} /></Field>
        </div>
        <Button disabled={writer.saving} onClick={() => {
          if (!window.confirm('Record this reviewed final quotation? Payment will remain unconfirmed.')) return;
          void writer.run(async () => { await saveWholesaleRecord('quotes', { status: 'QUOTED', sell_total: Number(quotedTotal), valid_until: validUntil, revisionReason: 'Trade desk reviewed final quotation', internal_notes: note, invoice_url: invoice, external_payment_url: payment }, id); await reload(); }, 'Final quotation saved. Send the invoice from the Wholesale mailbox.');
        }}>Record final quotation</Button>
      </div>
      <Field label="Internal notes"><TextArea value={note} onChange={setNote} /></Field>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Final invoice URL (HTTPS)"><TextInput value={invoice} onChange={setInvoice} placeholder="https://…" /></Field>
        <Field label="External payment URL (HTTPS)"><TextInput value={payment} onChange={setPayment} placeholder="https://…" /></Field>
      </div>
      <p className="text-xs text-charcoal-light">A payment link is not payment confirmation. Verify the transaction with the payment provider before recording receipt.</p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void writer.run(async () => { await saveWholesaleRecord('quotes', { internal_notes: note, invoice_url: invoice, external_payment_url: payment }, id); await reload(); }, 'Inquiry notes and links saved.')}>Save inquiry details</Button>
        <Button onClick={() => {
          if (!window.confirm('Resend the stored inquiry notification to ws@himalayankoh.com and its buyer?')) return;
          void writer.run(async () => { const result = await resendWholesaleInquiryNotification(id); if (!result.adminNotified || !result.buyerAcknowledged) throw new Error(result.error || 'One or more notifications were not accepted. Check the activity log.'); await reload(); }, 'Mail transport accepted the notification. Inbox delivery still needs confirmation.');
        }}>Resend notification</Button>
      </div>
      <h3 className="font-semibold text-sm">Activity and notification history</h3>
      {events.length ? <ul className="space-y-2 text-xs">{events.map((event, index) => <li key={index} className="border-l-2 border-himalayan/30 pl-3 break-words">{text(event.at || event.created_at)} · {text(event.action).replaceAll('_', ' ')} · {text(event.actor)}</li>)}</ul> : <p className="text-xs text-charcoal-light">No events in the currently loaded audit window. Delivery has not been verified.</p>}
    </div>
  </Panel>;
}
