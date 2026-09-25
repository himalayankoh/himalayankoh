/**
 * The calculator: pallets, containers, mixed loads and the landed cost, in one call.
 *
 * ## One engine, four screens
 *
 * The pallet calculator, the container calculator, the mixed-container builder and
 * the landed-cost view are four presentations of one calculation. Serving them from
 * one route (rather than four) means a mix the owner built in the builder is priced
 * by exactly the code the quote saves — there is no second implementation to drift
 * from it.
 *
 * ## Deterministic, and it never fills a container
 *
 * The quantities are the input. A load that exceeds the weight limit, the practical
 * volume, or the assumed pallet capacity comes back with warnings and the *limiting
 * factor* named, not silently trimmed. Optimisation can come later; correctness
 * first.
 *
 * ## Optional save
 *
 * With `save` present the calculation is written as a quote row — and that is where
 * the snapshot is frozen (see `quoteRowFromCalculation`). Without it nothing is
 * stored, so an owner can explore freely.
 */

import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import { wholesaleDisabled } from '@/lib/wholesale/gate';
import { loadWholesaleData, calculateQuote, quoteRowFromCalculation, type QuoteInput } from '@/lib/wholesale/pricing';
import { parseLineRequests } from '@/lib/wholesale/plan';
import { quoteFromRow } from '@/lib/wholesale/mapping';
import { listWholesaleRecords, upsertWholesaleRecord } from '@/lib/wholesale/store';
import { recordQuoteRevision } from '@/lib/wholesale/revisionLog';
import type { FxSnapshot, Incoterm } from '@/lib/wholesale/types';

export const dynamic = 'force-dynamic';

const INCOTERMS = new Set(['EXW', 'FOB', 'CFR', 'CIF']);

/** Rates the owner typed for this quote, with the pair each one covers. */
function readFx(value: unknown): FxSnapshot[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      const row = (entry && typeof entry === 'object' ? entry : {}) as Record<string, unknown>;
      const from = String(row.from ?? '').toUpperCase();
      const to = String(row.to ?? '').toUpperCase();
      const rate = Number(row.rate);
      if (!from || !to || !Number.isFinite(rate) || rate <= 0) return null;
      return {
        from,
        to,
        rate,
        source: row.source === 'api' ? ('api' as const) : ('manual' as const),
        retrievedAt: String(row.retrievedAt ?? new Date().toISOString()),
      };
    })
    .filter((entry): entry is FxSnapshot => entry !== null);
}

