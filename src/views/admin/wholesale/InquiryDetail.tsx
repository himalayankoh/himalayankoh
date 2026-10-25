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
import { packagingObject, readCasePolicy } from '@/lib/wholesale/casePolicy';
import { pricePerBox } from '@/lib/wholesale/boxes';
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

interface ResolvedInquiryLine {
  id: string;
  name: string;
  wholesaleSku: string;
  wooProductId: number | null;
  wooVariationId: number | null;
  casePack: number;
  boxes: number;
  totalPieces: number;
  piecePrice: number;
  boxPrice: number;
  boxWeightLbs: number;
  totalWeightLbs: number;
  lineSubtotal: number;
}

function getUnitWeightLbs(sku: string, name: string): number {
  const s = sku.toLowerCase();
  const n = name.toLowerCase();
  if (s.includes('2lbs') || s.includes('2lb') || n.includes('2 lb') || n.includes('2lb')) return 2;
  if (s.includes('6lbs') || s.includes('6lb') || n.includes('6 lb') || n.includes('6lb')) return 6;
  if (s.includes('30lbs') || s.includes('30lb') || n.includes('30 lb') || n.includes('30lb')) return 30;
  if (s.includes('45lbs') || s.includes('45lb') || n.includes('45 lb') || n.includes('45lb')) return 45;
  if (s.includes('16oz') || n.includes('16 oz')) return 1;
  return 2;
}

function getKnownPackSize(sku: string, name: string): number | null {
  const s = sku.toLowerCase();
  const n = name.toLowerCase();
  if (s === 'hk-lfh-2lbs' || (n.includes('lick') && (n.includes('2 lb') || n.includes('2lb')))) return 6;
  if (s === 'hk-lfh-6lbs' || (n.includes('lick') && (n.includes('6 lb') || n.includes('6lb')))) return 4;
  if (s === 'hk-lb-30lbs' || n.includes('30 lb')) return 1;
  if (s === 'hk-esf-16oz') return 6;
  if (s === 'hk-esf-6lbs') return 4;
  if (s === 'hk-lfc-45lbs') return 1;
  return null;
}

function formatAddress(addr: unknown): string {
  if (!addr) return '';
  if (typeof addr === 'string') return addr.trim();
  if (typeof addr === 'object' && !Array.isArray(addr)) {
    const s = addr as Record<string, unknown>;
    if (s.address && typeof s.address === 'string' && s.address.trim()) return s.address.trim();
    const parts = [
      s.line1,
      s.line2,
      [s.city, s.state, s.zip].filter(Boolean).join(' '),
      s.country,
    ]
      .filter(Boolean)
      .map(String);
    return parts.join(', ');
  }
  return '';
}

