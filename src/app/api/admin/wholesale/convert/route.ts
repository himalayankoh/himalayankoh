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
 * ## Idempotent and Inventory-Affecting
 *
 * Converting an accepted quotation (or re-running conversion on an existing order)
 * deducts inventory directly from the authoritative WooCommerce stock records for
 * each product line, writes an audit record, and synchronizes the wholesale catalogue
 * availability. If conversion is executed more than once, it is guaranteed idempotent:
 * existing orders are reused and stock is never deducted twice.
 */

import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import { wholesaleDisabled } from '@/lib/wholesale/gate';
import { containerProfileFromRow, orderFromRow, quoteFromRow } from '@/lib/wholesale/mapping';
import { buildMixedLoad } from '@/lib/wholesale/engine';
import { getWholesaleRecord, listWholesaleRecords, upsertWholesaleRecord, type WholesaleRow } from '@/lib/wholesale/store';
import { wordpressRequest } from '@/lib/backend/wordpress';
import { purgePublicProduct } from '@/lib/backend/publicCache';
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

  const actor = auth.admin.name || auth.admin.username || auth.admin.email || 'wholesale-admin';

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

    // 1. Check for an existing wholesale order for this quote to reuse (prevent duplicates)
    const existingOrders = await listWholesaleRecords<WholesaleRow>('orders', { quote_id: quoteId, limit: 1 });
    const existingOrder = existingOrders[0];

    // Status validation: must be ACCEPTED, or already CONVERTED_TO_ORDER if an order exists (retryable)
    if (status !== 'ACCEPTED' && !(status === 'CONVERTED_TO_ORDER' && existingOrder)) {
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

    let order = existingOrder;
    let orderId = Number((existingOrder as { id?: number })?.id ?? 0);
    let reference = String((existingOrder as { ref?: string })?.ref ?? '');

    if (!order || !orderId) {
      // Create new wholesale order if none exists yet
      const load = await frozenLoadPlan(quote).catch(() => null);

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
          sell_total: quote.sellTotal ?? 0,
          totals: {
            sellTotal: quote.sellTotal ?? 0,
            sellPerUnit:
              quote.sellTotal && quote.lines.length
                ? Math.round((quote.sellTotal / quote.lines.reduce((total, line) => total + line.units, 0)) * 10_000) / 10_000
                : 0,
            currency: quote.currency,
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
          created_by: actor,
        },
        { actor }
      );

      orderId = Number((created as { id?: number }).id ?? 0);
      reference = `HK-WS-O${String(orderId).padStart(5, '0')}`;
      order = orderId
        ? await upsertWholesaleRecord('orders', { ref: reference }, { id: orderId, actor })
        : created;
    } else if (!reference) {
      reference = `HK-WS-O${String(orderId).padStart(5, '0')}`;
    }

    // 2. Idempotency Check: Verify if inventory deduction already completed for this order
    const orderPlan = (order && typeof (order as Record<string, unknown>).plan === 'object' && !Array.isArray((order as Record<string, unknown>).plan))
      ? ((order as Record<string, unknown>).plan as Record<string, unknown>)
      : null;

    const auditRows = orderId
      ? await listWholesaleRecords<WholesaleRow>('audit', { entity: 'orders', entity_id: orderId, action: 'inventory_deducted', limit: 1 }).catch(() => [])
      : [];

    const alreadyDeducted = Boolean(orderPlan?.inventoryDeducted || auditRows.length > 0);

    if (alreadyDeducted) {
      return NextResponse.json(
        {
          order: orderFromRow(order as Record<string, unknown>),
          reference,
          quoteStatus: 'CONVERTED_TO_ORDER',
          alreadyDeducted: true,
          deductions: (orderPlan?.deductions as unknown[]) ?? [],
        },
        { status: 200 }
      );
    }

    // 3. Perform idempotent WooCommerce stock deduction with audit record
    const deductions: Array<{
      productId: string | number;
      wooProductId: number;
      wooVariationId: number;
      unitsDeducted: number;
      stockBefore: number;
      stockAfter: number;
    }> = [];

    for (const line of quote.lines) {
      const units = Number(line.units);
      if (!units || units <= 0) continue;

      const lineRecord = line as unknown as Record<string, unknown>;
      let wooProductId = Number(lineRecord.wooProductId || 0);
      let wooVariationId = Number(lineRecord.wooVariationId || 0);

      if (!wooProductId && line.productId) {
        const prodRow = await getWholesaleRecord('products', Number(line.productId)).catch(() => null);
        if (prodRow) {
          wooProductId = Number((prodRow as Record<string, unknown>).woo_product_id || 0);
          wooVariationId = Number((prodRow as Record<string, unknown>).woo_variation_id || 0);
        }
      }

      if (!wooProductId) continue;

      // Determine stock target endpoint (variation or parent)
      const path = wooVariationId
        ? `/wc/v3/products/${wooProductId}/variations/${wooVariationId}`
        : `/wc/v3/products/${wooProductId}`;

      const currentWc = await wordpressRequest<{
        stock_quantity: number | null;
        manage_stock: boolean;
      }>(path, {
        useCredentials: true,
        timeoutMs: 15_000,
      });

      let targetPath = path;
      let stockBefore = typeof currentWc.stock_quantity === 'number' ? currentWc.stock_quantity : 0;

      // If variation manage_stock is off, check if parent manages stock
      if (wooVariationId && currentWc.manage_stock === false) {
        const parentWc = await wordpressRequest<{
          stock_quantity: number | null;
          manage_stock: boolean;
        }>(`/wc/v3/products/${wooProductId}`, {
          useCredentials: true,
          timeoutMs: 15_000,
        });
        if (parentWc.manage_stock) {
          targetPath = `/wc/v3/products/${wooProductId}`;
          stockBefore = typeof parentWc.stock_quantity === 'number' ? parentWc.stock_quantity : 0;
        }
      }

      const stockAfter = Math.max(0, stockBefore - units);

      // Idempotently set updated stock in WooCommerce
      await wordpressRequest(targetPath, {
        useCredentials: true,
        method: 'PUT',
        body: {
          manage_stock: true,
          stock_quantity: stockAfter,
        },
        timeoutMs: 15_000,
      });

      // Purge edge cache so shelves immediately show updated stock
      purgePublicProduct(undefined, `wholesale order ${reference} deducted ${units} units for product ${wooProductId}`);

      // Sync available_units on wholesale master row if linked
      if (line.productId) {
        await upsertWholesaleRecord(
          'products',
          { available_units: stockAfter },
          { id: Number(line.productId), actor }
        ).catch((err) => console.error('Failed to sync wholesale available_units:', err));
      }

      deductions.push({
        productId: line.productId,
        wooProductId,
        wooVariationId,
        unitsDeducted: units,
        stockBefore,
        stockAfter,
      });
    }

    // 4. Update order with deduction details in plan and audit notes
    const updatedPlan = {
      ...(orderPlan ?? {}),
      inventoryDeducted: true,
      inventoryDeductedAt: new Date().toISOString(),
      deductions,
    };

    const deductionSummary = deductions.map((d) => `${d.unitsDeducted} units (stock ${d.stockBefore} -> ${d.stockAfter})`).join(', ');
    const noteSuffix = deductionSummary ? `\n[Inventory Deducted: ${deductionSummary}]` : '';
    const currentNotes = String((order as Record<string, unknown>)?.notes ?? '');
    const updatedNotes = `${currentNotes}${noteSuffix}`.trim().slice(0, 500);

    const updatedOrder = await upsertWholesaleRecord(
      'orders',
      {
        plan: updatedPlan,
        notes: updatedNotes,
      },
      { id: orderId, actor }
    );

    // 5. Write audit entry in hk_wholesale_audit
    await upsertWholesaleRecord(
      'audit',
      {
        at: new Date().toISOString().replace('T', ' ').slice(0, 19),
        actor,
        action: 'inventory_deducted',
        entity: 'orders',
        entity_id: orderId,
        detail: {
          quote_id: quoteId,
          order_ref: reference,
          deductions,
        },
      },
      { actor }
    );

    // 6. Ensure quote is marked CONVERTED_TO_ORDER
    if (status !== 'CONVERTED_TO_ORDER') {
      await upsertWholesaleRecord(
        'quotes',
        { status: 'CONVERTED_TO_ORDER' },
        { id: quoteId, actor }
      );
    }

    return NextResponse.json(
      {
        order: orderFromRow((updatedOrder || order) as Record<string, unknown>),
        reference,
        quoteStatus: 'CONVERTED_TO_ORDER',
        deductions,
      },
      { status: existingOrder ? 200 : 201 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'The order could not be raised.' },
      { status: 502 }
    );
  }
}
