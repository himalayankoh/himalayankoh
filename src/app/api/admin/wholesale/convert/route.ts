/**
 * Turning an accepted quotation into a wholesale order.
 *
 * ## One action, because it is one act
 *
 * Raising the order and marking the quote `CONVERTED_TO_ORDER` are the same event;
 * doing them in two writes is how an accepted quote ends up with two orders or none.
 * The order carries the quote's *snapshot* — the load plan, the price, the basis —
 * so a shipment's paperwork cannot change because a supplier changed a cost after the
 * fact.
 *
 * ## Payment terms are data, not automation
 *
 * A wholesale order records terms (deposit percentage, balance, the words on the
 * proforma). Nothing here charges anyone, sends a document or emails a buyer: this
 * phase records the agreement, and the money moves by bank transfer between people.
 * That is deliberate — a B2B order book and a retail checkout have different failure
 * modes, and this one must not be able to take a payment.
 *
 * ## The snapshot is complete, or the reporting built on it is dead
 *
 * Two figures the console reports live on the order, and neither was being written:
 *
 *   - `orders.sell_total` — the column the overview's *booked value* sums. It holds
 *     the same sell total as the quote it came from, so the overview and the profit
 *     view read one number rather than two.
 *   - the load the order was raised on (container, pallets, CBM, weight, and how full
 *     the box was). The overview's *container utilisation* panel averages those, and
 *     a plan without them can only ever say "unspecified … not measured" — a panel
 *     that is always empty is a panel nobody can trust.
 *
 * The utilisation is computed by the engine's own `buildMixedLoad` from the quote's
 * packaged lines rather than by arithmetic repeated here, so the order and the quote
 * builder cannot disagree about how full a container was.
 */

import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import { wholesaleDisabled } from '@/lib/wholesale/gate';
import { containerProfileFromRow, orderFromRow, quoteFromRow } from '@/lib/wholesale/mapping';
import { buildMixedLoad } from '@/lib/wholesale/engine';
import { listWholesaleRecords, upsertWholesaleRecord } from '@/lib/wholesale/store';
import type { QuoteLine, WholesaleProduct } from '@/lib/wholesale/types';

/**
 * What the accepted quotation's load actually was, as the engine computed it.
 *
 * Null when it cannot be established honestly — no container profile, or a quote
 * whose lines do not carry their packaging (an older row). A null plan figure leaves
 * the overview counting the order as "not measured", which is the truth; inventing a
 * zero would drag every average down and look like a result.
 */
async function frozenLoadPlan(quote: { containerProfileId: number | null; containers: number; currency: string; lines: QuoteLine[] }) {
  const profileId = Number(quote.containerProfileId ?? 0);
  if (!profileId) return null;

  const profiles = await listWholesaleRecords('container_profiles', { limit: 100 });
  const row = profiles.find((entry) => Number((entry as { id?: unknown }).id) === profileId);
  if (!row) return null;
  const container = containerProfileFromRow(row);

  const items = quote.lines
    .filter((line) => line.units > 0 && line.packaging && line.packaging.cartonQty > 0 && line.packaging.cartonGrossWeightKg > 0)
    .map((line) => ({
      // The engine's pallet math needs the packaging, not the product's identity; the
      // quote's frozen line is where that packaging lives.
      product: {
        id: line.productId,
        wooProductId: null,
        name: line.name,
        wholesaleSku: line.wholesaleSku,
        packaging: line.packaging,
        moq: 0,
        exFactoryCost: line.exFactoryUnitCost,
        currency: quote.currency,
        originId: null,
        supplierId: null,
        leadTimeDays: 0,
        netUnitWeightKg: 0,
        active: true,
      } satisfies WholesaleProduct,
      units: line.units,
    }));
  if (!items.length) return null;

  const mixed = buildMixedLoad(container, items);
  return {
    containerCode: container.id,
    containerName: container.name,
    containers: quote.containers,
    pallets: mixed.totals.pallets,
    cartons: mixed.totals.cartons,
    cbm: mixed.totals.cbm,
    grossWeightKg: mixed.totals.grossWeightKg,
    weightUtilizationPct: mixed.fit.weightUtilizationPct,
    volumeUtilizationPct: mixed.fit.volumeUtilizationPct,
    limitingFactor: mixed.fit.limitingFactor,
  };
}

export const dynamic = 'force-dynamic';