function resolveLine(line: Record<string, unknown>, products: WholesaleRow[]): ResolvedInquiryLine {
  const lineSku = text(line.wholesaleSku).toLowerCase();
  const lineProdId = Number(line.productId || line.productRowId || 0);
  const lineVarId = Number(line.wooVariationId || 0);
  const lineWooId = Number(line.wooProductId || 0);
  const lineName = text(line.name).toLowerCase();

  // Priority search for matching product:
  // 1. Exact wholesale row ID
  let matchingProduct = lineProdId > 0 ? products.find((p) => Number(p.id) === lineProdId) : null;

  // 2. Exact wholesale SKU
  if (!matchingProduct && lineSku) {
    matchingProduct = products.find((p) => text(p.wholesale_sku || p.sku).toLowerCase() === lineSku) || null;
  }

  // 3. Exact WooCommerce variation ID
  if (!matchingProduct && lineVarId > 0) {
    matchingProduct = products.find((p) => Number(p.woo_variation_id) === lineVarId) || null;
  }

  // 4. WooCommerce parent product ID ONLY for simple products (without a variation ID)
  if (!matchingProduct && lineWooId > 0) {
    matchingProduct =
      products.find(
        (p) => Number(p.woo_product_id) === lineWooId && (!p.woo_variation_id || Number(p.woo_variation_id) === 0)
      ) || null;
  }

  // 5. Fallback: Exact name match or size-disambiguated title match
  if (!matchingProduct && lineName) {
    matchingProduct =
      products.find((p) => text(p.name).toLowerCase() === lineName) ||
      products.find((p) => {
        const pName = text(p.name).toLowerCase();
        if (lineName.includes('6 lb') || lineName.includes('6lb')) {
          return pName.includes('6 lb') || pName.includes('6lb');
        }
        if (lineName.includes('2 lb') || lineName.includes('2lb')) {
          return pName.includes('2 lb') || pName.includes('2lb');
        }
        return pName && (lineName.includes(pName) || pName.includes(lineName));
      }) ||
      null;
  }

  const storedPack = Number(line.casePackUnits || 0);
  const productPolicy = matchingProduct ? readCasePolicy(matchingProduct.packaging) : null;
  const policyPack = productPolicy?.unitsPerCase ? Number(productPolicy.unitsPerCase) : 0;
  const packagingPack = matchingProduct ? Number(packagingObject(matchingProduct.packaging).cartonQty || 0) : 0;
  const knownPack = getKnownPackSize(lineSku || text(matchingProduct?.wholesale_sku), lineName || text(matchingProduct?.name));

  // Canonical pack size:
  // Use verified policyPack > knownPack > packagingPack
  const casePack =
    policyPack > 0
      ? policyPack
      : knownPack || (storedPack > 0 ? storedPack : packagingPack || 1);

  const rawUnits = Number(line.units ?? 0);
  const rawCartons = Number(line.cartons ?? 0);

  // Boxes ordered
  let boxes: number;
  let totalPieces: number;

  if (rawCartons > 0) {
    boxes = rawCartons;
    totalPieces = rawUnits > 0 ? rawUnits : boxes * casePack;
  } else if (rawUnits > 0) {
    if (casePack > 1 && rawUnits < casePack) {
      // Historical test row with loose piece(s): treat as 1 box
      boxes = 1;
      totalPieces = Math.max(rawUnits, casePack);
    } else {
      boxes = Math.max(1, Math.ceil(rawUnits / casePack));
      totalPieces = rawUnits;
    }
  } else {
    boxes = 1;
    totalPieces = casePack;
  }

  const piecePrice = Number(line.unitPriceIndicative ?? line.unit_price ?? 0);
  const boxPrice = piecePrice > 0 ? pricePerBox(piecePrice, casePack) : 0;

  const unitWeight = getUnitWeightLbs(lineSku || text(matchingProduct?.wholesale_sku), lineName || text(matchingProduct?.name));
  const boxWeightLbs = casePack * unitWeight;
  const totalWeightLbs = totalPieces * unitWeight;

  // Line subtotal
  const storedSubtotal = Number(line.lineSubtotalIndicative ?? line.line_total ?? 0);
  const calculatedSubtotal = boxes * boxPrice;
  const lineSubtotal =
    storedSubtotal > 0 && Math.abs(storedSubtotal - calculatedSubtotal) < 0.05
      ? storedSubtotal
      : calculatedSubtotal > 0
        ? calculatedSubtotal
        : totalPieces * piecePrice;

  return {
    id: text(line.id) || text(line.wholesaleSku) || 'line',
    name: text(line.name) || (matchingProduct ? text(matchingProduct.name) : 'Wholesale Item'),
    wholesaleSku: text(line.wholesaleSku) || (matchingProduct ? text(matchingProduct.wholesale_sku) : ''),
    wooProductId: Number(line.wooProductId || matchingProduct?.woo_product_id || 0) || null,
    wooVariationId: Number(line.wooVariationId || matchingProduct?.woo_variation_id || 0) || null,
    casePack,
    boxes,
    totalPieces,
    piecePrice,
    boxPrice,
    boxWeightLbs,
    totalWeightLbs,
    lineSubtotal,
  };
}

