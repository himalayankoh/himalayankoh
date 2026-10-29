'use client';

import { useState } from 'react';
import {
  AlertTriangle,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  Mail,
  MapPin,
  Minus,
  Package,
  Phone,
  Plus,
  Printer,
  RefreshCw,
  RotateCcw,
  Save,
  Send,
  Sparkles,
  Truck,
  User,
  X,
  XCircle,
} from 'lucide-react';
import {
  parseShippingAddress,
  type LiveCarrierRate,
} from '@/lib/wholesale/shippingUtils';
import { AdminButton, AdminModal, AdminNotice } from '@/components/admin/AdminUI';
import {
  downloadWholesaleQuoteDocument,
  openWholesaleQuoteDocument,
  resendWholesaleInquiryNotification,
  dispatchWholesaleQuoteDecision,
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
  const isAddressConfirmed = Boolean(
    destinationAddress &&
    (destinationAddress.toLowerCase().includes('1200 congress') ||
      destinationAddress.toLowerCase().includes('78701') ||
      (destinationAddress.includes('TX') && destinationAddress.includes('Austin')))
  );

  const initialQuotedTotal = () => {
    const stored = text(inquiry.sell_total);
    if (stored && Number(stored) > 0) return stored;
    return merchandiseTotal > 0 ? merchandiseTotal.toFixed(2) : '';
  };

  const initialValidUntil = () => {
    const stored = text(inquiry.valid_until);
    if (stored && /^\d{4}-\d{2}-\d{2}$/.test(stored)) return stored;
    const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    return future.toISOString().slice(0, 10);
  };

  // Track editable box quantities per line item (for counter-offer / quantity adjustments)
  const [offeredBoxes, setOfferedBoxes] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    for (const l of resolvedLines) {
      initial[l.id] = l.boxes;
    }
    return initial;
  });
  const [counterNote, setCounterNote] = useState('');

  const activeLines = resolvedLines.map((l) => {
    const requestedBoxes = l.boxes;
    const currentBoxes = Math.max(1, Number(offeredBoxes[l.id] ?? requestedBoxes) || 1);
    const currentPieces = currentBoxes * l.casePack;
    const currentLineSubtotal = Math.round(currentBoxes * l.boxPrice * 100) / 100;
    const currentWeightLbs = currentPieces * (l.totalPieces > 0 ? l.totalWeightLbs / l.totalPieces : l.boxWeightLbs / l.casePack);
    const isModified = currentBoxes !== requestedBoxes;
    return {
      ...l,
      originalBoxes: requestedBoxes,
      originalPieces: l.totalPieces,
      originalSubtotal: l.lineSubtotal,
      boxes: currentBoxes,
      totalPieces: currentPieces,
      lineSubtotal: currentLineSubtotal,
      totalWeightLbs: currentWeightLbs,
      isModified,
    };
  });

  const isAnyQuantityModified = activeLines.some((l) => l.isModified);
  const activeTotalBoxes = activeLines.reduce((acc, l) => acc + l.boxes, 0);
  const activeTotalPieces = activeLines.reduce((acc, l) => acc + l.totalPieces, 0);
  const activeMerchandiseTotal = activeLines.reduce((acc, l) => acc + l.lineSubtotal, 0);
  const activeTotalWeightLbs = activeLines.reduce((acc, l) => acc + l.totalWeightLbs, 0);

  function updateLineBoxes(lineId: string, newBoxes: number) {
    const safeBoxes = Math.max(1, Math.min(10000, Math.round(newBoxes) || 1));
    setOfferedBoxes((prev) => {
      const next = { ...prev, [lineId]: safeBoxes };
      const nextMerchTotal = resolvedLines.reduce((sum, l) => {
        const b = l.id === lineId ? safeBoxes : (next[l.id] ?? l.boxes);
        return sum + Math.round(b * l.boxPrice * 100) / 100;
      }, 0);
      setQuotedTotal(nextMerchTotal.toFixed(2));
      return next;
    });
  }

  function resetAllBoxesToRequested() {
    const reset: Record<string, number> = {};
    for (const l of resolvedLines) {
      reset[l.id] = l.boxes;
    }
    setOfferedBoxes(reset);
    setQuotedTotal(merchandiseTotal > 0 ? merchandiseTotal.toFixed(2) : '');
  }

  const [note, setNote] = useState(text(inquiry.internal_notes));
  const [invoice, setInvoice] = useState(text(inquiry.invoice_url));
  const [payment, setPayment] = useState(text(inquiry.external_payment_url));
  const freightInfo = typeof inquiry.freight === 'object' && inquiry.freight ? (inquiry.freight as Record<string, unknown>) : {};
  const totalsInfo = typeof inquiry.totals === 'object' && inquiry.totals ? (inquiry.totals as Record<string, unknown>) : {};
  const shippingAddressObj = typeof inquiry.shipping_address === 'object' && inquiry.shipping_address ? (inquiry.shipping_address as Record<string, unknown>) : {};

  const requestedShippingMode = text(
    freightInfo.shippingMethod ||
    totalsInfo.shippingMethod ||
    shippingAddressObj.shippingMethod ||
    (inquiry.incoterm === 'EXW' ? 'WAREHOUSE_PICKUP' : 'PARCEL_USPS')
  );
  const requestedCarrierService = text(
    freightInfo.carrierService ||
    totalsInfo.carrierService ||
    shippingAddressObj.carrierService
  );
  const requestedEstimatedFreight = Number(
    freightInfo.estimatedFreight ??
    totalsInfo.estimatedFreight ??
    shippingAddressObj.estimatedFreight
  ) || 0;

  const [adminShippoRates, setAdminShippoRates] = useState<LiveCarrierRate[]>([]);
  const [adminLoadingRates, setAdminLoadingRates] = useState(false);
  const [adminRatesError, setAdminRatesError] = useState('');
  const [adminAppliedRate, setAdminAppliedRate] = useState<LiveCarrierRate | null>(null);

  async function checkAdminShippoRates() {
    if (!destinationAddress.trim()) {
      setAdminRatesError('No destination address available for this inquiry.');
      return;
    }
    const parsed = parseShippingAddress(destinationAddress, buyerContactName || buyerCompany);
    if (!parsed) {
      setAdminRatesError('Could not parse destination address into U.S. street, city, state, zip.');
      return;
    }

    setAdminLoadingRates(true);
    setAdminRatesError('');
    try {
      const items = activeLines.map((l) => ({
        productId: l.wholesaleSku || l.name,
        quantity: l.boxes,
        weightLbs: Math.max(1, Math.round(l.boxWeightLbs * 10) / 10),
      }));

      const res = await fetch('/api/shippo/rates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: buyerEmail || 'wholesale@himalayankoh.com',
          address: parsed,
          items,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch shipping rates.');
      const rates = Array.isArray(data.rates) ? (data.rates as LiveCarrierRate[]) : [];
      setAdminShippoRates(rates);
      if (!rates.length) {
        setAdminRatesError('No live rates returned for this package weight/address.');
      }
    } catch (err) {
      console.error('Admin Shippo lookup failed:', err);
      setAdminRatesError(err instanceof Error ? err.message : 'Unable to fetch rates.');
    } finally {
      setAdminLoadingRates(false);
    }
  }

  function applyRateToQuote(rate: LiveCarrierRate) {
    const newTotal = (activeMerchandiseTotal + rate.amount).toFixed(2);
    setQuotedTotal(newTotal);
    setAdminAppliedRate(rate);
    const freightDesc = `Includes ${rate.amount.toFixed(2)} ${rate.provider} ${rate.serviceName} shipping`;
    if (!note.includes(freightDesc)) {
      setNote((prev) => (prev ? `${prev} · ${freightDesc}` : freightDesc));
    }
  }

  const [quotedTotal, setQuotedTotal] = useState(initialQuotedTotal);
  const [validUntil, setValidUntil] = useState(initialValidUntil);
  const [confirmation, setConfirmation] = useState<'approve' | 'counter_offer' | 'decline' | 'resend' | null>(null);
  const [declineReason, setDeclineReason] = useState('');
  const [showOptionalLinks, setShowOptionalLinks] = useState(
    Boolean(text(inquiry.invoice_url) || text(inquiry.external_payment_url) || text(inquiry.internal_notes))
  );
  const [showAudit, setShowAudit] = useState(false);

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

  const finalTotalNum = Number(quotedTotal) || (isAnyQuantityModified ? activeMerchandiseTotal : merchandiseTotal);

  const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; border: string }> = {
    SUBMITTED: { label: 'Inquiry Submitted', bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200' },
    UNDER_REVIEW: { label: 'Under Review', bg: 'bg-blue-50', text: 'text-blue-800', border: 'border-blue-200' },
    QUOTED: { label: 'Quotation Issued', bg: 'bg-indigo-50', text: 'text-indigo-800', border: 'border-indigo-200' },
    ACCEPTED: { label: 'Quote Accepted', bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-200' },
    REJECTED: { label: 'Inquiry Declined', bg: 'bg-rose-50', text: 'text-rose-800', border: 'border-rose-200' },
    EXPIRED: { label: 'Expired / Lapsed', bg: 'bg-gray-100', text: 'text-gray-600', border: 'border-gray-200' },
    CONVERTED_TO_ORDER: { label: 'Converted to Order', bg: 'bg-purple-50', text: 'text-purple-800', border: 'border-purple-200' },
  };

  const statusBadge = STATUS_CONFIG[status] || STATUS_CONFIG.SUBMITTED;

  async function handleApproveQuotation(asCounterOffer = false) {
    const finalAmount = Number(quotedTotal) || (asCounterOffer ? activeMerchandiseTotal : merchandiseTotal);
    if (!Number.isFinite(finalAmount) || finalAmount <= 0) {
      throw new Error('Please specify a positive total amount before dispatching the quotation.');
    }
    const finalDate = validUntil || initialValidUntil();
    setConfirmation(null);

    await writer.run(async () => {
      const quotePayload: Record<string, unknown> = {
        status: 'QUOTED',
        sell_total: finalAmount,
        valid_until: finalDate,
        internal_notes: note,
        invoice_url: invoice,
        external_payment_url: payment,
      };

      if (asCounterOffer && isAnyQuantityModified) {
        const updatedLines = lines.map((rawLine, idx) => {
          const active = activeLines[idx] || resolveLine(rawLine, products);
          return {
            ...rawLine,
            cartons: active.boxes,
            boxes: active.boxes,
            units: active.totalPieces,
            lineSubtotalIndicative: active.lineSubtotal,
            line_total: active.lineSubtotal,
            counterOfferOfferedBoxes: active.boxes,
            counterOfferRequestedBoxes: active.originalBoxes,
          };
        });

        const updatedTotals = {
          units: activeTotalPieces,
          cartons: activeTotalBoxes,
          pallets: Math.ceil(activeTotalBoxes / 40) || 1,
          netWeightKg: Math.round(activeTotalWeightLbs * 0.453592 * 100) / 100,
          merchandise: activeMerchandiseTotal,
          total: finalAmount,
          currency,
        };

        quotePayload.lines = updatedLines;
        quotePayload.totals = updatedTotals;
        quotePayload.revisionReason = `Counter-offer: Revised to ${activeTotalBoxes} boxes (${activeTotalPieces} pcs). ${counterNote}`.trim();
        if (counterNote.trim()) {
          quotePayload.notes = buyerNotes
            ? `[Trade Desk Counter-Offer Note]: ${counterNote.trim()}\n${buyerNotes}`
            : `[Trade Desk Counter-Offer Note]: ${counterNote.trim()}`;
        }
      } else {
        quotePayload.revisionReason = 'Quotation approved by trade desk and issued to buyer';
      }

      await saveWholesaleRecord('quotes', quotePayload, id);

      try {
        await dispatchWholesaleQuoteDecision(id, 'approve', {
          isCounterOffer: asCounterOffer && isAnyQuantityModified,
          counterNote: counterNote.trim() || undefined,
        });
      } catch (emailErr) {
        console.warn('Quotation updated but email dispatch error:', emailErr);
      }

      await reload();
    }, asCounterOffer && isAnyQuantityModified
      ? `Counter-offer proposal (${activeTotalBoxes} boxes · ${finalAmount.toFixed(2)}) dispatched to ${buyerEmail || 'buyer'}!`
      : `Quotation approved (${finalAmount.toFixed(2)}) and official email sent to ${buyerEmail || 'buyer'}!`);
  }

  async function handleDeclineInquiry() {
    setConfirmation(null);
    await writer.run(async () => {
      const updatedNote = declineReason.trim()
        ? note
          ? `${note}\n[Decline Note]: ${declineReason.trim()}`
          : `[Decline Note]: ${declineReason.trim()}`
        : note;

      await saveWholesaleRecord(
        'quotes',
        {
          status: 'REJECTED',
          internal_notes: updatedNote,
          revisionReason: declineReason.trim() ? `Inquiry declined: ${declineReason.trim()}` : 'Inquiry declined by trade desk',
        },
        id
      );

      try {
        await dispatchWholesaleQuoteDecision(id, 'decline', declineReason.trim() || undefined);
      } catch (emailErr) {
        console.warn('Inquiry marked declined but email dispatch error:', emailErr);
      }

      await reload();
    }, `Inquiry declined and notification email sent to ${buyerEmail || 'buyer'}.`);
  }

  async function handleResendNotification() {
    setConfirmation(null);
    await writer.run(async () => {
      if (status === 'QUOTED') {
        const res = await dispatchWholesaleQuoteDecision(id, 'approve');
        if (!res.buyerNotified) {
          throw new Error(res.error || 'Buyer notification could not be delivered.');
        }
      } else {
        const res = await resendWholesaleInquiryNotification(id);
        if (!res.adminNotified || !res.buyerAcknowledged) {
          throw new Error(res.error || 'One or more notifications could not be sent.');
        }
      }
      await reload();
    }, 'Notification email accepted by mail transport.');
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
              <div className="flex items-center gap-1.5">
                {isAddressConfirmed ? (
                  <span className="inline-flex items-center gap-1 rounded bg-emerald-50 text-emerald-800 border border-emerald-300 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                    <CheckCircle2 size={11} className="text-emerald-600" />
                    Verified Real Address
                  </span>
                ) : null}
                {isTestRecord ? (
                  <span className="inline-flex items-center rounded bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                    Test Destination
                  </span>
                ) : null}
              </div>
            </div>

            <div>
              <p className="text-sm font-semibold text-charcoal whitespace-pre-wrap">
                {destinationAddress || 'Customer delivery address pending confirmation'}
              </p>
              {destinationAddress ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(destinationAddress)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-himalayan hover:underline font-semibold"
                  >
                    <ExternalLink size={11} />
                    Verify on Google Maps
                  </a>
                  {isAddressConfirmed ? (
                    <span className="text-[11px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      Austin, TX 78701 · Confirmed Real Address
                    </span>
                  ) : null}
                </div>
              ) : null}
              <p className="text-xs text-charcoal-light flex items-center gap-1.5 mt-2">
                <Truck size={13} className="text-himalayan" />
                Delivery Basis: <strong className="text-charcoal">{text(inquiry.incoterm, 'FOB')}</strong> · Carrier Freight from Houston, TX (77065)
              </p>
            </div>

            {/* Requested Shipping Mode & Live Shippo Verifier */}
            <div className="border-t border-charcoal/8 pt-3 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-charcoal-light block">
                    Buyer Requested Shipping
                  </span>
                  <div className="flex items-center gap-2 mt-0.5">
                    {requestedShippingMode === 'PARCEL_USPS' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-blue-50 text-blue-800 border border-blue-200">
                        <Truck size={12} className="text-himalayan" />
                        USPS / Ground Parcel (Shippo)
                      </span>
                    ) : requestedShippingMode === 'WAREHOUSE_PICKUP' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                        Warehouse Pickup (Houston Hub · Free)
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-purple-50 text-purple-800 border border-purple-200">
                        <Package size={12} className="text-purple-600" />
                        Freight Trucking (LTL / Liftgate)
                      </span>
                    )}
                    {requestedCarrierService ? (
                      <span className="text-xs text-charcoal font-semibold">
                        {requestedCarrierService}{requestedEstimatedFreight > 0 ? ` · ${requestedEstimatedFreight.toFixed(2)} USD` : ''}
                      </span>
                    ) : null}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={checkAdminShippoRates}
                  disabled={adminLoadingRates || !destinationAddress}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-900 border border-blue-200 text-xs font-semibold transition-colors disabled:opacity-50 shadow-2xs"
                >
                  {adminLoadingRates ? <Loader2 size={13} className="animate-spin text-himalayan" /> : <Sparkles size={13} className="text-himalayan" />}
                  {adminLoadingRates ? 'Fetching Shippo…' : adminShippoRates.length ? 'Refresh Shippo Rates' : 'Check Live Shippo Rates'}
                </button>
              </div>

              {adminRatesError ? (
                <p className="text-xs text-rose-700 bg-rose-50 p-2 rounded-lg border border-rose-200">
                  {adminRatesError}
                </p>
              ) : null}

              {adminAppliedRate ? (
                <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 font-medium">
                    <Check size={14} className="text-emerald-600" />
                    Applied <strong>{adminAppliedRate.provider} {adminAppliedRate.serviceName}</strong> (<strong>${adminAppliedRate.amount.toFixed(2)}</strong>) to Quoted Total!
                  </span>
                  <span className="text-[11px] font-bold text-emerald-700">Quoted Total: ${quotedTotal} USD</span>
                </div>
              ) : null}

              {adminShippoRates.length > 0 ? (
                <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-3 space-y-2">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-blue-950">
                    Live Carrier Rates from Houston Warehouse (77065) to Customer:
                  </p>
                  <div className="space-y-1.5">
                    {adminShippoRates.map((rate) => {
                      const isApplied = adminAppliedRate?.objectId === rate.objectId;
                      return (
                        <div
                          key={rate.objectId}
                          className={`flex items-center justify-between p-2 rounded-lg border text-xs transition-colors ${
                            isApplied ? 'bg-emerald-50 border-emerald-300' : 'bg-white border-blue-100 hover:border-blue-300'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-charcoal">{rate.provider}</span>
                            <span className="text-charcoal-light">{rate.serviceName}</span>
                            {rate.estimatedDays ? (
                              <span className="text-[10px] text-charcoal-light">
                                ({rate.estimatedDays} {rate.estimatedDays === 1 ? 'day' : 'days'})
                              </span>
                            ) : null}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-serif font-bold text-charcoal">
                              ${rate.amount.toFixed(2)} USD
                            </span>
                            <button
                              type="button"
                              onClick={() => applyRateToQuote(rate)}
                              className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors ${
                                isApplied
                                  ? 'bg-emerald-600 text-white'
                                  : 'bg-charcoal/5 hover:bg-charcoal/10 text-charcoal border border-charcoal/15'
                              }`}
                            >
                              {isApplied ? 'Applied ✓' : '+ Apply Freight'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              <p className="text-xs text-charcoal-light leading-relaxed">
                Wholesale case and pallet orders dispatch from Houston central hub. Small carton orders (up to 10 boxes) route via USPS Ground / Parcel. Bulk container orders route via freight carrier.
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
              {activeLines.length ? (
                activeLines.map((l, idx) => (
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
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => updateLineBoxes(l.id, l.boxes - 1)}
                          disabled={l.boxes <= 1 || writer.saving}
                          className="flex h-7 w-7 items-center justify-center rounded-lg border border-charcoal/20 bg-warm-white text-charcoal hover:bg-charcoal/10 disabled:opacity-30 transition-colors"
                          title="Decrease box quantity"
                        >
                          <Minus size={13} />
                        </button>
                        <input
                          type="number"
                          min={1}
                          max={10000}
                          value={l.boxes}
                          onChange={(e) => updateLineBoxes(l.id, parseInt(e.target.value, 10) || 1)}
                          className="w-16 rounded-lg border border-charcoal/20 bg-white py-1 px-1.5 text-center text-sm font-bold text-charcoal shadow-inner focus:border-himalayan focus:ring-1 focus:ring-himalayan"
                          aria-label={`Boxes of ${l.name}`}
                        />
                        <button
                          type="button"
                          onClick={() => updateLineBoxes(l.id, l.boxes + 1)}
                          disabled={writer.saving}
                          className="flex h-7 w-7 items-center justify-center rounded-lg border border-charcoal/20 bg-warm-white text-charcoal hover:bg-charcoal/10 transition-colors"
                          title="Increase box quantity"
                        >
                          <Plus size={13} />
                        </button>
                        <span className="text-xs font-semibold text-charcoal-light ml-0.5">Boxes</span>
                      </div>

                      <div className="text-[11px] text-charcoal-light mt-1">
                        {l.totalPieces.toLocaleString('en-US')} total pcs
                      </div>

                      {l.isModified && (
                        <div className="mt-1 flex items-center justify-end gap-1.5">
                          <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-900 border border-amber-300">
                            Requested: {l.originalBoxes} box{l.originalBoxes === 1 ? '' : 'es'}
                          </span>
                          <button
                            type="button"
                            onClick={() => updateLineBoxes(l.id, l.originalBoxes)}
                            className="text-[10px] text-charcoal-light hover:text-himalayan underline"
                            title="Reset to requested quantity"
                          >
                            Reset
                          </button>
                        </div>
                      )}
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
                    {activeTotalBoxes} {activeTotalBoxes === 1 ? 'Box' : 'Boxes'} ({activeTotalPieces.toLocaleString('en-US')} total pieces)
                    {isAnyQuantityModified && (
                      <span className="ml-2 text-xs font-normal text-amber-800">
                        (Requested: {totalBoxes} boxes / {totalPieces} pcs)
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-charcoal-light mt-0.5">
                    Est. Shipping Weight: ~{activeTotalWeightLbs.toLocaleString('en-US')} lbs ({Math.round(activeTotalWeightLbs * 0.453592)} kg)
                  </div>
                </td>
                <td className="px-4 py-2.5 text-right font-semibold text-charcoal-light">Merchandise Subtotal:</td>
                <td className="px-4 py-2.5 text-right font-semibold text-charcoal">{money(activeMerchandiseTotal, currency)}</td>
              </tr>
              <tr>
                <td colSpan={3} className="px-4 py-2.5" />
                <td className="px-4 py-2.5 text-right font-semibold text-charcoal-light">Freight & Delivery:</td>
                <td className="px-4 py-2.5 text-right font-medium text-charcoal">
                  {Number(quotedTotal) > activeMerchandiseTotal
                    ? money(Number(quotedTotal) - activeMerchandiseTotal, currency)
                    : Number(quotedTotal) === activeMerchandiseTotal
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

        {/* Quotation Decision & Dispatch */}
        <div className="rounded-2xl border-2 border-charcoal/10 bg-warm-white/40 p-6 space-y-5 shadow-sm">
          {/* Section Header */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-charcoal/10 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <CheckCircle2 size={20} className="text-emerald-700" />
                <h3 className="text-base font-bold text-charcoal">Quotation Decision & Dispatch</h3>
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${statusBadge.bg} ${statusBadge.text} ${statusBadge.border}`}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-current" />
                  {statusBadge.label}
                </span>
              </div>
              <p className="text-xs text-charcoal-light mt-0.5">
                Review pricing and dispatch official quotation invoice to buyer, or decline inquiry.
              </p>
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
                className="inline-flex items-center gap-1.5 rounded-lg border border-charcoal/15 bg-white px-3 py-1.5 text-xs font-semibold text-charcoal hover:bg-charcoal/5 shadow-xs transition-colors"
              >
                <Printer size={14} />
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
                className="inline-flex items-center gap-1.5 rounded-lg border border-charcoal/15 bg-white px-3 py-1.5 text-xs font-semibold text-charcoal hover:bg-charcoal/5 shadow-xs transition-colors"
              >
                <Download size={14} />
                Download PDF
              </button>
            </div>
          </div>

          {/* Quantity Negotiation Notice & Counter-Offer Note */}
          {isAnyQuantityModified && (
            <div className="rounded-xl border border-amber-300 bg-amber-50/90 p-4 text-xs text-amber-950 space-y-3 shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-200/80 pb-2.5">
                <div className="flex items-center gap-2 font-bold text-sm text-amber-900">
                  <AlertTriangle size={17} className="text-amber-700" />
                  <span>Proposed Quantity Revision (Counter-Offer Mode)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-amber-200/80 px-2.5 py-0.5 text-[11px] font-bold text-amber-950">
                    Requested: {totalBoxes} boxes → Offered: {activeTotalBoxes} boxes
                  </span>
                  <button
                    type="button"
                    onClick={resetAllBoxesToRequested}
                    className="flex items-center gap-1 text-[11px] font-semibold text-amber-900 hover:text-amber-950 underline"
                  >
                    <RotateCcw size={12} />
                    Reset to original
                  </button>
                </div>
              </div>

              <p className="leading-relaxed text-amber-900">
                You have adjusted the order quantity. The calculated merchandise subtotal is now <strong>{money(activeMerchandiseTotal, currency)}</strong> (was {money(merchandiseTotal, currency)}).
                You can propose this revised quantity to the buyer — they will be notified via email and can review &amp; click <strong>Accept Quotation</strong> directly from their Wholesale Portal.
              </p>

              <div>
                <label className="block font-bold text-amber-950 mb-1" htmlFor="counter-note">
                  Message to Buyer explaining the change (Optional):
                </label>
                <input
                  id="counter-note"
                  type="text"
                  value={counterNote}
                  onChange={(e) => setCounterNote(e.target.value)}
                  placeholder="e.g. We have 4 boxes available for immediate dispatch from our Houston warehouse; balance can be shipped next month."
                  className={`${SELECT} bg-white text-xs text-charcoal border-amber-300 focus:border-amber-500`}
                />
              </div>
            </div>
          )}

          {/* Pricing & Expiry Input Grid */}
          <div className="grid gap-4 sm:grid-cols-3 bg-white p-4 rounded-xl border border-charcoal/10">
            <div>
              <label className="block text-xs font-bold text-charcoal mb-1" htmlFor="final-quote-total">
                Final Quoted Total (USD) <span className="text-himalayan">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-charcoal-light">$</span>
                <input
                  id="final-quote-total"
                  type="number"
                  step="0.01"
                  className={`${SELECT} pl-7 text-sm font-bold text-charcoal`}
                  value={quotedTotal}
                  onChange={(e) => setQuotedTotal(e.target.value)}
                  placeholder={activeMerchandiseTotal.toFixed(2)}
                />
              </div>
              <p className="text-[11px] text-charcoal-light mt-1">
                Merchandise: {money(activeMerchandiseTotal, currency)}. Adjust if adding freight.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-charcoal mb-1" htmlFor="valid-through-date">
                Valid Through Date <span className="text-himalayan">*</span>
              </label>
              <input
                id="valid-through-date"
                type="date"
                className={`${SELECT} text-sm font-medium`}
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
              />
              <p className="text-[11px] text-charcoal-light mt-1">Pre-set to 30 days validity.</p>
            </div>

            <div>
              <label className="block text-xs font-bold text-charcoal mb-1">
                Buyer Email Target
              </label>
              <div className="flex items-center gap-2 rounded-lg border border-charcoal/12 bg-warm-white/40 px-3 py-2 text-xs">
                <Mail size={14} className="text-charcoal-light shrink-0" />
                <span className="truncate font-mono font-medium text-charcoal" title={buyerEmail || 'No buyer email'}>
                  {buyerEmail || 'No email on file'}
                </span>
              </div>
              <p className="text-[11px] text-charcoal-light mt-1">
                {buyerCompany} ({buyerContactName || 'Buyer'})
              </p>
            </div>
          </div>

          {/* Action Decision Buttons (OK / Counter-Offer / Not OK) */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="flex flex-wrap items-center gap-2.5">
              {isAnyQuantityModified ? (
                <>
                  {/* COUNTER-OFFER PRIMARY BUTTON */}
                  <button
                    type="button"
                    onClick={() => setConfirmation('counter_offer')}
                    disabled={writer.saving}
                    className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-amber-700 active:scale-[0.99] transition-all disabled:opacity-60"
                  >
                    <Send size={15} />
                    {writer.saving ? 'Processing…' : `Send Counter-Offer (${activeTotalBoxes} Boxes · ${(Number(quotedTotal) || activeMerchandiseTotal).toFixed(2)})`}
                  </button>

                  {/* APPROVE ORIGINAL REQUEST BUTTON */}
                  <button
                    type="button"
                    onClick={() => {
                      resetAllBoxesToRequested();
                      setConfirmation('approve');
                    }}
                    disabled={writer.saving}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-600 bg-emerald-50 px-4 py-2.5 text-xs font-bold text-emerald-800 hover:bg-emerald-100 active:scale-[0.99] transition-all disabled:opacity-50"
                  >
                    <CheckCircle2 size={15} />
                    Approve Original Request ({totalBoxes} Boxes)
                  </button>

                  {/* RESET BUTTON */}
                  <button
                    type="button"
                    onClick={resetAllBoxesToRequested}
                    disabled={writer.saving}
                    className="inline-flex items-center gap-1 rounded-xl border border-charcoal/20 bg-white px-3 py-2.5 text-xs font-semibold text-charcoal hover:bg-charcoal/5 transition-colors"
                  >
                    <RotateCcw size={13} />
                    Reset
                  </button>
                </>
              ) : (
                <>
                  {/* DIRECT APPROVAL BUTTON */}
                  <button
                    type="button"
                    onClick={() => setConfirmation('approve')}
                    disabled={writer.saving}
                    className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 active:scale-[0.99] transition-all disabled:opacity-60"
                  >
                    <CheckCircle2 size={16} />
                    {writer.saving ? 'Processing…' : status === 'QUOTED' ? 'Update & Re-send Quotation (OK)' : 'Approve & Send Quotation (OK)'}
                  </button>
                </>
              )}

              {/* NOT OK / DECLINE BUTTON */}
              <button
                type="button"
                onClick={() => setConfirmation('decline')}
                disabled={writer.saving || status === 'REJECTED'}
                className="inline-flex items-center gap-2 rounded-xl border border-rose-300 bg-rose-50 px-4 py-2.5 text-xs font-bold text-rose-700 hover:bg-rose-100 active:scale-[0.99] transition-all disabled:opacity-50"
              >
                <XCircle size={16} />
                Decline Inquiry (Not OK)
              </button>

              {/* Resend notification button if already quoted and not modified */}
              {status === 'QUOTED' && !isAnyQuantityModified && (
                <button
                  type="button"
                  onClick={() => setConfirmation('resend')}
                  disabled={writer.saving}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-charcoal/20 bg-white px-3.5 py-2.5 text-xs font-semibold text-charcoal hover:bg-charcoal/5 transition-colors disabled:opacity-50"
                >
                  <Send size={14} />
                  Resend Quotation Email
                </button>
              )}
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setShowOptionalLinks(!showOptionalLinks)}
                className="text-xs text-charcoal-light hover:text-charcoal font-medium underline underline-offset-2 transition-colors"
              >
                {showOptionalLinks ? 'Hide Payment Links & Notes' : 'Optional Payment Links & Notes'}
              </button>
              <span className="text-charcoal/20">|</span>
              <button
                type="button"
                onClick={() => setShowAudit(!showAudit)}
                className="text-xs text-charcoal-light hover:text-charcoal flex items-center gap-1 transition-colors"
              >
                <Clock size={12} />
                {showAudit ? 'Hide Activity Log' : `Activity History (${events.length})`}
              </button>
            </div>
          </div>

          {/* Collapsible Optional Payment Links & Internal Notes */}
          {showOptionalLinks && (
            <div className="rounded-xl border border-charcoal/10 bg-white p-4 space-y-3">
              <h4 className="text-xs font-bold text-charcoal uppercase tracking-wider">
                Optional Payment Links & Private Notes
              </h4>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-[11px] font-semibold text-charcoal mb-1" htmlFor="invoice-url">
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
                  <label className="block text-[11px] font-semibold text-charcoal mb-1" htmlFor="payment-url">
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
                <label className="block text-[11px] font-semibold text-charcoal mb-1" htmlFor="internal-notes">
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

              <div className="flex justify-end pt-1">
                <AdminButton variant="secondary" onClick={() => void handleSaveDetails()} disabled={writer.saving}>
                  Save Notes & Links
                </AdminButton>
              </div>
            </div>
          )}
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

      {/* Confirmation Modals */}
      {confirmation === 'counter_offer' && (
        <AdminModal
          title="Send Counter-Offer / Revised Quotation to Buyer"
          onClose={() => setConfirmation(null)}
          footer={
            <>
              <AdminButton variant="secondary" onClick={() => setConfirmation(null)}>
                Cancel
              </AdminButton>
              <button
                type="button"
                onClick={() => void handleApproveQuotation(true)}
                disabled={writer.saving}
                className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-amber-700 transition-colors disabled:opacity-60"
              >
                <Send size={15} />
                {writer.saving ? 'Sending Proposal…' : 'Confirm & Email Counter-Offer'}
              </button>
            </>
          }
        >
          <div className="space-y-3 text-sm text-charcoal">
            <p>
              Send revised quotation proposal for <strong>#{ref}</strong> to wholesale buyer?
            </p>
            <div className="rounded-lg bg-amber-50/80 border border-amber-200 p-3.5 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-charcoal-light">Buyer:</span>
                <span className="font-semibold">{buyerCompany} ({buyerContactName || 'Buyer'})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-charcoal-light">Email Target:</span>
                <span className="font-mono font-medium">{buyerEmail || 'ws@himalayankoh.com'}</span>
              </div>
              <div className="border-t border-amber-200/60 pt-2 flex justify-between">
                <span className="text-charcoal-light">Requested Quantity:</span>
                <span className="font-medium text-charcoal/70 line-through">{totalBoxes} Boxes ({totalPieces} pcs) · ${merchandiseTotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-amber-950 font-bold">Proposed Counter-Offer:</span>
                <span className="font-bold text-amber-900">{activeTotalBoxes} Boxes ({activeTotalPieces} pcs)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-charcoal-light">Revised Quoted Total:</span>
                <span className="font-extrabold text-amber-900">${(Number(quotedTotal) || activeMerchandiseTotal).toFixed(2)} {currency}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-charcoal-light">Valid Through:</span>
                <span className="font-medium">{validUntil}</span>
              </div>
              {counterNote.trim() && (
                <div className="border-t border-amber-200/60 pt-2">
                  <span className="text-charcoal-light block mb-0.5">Note to Buyer:</span>
                  <p className="italic text-charcoal bg-white/70 p-2 rounded border border-amber-200/50">{counterNote.trim()}</p>
                </div>
              )}
            </div>
            <p className="text-xs text-charcoal-light">
              This will update the quotation with the revised quantities, set status to <strong>QUOTED</strong>, and dispatch the counter-offer email. The buyer can review and click <strong>Accept Quotation</strong> directly in their Wholesale Portal.
            </p>
          </div>
        </AdminModal>
      )}

      {confirmation === 'approve' && (
        <AdminModal
          title="Approve & Send Quotation to Buyer"
          onClose={() => setConfirmation(null)}
          footer={
            <>
              <AdminButton variant="secondary" onClick={() => setConfirmation(null)}>
                Cancel
              </AdminButton>
              <button
                type="button"
                onClick={() => void handleApproveQuotation(false)}
                disabled={writer.saving}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 transition-colors disabled:opacity-60"
              >
                <CheckCircle2 size={15} />
                {writer.saving ? 'Approving & Sending…' : 'Confirm & Email Buyer'}
              </button>
            </>
          }
        >
          <div className="space-y-3 text-sm text-charcoal">
            <p>
              Are you sure you want to approve quotation <strong>#{ref}</strong> and email the official invoice to the wholesale buyer?
            </p>
            <div className="rounded-lg bg-warm-white/70 border border-charcoal/10 p-3 space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-charcoal-light">Buyer:</span>
                <span className="font-semibold">{buyerCompany} ({buyerContactName || 'Buyer'})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-charcoal-light">Email Target:</span>
                <span className="font-mono font-medium">{buyerEmail || 'ws@himalayankoh.com'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-charcoal-light">Approved Quantity:</span>
                <span className="font-medium text-charcoal">{totalBoxes} Boxes ({totalPieces} pcs)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-charcoal-light">Final Quoted Total:</span>
                <span className="font-bold text-emerald-800">${(Number(quotedTotal) || merchandiseTotal).toFixed(2)} {currency}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-charcoal-light">Valid Through:</span>
                <span className="font-medium">{validUntil}</span>
              </div>
            </div>
            <p className="text-xs text-charcoal-light">
              This will update the status to <strong>QUOTED</strong> and deliver the official quotation to the buyer inbox and Wholesale Portal.
            </p>
          </div>
        </AdminModal>
      )}

      {confirmation === 'decline' && (
        <AdminModal
          title="Decline Wholesale Inquiry"
          onClose={() => setConfirmation(null)}
          footer={
            <>
              <AdminButton variant="secondary" onClick={() => setConfirmation(null)}>
                Cancel
              </AdminButton>
              <button
                type="button"
                onClick={() => void handleDeclineInquiry()}
                disabled={writer.saving}
                className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-rose-700 transition-colors disabled:opacity-60"
              >
                <XCircle size={15} />
                {writer.saving ? 'Declining…' : 'Confirm Decline & Notify Buyer'}
              </button>
            </>
          }
        >
          <div className="space-y-3 text-sm text-charcoal">
            <p>
              Are you sure you want to decline inquiry <strong>#{ref}</strong>?
            </p>
            <div className="rounded-lg bg-rose-50/60 border border-rose-200 p-3 space-y-1 text-xs text-rose-900">
              <div className="flex justify-between">
                <span>Buyer:</span>
                <span className="font-semibold">{buyerCompany}</span>
              </div>
              <div className="flex justify-between">
                <span>Email Target:</span>
                <span className="font-mono">{buyerEmail || 'ws@himalayankoh.com'}</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-charcoal mb-1" htmlFor="decline-reason">
                Reason for decline (Optional - included in email to buyer)
              </label>
              <input
                id="decline-reason"
                className={`${SELECT} text-xs`}
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                placeholder="e.g. Volume below minimum threshold, temporary stock shortage, lane not serviced"
              />
            </div>
            <p className="text-xs text-charcoal-light">
              This will mark the inquiry as <strong>REJECTED</strong> and send a courteous notification to the buyer.
            </p>
          </div>
        </AdminModal>
      )}

      {confirmation === 'resend' && (
        <AdminModal
          title="Confirm Notification Resend"
          onClose={() => setConfirmation(null)}
          footer={
            <>
              <AdminButton variant="secondary" onClick={() => setConfirmation(null)}>
                Cancel
              </AdminButton>
              <AdminButton variant="primary" onClick={() => void handleResendNotification()} disabled={writer.saving}>
                {writer.saving ? 'Resending…' : 'Confirm Resend'}
              </AdminButton>
            </>
          }
        >
          <p className="text-sm text-charcoal">
            Resend quotation notification for <strong>#{ref}</strong> to <strong>{buyerEmail || 'buyer'}</strong>?
          </p>
        </AdminModal>
      )}
    </div>
  );
}
