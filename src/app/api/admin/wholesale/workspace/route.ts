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
 * The fan-out itself — which stores are read, in what shapes, and how they are allowed
 * to fail — is stated in `lib/wholesale/consoleSnapshot`, so this route and the
 * console's aggregate read cannot drift apart. `/overview` is the same module's other
 * half; the console asks for both at once through `/console`.
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
import { readWholesaleWorkspaceSources, wholesaleWorkspacePayload } from '@/lib/wholesale/consoleSnapshot';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const disabled = wholesaleDisabled();
  if (disabled) return disabled;

  try {
    return NextResponse.json(wholesaleWorkspacePayload(await readWholesaleWorkspaceSources()));
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