export default function InquiryDetail({
  inquiry,
  audit = [],
  products = [],
  accounts = [],
  reload,
  close,
}: {
  inquiry: WholesaleRow;
  audit?: WholesaleRow[];
  products?: WholesaleRow[];
  accounts?: WholesaleRow[];
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

  // Resolve lines against wholesale products catalog for box packaging and pricing
  const resolvedLines = lines.map((line) => resolveLine(line, products));
  const totalBoxes = resolvedLines.reduce((acc, l) => acc + l.boxes, 0);
  const totalPieces = resolvedLines.reduce((acc, l) => acc + l.totalPieces, 0);
  const merchandiseTotal = resolvedLines.reduce((acc, l) => acc + l.lineSubtotal, 0);
  const totalWeightLbs = resolvedLines.reduce((acc, l) => acc + l.totalWeightLbs, 0);
  const destinationAddress = formatAddress(shipping);

  // Find linked customer account if available
  const accountId = Number(inquiry.account_id || 0);
  const matchedAccount = accountId > 0 ? accounts.find((a) => Number(a.id) === accountId) : null;

  const buyerCompany = text(contact?.business) || text(matchedAccount?.company) || 'Wholesale Buyer';
  const buyerContactName = text(contact?.name) || text(matchedAccount?.contact_name) || '';
  const buyerEmail = text(contact?.email) || text(matchedAccount?.email) || '';
  const buyerPhone = text(contact?.phone) || text(matchedAccount?.phone) || '';
  const buyerBillingAddress =
    formatAddress(inquiry.billing_address) ||
    formatAddress(matchedAccount?.billing_address || matchedAccount?.address) ||
    '';

  const isTestRecord = Boolean(
    text(contact?.business).toUpperCase().includes('INTERNAL') ||
    text(contact?.name).toUpperCase().includes('INTERNAL') ||
    text(destinationAddress).toUpperCase().includes('INTERNAL TEST') ||
    text(matchedAccount?.company).toUpperCase().includes('INTERNAL') ||
    text(contact?.email).toLowerCase().includes('ws@himalayankoh.com')
  );

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
        {/* Seller & Dispatch Warehouse Card */}
        <div className="rounded-xl border border-himalayan/25 bg-gradient-to-r from-emerald-50/70 via-warm-white to-emerald-50/40 p-4 shadow-xs">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-himalayan-dark">
                <Building2 size={15} className="text-himalayan" />
                <span>Issuer &amp; Dispatch Warehouse (Seller)</span>
              </div>
              <p className="text-base font-extrabold text-charcoal mt-1">Himalayan Koh LLC</p>
              <p className="text-xs text-charcoal-light mt-0.5 font-medium">
                12620 FM 1960 W Ste A-4 · Houston, TX 77065, United States
              </p>
              <div className="flex flex-wrap items-center gap-3 text-xs text-charcoal-light mt-1.5">
                <span className="flex items-center gap-1">
                  <Phone size={12} className="text-himalayan" />
                  <a href="tel:8322246466" className="text-charcoal hover:text-himalayan font-medium">
                    (832) 224-6466
                  </a>
                </span>
                <span>·</span>
                <span className="flex items-center gap-1">
                  <Mail size={12} className="text-himalayan" />
                  <a href="mailto:wholesale@himalayankoh.com" className="text-charcoal hover:text-himalayan font-medium">
                    wholesale@himalayankoh.com
                  </a>
                </span>
                <span>·</span>
                <span className="text-charcoal/70">Central USA Distribution Center</span>
              </div>
            </div>
            <div className="flex flex-col items-start sm:items-end gap-1">
              <span className="inline-flex items-center gap-1 rounded-md bg-white border border-himalayan/30 px-2.5 py-1 text-xs font-bold text-himalayan-dark shadow-xs">
                <Truck size={13} className="text-himalayan" />
                Houston Fulfillment Hub (77065)
              </span>
              <p className="text-[11px] text-charcoal-light">
                Basis: <strong className="text-charcoal">{text(inquiry.incoterm, 'FOB')}</strong> · Standard Dispatch 24–48h
              </p>
            </div>
          </div>
        </div>

        {/* Customer & Shipping Section (2-Column Invoice Cards) */}
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Bill To / Buyer */}
          <div className="rounded-xl border border-charcoal/10 bg-white p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-charcoal-light">
                <User size={14} className="text-himalayan" />
                <span>Bill To / Wholesale Customer</span>
              </div>
              {isTestRecord ? (
                <span className="inline-flex items-center gap-1 rounded bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                  ⚠️ Internal Test Account
                </span>
              ) : matchedAccount?.ref ? (
                <span className="inline-flex items-center rounded bg-charcoal/5 px-2 py-0.5 text-[10px] font-mono font-semibold text-charcoal/80">
                  Dealer #{text(matchedAccount.ref)}
                </span>
              ) : null}
            </div>

            <div>
              <p className="font-extrabold text-base text-charcoal">{buyerCompany}</p>
              {buyerContactName ? (
                <p className="text-xs text-charcoal-light flex items-center gap-1.5 mt-1">
                  <User size={13} className="text-charcoal-light/70" />
                  <span>Attn: <strong className="text-charcoal">{buyerContactName}</strong></span>
                </p>
              ) : null}
              {buyerEmail ? (
                <p className="text-xs text-charcoal-light flex items-center gap-1.5 mt-1">
                  <Mail size={13} className="text-charcoal-light/70" />
                  <a href={`mailto:${buyerEmail}`} className="text-himalayan hover:underline font-medium">
                    {buyerEmail}
                  </a>
                </p>
              ) : null}
              {buyerPhone ? (
                <p className="text-xs text-charcoal-light flex items-center gap-1.5 mt-0.5">
                  <Phone size={13} className="text-charcoal-light/70" />
                  <span>{buyerPhone}</span>
                </p>
              ) : null}
            </div>

            {/* Buyer Registered Billing Address */}
            <div className="border-t border-charcoal/8 pt-2.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-charcoal-light block mb-0.5">
                Customer Billing Address
              </span>
              <p className="text-xs text-charcoal font-medium whitespace-pre-wrap">
                {buyerBillingAddress || (isTestRecord ? '12620 FM 1960 W Ste A-4, Houston, TX 77065 (Test Entry)' : 'Registered billing address on file with dealer account')}
              </p>
              {isTestRecord && (
                <p className="text-[11px] text-amber-800 bg-amber-50 rounded-md p-2 mt-2 border border-amber-200 leading-relaxed">
                  <strong>Notice:</strong> This inquiry was generated by an automated workflow test script using the Houston warehouse address. Real customer submissions display the dealer&apos;s verified registered business and billing address.
                </p>
              )}
            </div>
          </div>

          {/* Ship To / Destination */}
          <div className="rounded-xl border border-charcoal/10 bg-white p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-charcoal-light">
                <MapPin size={14} className="text-himalayan" />
                <span>Ship To / Delivery Destination</span>
              </div>
              {isTestRecord ? (
                <span className="inline-flex items-center rounded bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                  Test Destination
                </span>
              ) : null}
            </div>

            <div>
              <p className="text-sm font-semibold text-charcoal whitespace-pre-wrap">
                {destinationAddress || 'Customer delivery address pending confirmation'}
              </p>
              <p className="text-xs text-charcoal-light flex items-center gap-1.5 mt-2">
                <Truck size={13} className="text-himalayan" />
                Delivery Basis: <strong className="text-charcoal">{text(inquiry.incoterm, 'FOB')}</strong> · Carrier Freight from Houston, TX (77065)
              </p>
            </div>

            <div className="border-t border-charcoal/8 pt-2.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-charcoal-light block mb-0.5">
                Logistics &amp; Carrier Dispatch
              </span>
              <p className="text-xs text-charcoal-light leading-relaxed">
                Wholesale case and pallet orders are prepared and palletized at the Himalayan Koh Houston central hub. Freight carrier dispatch is quoted upon order review based on delivery dock requirements.
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
                <th scope="col" className="px-4 py-3 text-center">Case Pack</th>
                <th scope="col" className="px-4 py-3 text-right">Order Quantity</th>
                <th scope="col" className="px-4 py-3 text-right">Price / Box</th>
                <th scope="col" className="px-4 py-3 text-right">Line Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-charcoal/8 bg-white">
              {resolvedLines.length ? (
                resolvedLines.map((l, idx) => (
                  <tr key={l.id || idx} className="hover:bg-charcoal/[0.02] transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-charcoal text-sm">{l.name}</div>
                      <div className="flex items-center gap-2 mt-0.5 font-mono text-[11px] text-charcoal-light">
                        <span>{l.wholesaleSku || 'No SKU'}</span>
                        {l.wooProductId ? (
                          <span className="rounded bg-charcoal/5 px-1.5 py-0.5 text-[10px] text-charcoal/70">
                            Woo #{String(l.wooProductId)}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center text-charcoal whitespace-nowrap">
                      <span className="inline-flex items-center gap-1 rounded-md bg-warm-white px-2 py-1 text-xs font-medium text-charcoal border border-charcoal/8">
                        <Package size={12} className="text-himalayan" />
                        {l.casePack} {l.casePack === 1 ? 'pc / box' : 'pcs / box'}
                      </span>
                      <span className="text-[10px] text-charcoal-light block mt-0.5">
                        ~{l.boxWeightLbs} lbs / box
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-charcoal whitespace-nowrap">
                      <div className="text-sm font-bold text-charcoal">
                        {l.boxes} {l.boxes === 1 ? 'Box' : 'Boxes'}
                      </div>
                      <div className="text-[11px] text-charcoal-light">
                        {l.totalPieces.toLocaleString('en-US')} total pcs
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-charcoal whitespace-nowrap">
                      <div className="text-sm font-bold text-charcoal">
                        {money(l.boxPrice, currency)}
                        <span className="text-[11px] font-normal text-charcoal-light"> / box</span>
                      </div>
                      <div className="text-[11px] text-charcoal-light">
                        {money(l.piecePrice, currency)} / pc
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-charcoal text-sm whitespace-nowrap">
                      {money(l.lineSubtotal, currency)}
                    </td>
                  </tr>
                ))
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
                <td colSpan={3} className="px-4 py-2.5 text-charcoal-light">
                  <div className="font-semibold text-charcoal">
                    {totalBoxes} {totalBoxes === 1 ? 'Box' : 'Boxes'} ({totalPieces.toLocaleString('en-US')} total pieces)
                  </div>
                  <div className="text-[11px] text-charcoal-light mt-0.5">
                    Est. Shipping Weight: ~{totalWeightLbs.toLocaleString('en-US')} lbs ({Math.round(totalWeightLbs * 0.453592)} kg)
                  </div>
                </td>
                <td className="px-4 py-2.5 text-right font-semibold text-charcoal-light">Merchandise Subtotal:</td>
                <td className="px-4 py-2.5 text-right font-semibold text-charcoal">{money(merchandiseTotal, currency)}</td>
              </tr>
              <tr>
                <td colSpan={3} className="px-4 py-2.5" />
                <td className="px-4 py-2.5 text-right font-semibold text-charcoal-light">Freight & Delivery:</td>
                <td className="px-4 py-2.5 text-right font-medium text-charcoal">
                  {Number(quotedTotal) > merchandiseTotal
                    ? money(Number(quotedTotal) - merchandiseTotal, currency)
                    : Number(quotedTotal) === merchandiseTotal
                      ? 'Free Delivery / Customer Pickup'
                      : 'Quoted upon freight dispatch review'}
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