/** The terms a wholesale order may be raised on. All of them are editable data. */
const TERM_LABELS = new Set([
  'Proforma — 100% before shipment',
  'Deposit then balance before shipment',
  'Deposit then balance against documents',
  'Letter of credit at sight',
  'Open account',
]);

function intOrZero(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
}

export async function POST(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const disabled = wholesaleDisabled();
  if (disabled) return disabled;

  let body: {
    quoteId?: number;
    paymentTerms?: { label?: string; depositPct?: number; balancePct?: number; detail?: string };
    notes?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const quoteId = intOrZero(body.quoteId);
  if (!quoteId) return NextResponse.json({ error: 'A quote id is required.' }, { status: 400 });

  try {
    const rows = await listWholesaleRecords('quotes', { id: quoteId, limit: 1 });
    if (!rows.length) return NextResponse.json({ error: 'No such quotation.' }, { status: 404 });

    const quote = quoteFromRow(rows[0]);
    const status = String(quote.status).toUpperCase();
    if (status !== 'ACCEPTED') {
      return NextResponse.json(
        {
          error: `Only an accepted quotation can become an order — this one is ${status || 'unset'}. Mark it ACCEPTED first, then convert it.`,
        },
        { status: 400 }
      );
    }

    const label = body.paymentTerms?.label && TERM_LABELS.has(body.paymentTerms.label)
      ? body.paymentTerms.label
      : 'Deposit then balance before shipment';
    const depositPct = intOrZero(body.paymentTerms?.depositPct) || 30;
    const balancePct = intOrZero(body.paymentTerms?.balancePct) || 100 - depositPct;

    const accountId = Number(quote.accountId);

    // A failure to measure the load must not stop the order being raised: the order is
    // the artefact the business runs on, and the utilisation is a report about it.
    const load = await frozenLoadPlan(quote).catch(() => null);

    // The id is needed for the reference, so the row is created first and the
    // reference written back — a buyer quotes a reference in an email, not a row id.
    const created = await upsertWholesaleRecord(
      'orders',
      {
        account_id: accountId,
        quote_id: quoteId,
        status: 'AWAITING_DEPOSIT',
        incoterm: quote.incoterm,
        destination_country: quote.destinationCountry,
        destination_port: quote.destinationPort,
        currency: quote.currency,
        plan: {
          lines: quote.lines.map((line) => ({
            productId: line.productId,
            name: line.name,
            wholesaleSku: line.wholesaleSku,
            units: line.units,
            cartonQty: line.cartonQty,
          })),
          containers: quote.containers,
          units: quote.lines.reduce((total, line) => total + line.units, 0),
          ...(load ?? {}),
        },
        /** The overview's booked value sums this column, for every status. */
        sell_total: quote.sellTotal ?? 0,
        totals: {
          sellTotal: quote.sellTotal ?? 0,
          sellPerUnit:
            quote.sellTotal && quote.lines.length
              ? Math.round((quote.sellTotal / quote.lines.reduce((total, line) => total + line.units, 0)) * 10_000) / 10_000
              : 0,
          currency: quote.currency,
          /** The quote's own frozen cost basis travels with the order, for margin reporting. */
          costTotal: quote.totals ? quote.totals.total : 0,
        },
        payment_terms: {
          label,
          depositPct,
          balancePct,
          detail: body.paymentTerms?.detail ? String(body.paymentTerms.detail).slice(0, 500) : '',
        },
        paid_amount: 0,
        notes: body.notes ? String(body.notes).slice(0, 500) : '',
        created_by: auth.admin.name || auth.admin.username || auth.admin.email,
      },
      { actor: auth.admin.name || auth.admin.username || auth.admin.email }
    );

    const orderId = Number((created as { id?: number }).id ?? 0);
    const reference = `HK-WS-O${String(orderId).padStart(5, '0')}`;
    const order = orderId
      ? await upsertWholesaleRecord('orders', { ref: reference }, { id: orderId, actor: auth.admin.name || auth.admin.username || auth.admin.email })
      : created;

    await upsertWholesaleRecord(
      'quotes',
      { status: 'CONVERTED_TO_ORDER' },
      { id: quoteId, actor: auth.admin.name || auth.admin.username || auth.admin.email }
    );

    return NextResponse.json(
      { order: orderFromRow(order as Record<string, unknown>), reference, quoteStatus: 'CONVERTED_TO_ORDER' },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'The order could not be raised.' },
      { status: 502 }
    );
  }
}
