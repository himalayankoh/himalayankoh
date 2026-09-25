/**
 * Everything the wholesale console needs to render, in one authenticated read.
 *
 * ## Why one read
 *
 * The workspace has thirteen tabs, and eight of them are views over the same six
 * reference sets (products, tiers, containers, cost profiles, freight rates,
 * origins, suppliers). Fetching them per tab would make each tab a place where a
 * failure has to be handled separately, and the console would briefly disagree with
 * itself about which container profiles exist depending on which tab loaded first.
 * One read means one failure to report and one consistent picture.
 *
 * ## Costs are here, and only here
 *
 * Ex-factory costs, charge profiles and freight rates are the owner's numbers. This
 * route is behind `verifyAdminRequest`, so it is the only projection in the
 * subsystem that carries them — the buyer-facing routes build their own, cost-free
 * shapes.
 *
 * ## Raw rows, because that is what the console edits
 *
 * The console panels are built over the plugin's own rows: they address a record by
 * its numeric `id`, and every field they read or write is a stored column
 * (`usable_cbm`, `ocean_freight`, `container_type`, `entity_id`, …). Serving the
 * domain-mapped shapes here instead — camelCase `usableCbm`, `entityId` — left every
 * such column blank on screen and, worse, made *editing* a row load an empty form that
 * a save would then write back as zeros. So this route returns the plugin's rows
 * verbatim, exactly like the origins/suppliers/port-charge lists always have. The
 * domain mapping belongs to the engine's own reads (`loadWholesaleData`), not here.
 */

import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import { wholesaleDisabled } from '@/lib/wholesale/gate';
import { listWholesaleRecords, readWholesalePluginSettings, WHOLESALE_AGGREGATE_TIMEOUT_MS } from '@/lib/wholesale/store';
import { freightProviderStatus } from '@/lib/wholesale/freightProvider';
import type {
  ApplicationStatus,
  Incoterm,
  QuoteStatus,
} from '@/lib/wholesale/types';

export const dynamic = 'force-dynamic';

/** The lifecycle vocabularies the console offers. One list each, shared with the plugin. */
const APPLICATION_STATUSES: ApplicationStatus[] = [
  'PENDING',
  'APPROVED',
  'REJECTED',
  'MORE_INFO_REQUIRED',
  'SUSPENDED',
];

const QUOTE_STATUSES: QuoteStatus[] = [
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'QUOTED',
  'ACCEPTED',
  'REJECTED',
  'EXPIRED',
  'CONVERTED_TO_ORDER',
];

const INCOTERMS: Incoterm[] = ['EXW', 'FOB', 'CFR', 'CIF'];

const ORDER_STATUSES = [
  'DRAFT',
  'AWAITING_DEPOSIT',
  'CONFIRMED',
  'IN_PRODUCTION',
  'READY_TO_SHIP',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
];

export async function GET(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const disabled = wholesaleDisabled();
  if (disabled) return disabled;

  // Fourteen round trips, run together, allowed the time fourteen round trips take
  // rather than the time one record takes — see `WHOLESALE_AGGREGATE_TIMEOUT_MS`. A
  // cold WordPress made this screen time out at the single-read ceiling.
  const long = { timeoutMs: WHOLESALE_AGGREGATE_TIMEOUT_MS };

  try {
    const [products, tiers, containerProfiles, costProfiles, freightRates, origins, suppliers, portCharges, applications, accounts, quotes, orders, audit, plugin, freightProvider] = await Promise.all([
      listWholesaleRecords('products', { limit: 500 }, long),
      listWholesaleRecords('price_tiers', { limit: 500 }, long),
      listWholesaleRecords('container_profiles', { limit: 100 }, long),
      listWholesaleRecords('cost_profiles', { limit: 200 }, long),
      listWholesaleRecords('freight_rates', { limit: 300, order: 'id' }, long),
      listWholesaleRecords('origins', { limit: 100 }, long),
      listWholesaleRecords('suppliers', { limit: 200 }, long),
      listWholesaleRecords('port_charges', { limit: 300 }, long),
      listWholesaleRecords('applications', { limit: 200 }, long),
      listWholesaleRecords('accounts', { limit: 200 }, long),
      listWholesaleRecords('quotes', { limit: 200 }, long),
      listWholesaleRecords('orders', { limit: 200 }, long),
      listWholesaleRecords('audit', { limit: 100, order: 'id' }, long),
      readWholesalePluginSettings(long).catch(() => null),
      freightProviderStatus().catch(() => null),
    ]);

    return NextResponse.json({
      products,
      tiers,
      containerProfiles,
      costProfiles,
      freightRates,
      origins,
      suppliers,
      portCharges,
      applications,
      accounts,
      quotes,
      orders,
      audit,
      freightProvider,
      vocabulary: {
        applicationStatuses: APPLICATION_STATUSES,
        quoteStatuses: QUOTE_STATUSES,
        orderStatuses: ORDER_STATUSES,
        incoterms: INCOTERMS,
        chargeKeys: plugin?.charge_keys ?? [],
        pluginVersion: plugin?.version ?? null,
        // The plugin's own account of its schema: a table it could not create is the
        // difference between "this write was rejected" and "this store is incomplete".
        pluginDbVersion: plugin?.db_version ?? null,
        installedDbVersion: plugin?.installed_db_version ?? null,
        missingTables: plugin?.missing_tables ?? [],
        schemaError: plugin?.schema_error ?? '',
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? `The wholesale workspace could not be read: ${error.message}`
            : 'The wholesale workspace could not be read.',
      },
      { status: 502 }
    );
  }
}
