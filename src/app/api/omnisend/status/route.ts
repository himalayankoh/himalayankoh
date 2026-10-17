/**
 * Omnisend connection state, for the admin console.
 *
 * Two things changed here, and both were defects rather than preferences.
 *
 * ## It is admin-only now
 *
 * This route used to answer anyone who asked, and its payload included up to 25
 * subscribers' email addresses plus the account's campaign list. That is customer
 * data behind a public URL. The console already sends its admin bearer token on every
 * other settings call, so requiring it costs the owner nothing and closes the leak.
 *
 * ## It no longer guesses
 *
 * The old handler said `connected: true` whenever a key *existed*, filling any field
 * the provider had not returned with a hardcoded brand id, name and website. So an
 * Omnisend outage, a 401, or an empty account response all rendered as a green
 * "Connected" badge over invented values. `lib/omnisend/status.ts` now decides, from
 * what the provider actually answered, and this route is a thin, authorised wrapper
 * around it.
 */

import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import { readOmnisendStatus } from '@/lib/omnisend/status';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const fresh = new URL(request.url).searchParams.get('fresh') === '1';
  const status = await readOmnisendStatus({ fresh });

  return NextResponse.json(
    {
      ...status,
      // Kept for the existing screens that read these two booleans, but both are now
      // derived from the state above rather than from "a key exists".
      configured: status.configured,
    },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}
