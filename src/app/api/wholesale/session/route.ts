/**
 * "Who am I?" for the wholesale portal.
 *
 * The portal asks this on load rather than trusting its own stored copy of the
 * buyer: the account is re-read server-side, so an owner who suspends a buyer ends
 * that buyer's portal access on their next request instead of whenever the token
 * happens to expire. The browser's stored session supplies a token and nothing else.
 */

import { NextResponse } from 'next/server';
import { isWholesaleAuthConfigured } from '@/lib/wholesale/session';
import { requireActiveBuyer } from '@/lib/wholesale/requireBuyer';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  if (!isWholesaleAuthConfigured()) {
    // 200 with `configured: false` rather than an error: an unconfigured portal is a
    // state the login screen renders, not a failure the buyer should see as broken.
    return NextResponse.json({ configured: false, authenticated: false });
  }

  const gate = await requireActiveBuyer(request);
  if (!gate.ok) return gate.response;

  const { account } = gate;
  return NextResponse.json({
    configured: true,
    authenticated: true,
    buyer: {
      accountId: account.rowId,
      ref: account.ref,
      company: account.companyName,
      contactName: account.contactName,
      email: account.email,
      phone: account.phone,
      country: account.country,
      website: account.website,
      businessType: account.businessType,
      status: account.status,
      destinationCountry: account.destinationCountry,
      destinationPort: account.destinationPort,
      paymentTerms: account.paymentTerms,
      approvedAt: account.approvedAt,
    },
  });
}
