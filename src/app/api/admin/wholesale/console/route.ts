/**
 * The wholesale console, in one authenticated read.
 *
 * ## Why the console has its own endpoint
 *
 * The console is one screen. It used to be filled by two requests — the workspace and
 * the overview — and those two, between them, asked WordPress for the order book
 * twice. This route asks for each store once: it runs the workspace fan-out and the
 * plugin's `COUNT` summary together, then hands the order book it already holds to the
 * overview's utilisation averages. Sixteen upstream reads instead of seventeen, and one
 * Workers invocation instead of two (so one session verification instead of two).
 *
 * That is the whole of the saving, and it is deliberately the small, provable one. What
 * *looks* like a bigger saving — deriving the overview's counts from the rows the
 * workspace already fetched — is refused: those rows are capped at 200 per store while
 * the counts are measured over every row, so a derived count would be an undercount the
 * owner could not see. `lib/wholesale/consoleSnapshot` states both the fan-out and that
 * refusal.
 *
 * ## One picture, not two
 *
 * Two parallel reads also meant two snapshots: a quotation raised between them would be
 * counted on the Overview tab and missing from the Quotations tab until the next
 * reload. One read is one consistent picture — the same reason the workspace itself has
 * always been a single call.
 *
 * ## The narrower routes stay
 *
 * `/workspace` and `/overview` are still served, from the same module, for any caller
 * that wants one half and should not be charged for the other. The console is the only
 * screen that wants both, so it is the only one that pays for both.
 */

import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import { wholesaleDisabled } from '@/lib/wholesale/gate';
import { readWholesaleConsole } from '@/lib/wholesale/consoleSnapshot';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const disabled = wholesaleDisabled();
  if (disabled) return disabled;

  try {
    return NextResponse.json(await readWholesaleConsole());
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