export async function POST(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const disabled = wholesaleDisabled();
  if (disabled) return disabled;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const incoterm = String(body.incoterm ?? 'FOB').toUpperCase();
  if (!INCOTERMS.has(incoterm)) {
    return NextResponse.json({ error: `"${body.incoterm}" is not a supported basis.` }, { status: 400 });
  }

  try {
    const lines = parseLineRequests(body.lines);
    const data = await loadWholesaleData();

    const input: QuoteInput = {
      accountId: Number(body.accountId ?? 0),
      lines,
      containerProfileId: Number(body.containerProfileId ?? 0),
      containers: body.containers ? Number(body.containers) : 1,
      costProfileId: Number(body.costProfileId ?? 0),
      freightRateId: body.freightRateId ? Number(body.freightRateId) : null,
      incoterm: incoterm as Incoterm,
      currency: body.currency ? String(body.currency).toUpperCase() : undefined,
      fx: readFx(body.fx),
      marginPct: body.marginPct === undefined || body.marginPct === null || body.marginPct === '' ? null : Number(body.marginPct),
      sellPricePerUnit:
        body.sellPricePerUnit === undefined || body.sellPricePerUnit === null || body.sellPricePerUnit === ''
          ? null
          : Number(body.sellPricePerUnit),
      includeDestination: body.includeDestination === undefined ? undefined : Boolean(body.includeDestination),
      includeDuty: body.includeDuty === undefined ? undefined : Boolean(body.includeDuty),
      destinationCountry: body.destinationCountry ? String(body.destinationCountry) : undefined,
      destinationPort: body.destinationPort ? String(body.destinationPort) : undefined,
    };

    const calculation = calculateQuote(data, input);

    const response: Record<string, unknown> = {
      calculation: {
        lines: calculation.lines.map((entry) => ({
          productRowId: entry.product.rowId,
          name: entry.product.name,
          wholesaleSku: entry.product.wholesaleSku,
          units: entry.load.units,
          cartons: entry.load.cartons,
          pallets: entry.load.palletsRequired,
          palletsFull: entry.load.fullPallets,
          unitsOnLastPallet: entry.load.unitsOnLastPallet,
          unitsPerPallet: entry.load.layout.unitsPerPallet,
          cartonsPerPallet: entry.load.layout.cartonsPerPallet,
          // The two halves of `cartonsPerPallet`, because the load screen shows how the
          // cartons sit and a screen that labelled cartons-per-pallet "per layer" was
          // telling the owner a number that was out by the number of layers.
          cartonsPerLayer: entry.load.layout.cartonsPerLayer,
          layers: entry.load.layout.layers,
          weightLimited: entry.load.layout.weightLimited,
          netWeightKg: entry.load.netWeightKg,
          grossWeightKg: entry.load.grossWeightKg,
          cbm: entry.load.cbm,
          unitCost: entry.unitCost,
          tierMinUnits: entry.tier?.minUnits ?? null,
          merchandiseCost: entry.load.merchandiseCost,
          assumptions: entry.load.assumptions,
        })),
        totals: calculation.totals,
        costLines: calculation.costLines,
        fit: calculation.fit,
        mixed: calculation.mixed.totals,
        sell: calculation.sell,
        assumptions: calculation.assumptions,
        warnings: calculation.mixed.warnings,
        container: calculation.container,
        costProfile: calculation.costProfile,
        freight: calculation.freight,
        incoterm: calculation.incoterm,
        currency: calculation.currency,
        containers: calculation.containers,
        /** Where the numbers came from, so a manual rate is never mistaken for a fetched one. */
        provenance: {
          costProfileId: calculation.costProfile.rowId,
          costProfileName: calculation.costProfile.name,
          containerProfileId: calculation.container.rowId,
          freightSource: calculation.freight ? calculation.freight.source : 'none',
          freightProvider: calculation.freight ? calculation.freight.provider : null,
          fx: calculation.fx,
        },
      },
    };

    const save = body.save && typeof body.save === 'object' ? (body.save as Record<string, unknown>) : null;
    if (save) {
      const accountId = Number(save.accountId ?? input.accountId ?? 0);
      if (!accountId) {
        return NextResponse.json(
          { error: 'Choose the wholesale customer this quotation is for before saving it.' },
          { status: 400 }
        );
      }

      const row = quoteRowFromCalculation({
        accountId,
        calculation,
        status: String(save.status ?? 'DRAFT').toUpperCase(),
        notes: save.notes ? String(save.notes) : null,
        createdBy: auth.admin.name || auth.admin.username || auth.admin.email,
        sellPricePerUnit: input.sellPricePerUnit ?? null,
        marginPct: input.marginPct ?? null,
        validUntil: save.validUntil ? String(save.validUntil) : null,
        pricingBasis: save.pricingBasis ? String(save.pricingBasis) : 'SYSTEM_CALCULATED',
        destinationCountry: input.destinationCountry,
        destinationPort: input.destinationPort,
      });

      const quoteId = Number(save.quoteId ?? 0);

      // Read the quote *before* the write, so a revision's "before" figures are the
      // ones the buyer was actually given — a read afterwards would already show the
      // new price. Re-pricing a live quotation is exactly the change a revision exists
      // to record, and the builder is how the owner does it, so the history has to be
      // extended here on the same terms the resource route extends it.
      let storedQuote: Record<string, unknown> | null = null;
      if (quoteId) {
        try {
          const rows = await listWholesaleRecords('quotes', { id: quoteId, limit: 1 });
          storedQuote = (rows[0] as Record<string, unknown> | undefined) ?? null;
        } catch {
          storedQuote = null;
        }
      }

      const saved = await upsertWholesaleRecord('quotes', row, {
        id: quoteId || undefined,
        actor: auth.admin.name || auth.admin.username || auth.admin.email,
      });

      const savedId = Number((saved as { id?: number }).id ?? quoteId ?? 0);
      const reference = `HK-WS-Q${String(savedId).padStart(5, '0')}`;
      const withReference = savedId && String(saved.ref ?? '') !== reference
        ? await upsertWholesaleRecord(
            'quotes',
            { ref: reference },
            { id: savedId, actor: auth.admin.name || auth.admin.username || auth.admin.email }
          )
        : saved;

      // Written only after the update stands, so the history can never describe a change
      // that did not happen; a history that could not be written is reported rather
      // than silently skipped.
      if (storedQuote && savedId) {
        try {
          await recordQuoteRevision({
            quoteId: savedId,
            stored: storedQuote,
            data: row,
            actor: auth.admin.name || auth.admin.username || auth.admin.email,
            reason: save.revisionReason ? String(save.revisionReason).slice(0, 500) : null,
          });
        } catch {
          /* a failed history must not fail the owner's re-price */
        }
      }

      response.quote = quoteFromRow(withReference as Record<string, unknown>);
      response.reference = reference;
    }

    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The calculation could not be run.';
    const status = /at least one product|either units or pallets|greater than zero|No (container|cost) profile|No active wholesale product|No freight rate|exchange rate/i.test(
      message
    )
      ? 400
      : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
