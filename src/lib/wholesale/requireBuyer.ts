/**
 * The gate every buyer-facing wholesale route goes through.
 *
 * Five routes need the same three facts — who is asking, whether their account is
 * still active, and the account id their own rows are filtered by — and the account
 * status can change *after* a session was minted (an owner suspends a buyer
 * mid-contract). Checking it once here, per request, is what makes suspension
 * immediate rather than "when the token expires".
 *
 * The account is re-read from the plugin by the id in the session, never by an email
 * or an id from the request body: a buyer may name a quote id, never their identity.
 *
 * Server-only.
 */

import { NextResponse } from 'next/server';
import { wholesaleDisabled } from './gate';
import { accountFromRow, type AccountRecord } from './mapping';
import { verifyWholesaleRequest } from './session';
import { listWholesaleRecords } from './store';

export type BuyerGate =
  | { ok: true; buyer: { accountId: number; email: string; company: string }; account: AccountRecord }
  | { ok: false; response: NextResponse };

/** The message a suspended or unreadable account gets. No record id is disclosed. */
const SUSPENDED =
  'This wholesale account is not active. Contact your account manager.';

/**
 * Resolves the signed-in buyer, or the response that should be returned instead.
 *
 * A caller does `const gate = await requireActiveBuyer(request); if (!gate.ok) return gate.response;`
 * and then has a verified buyer and a live account.
 */
export async function requireActiveBuyer(request: Request): Promise<BuyerGate> {
  // Every buyer-facing route goes through here, so the switch has one home on the
  // buyer side rather than one per route.
  const disabled = wholesaleDisabled();
  if (disabled) return { ok: false, response: disabled };

  const verified = await verifyWholesaleRequest(request);
  if (!verified.ok) {
    return { ok: false, response: NextResponse.json({ error: verified.error }, { status: verified.status }) };
  }

  let account: AccountRecord;
  try {
    const rows = await listWholesaleRecords('accounts', { id: verified.buyer.accountId, limit: 1 });
    if (!rows.length) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: 'That wholesale account no longer exists.' },
          { status: 401 }
        ),
      };
    }
    account = accountFromRow(rows[0]);
  } catch (error) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error:
            error instanceof Error
              ? `The wholesale account could not be read: ${error.message}`
              : 'The wholesale account could not be read.',
        },
        { status: 502 }
      ),
    };
  }

  if (account.status !== 'ACTIVE') {
    return { ok: false, response: NextResponse.json({ error: SUSPENDED, accountStatus: account.rawStatus }, { status: 403 }) };
  }

  try {
    const applications = await listWholesaleRecords('applications', { account_id: verified.buyer.accountId, limit: 10 });
    const approved = applications.find((row) => String(row.status).toUpperCase() === 'APPROVED');
    const expiry = approved?.resale_expires ? new Date(`${approved.resale_expires}T23:59:59Z`).getTime() : null;
    if (!approved || !approved.email_verified_at || ['REVERIFICATION_REQUIRED', 'EXPIRED', 'SUSPENDED', 'REJECTED'].includes(String(approved.certificate_status)) || (expiry !== null && expiry < Date.now())) {
      return { ok: false, response: NextResponse.json({ error: 'Wholesale access requires an approved application, verified email and current certificate. Contact the wholesale team.' }, { status: 403 }) };
    }
  } catch {
    return { ok: false, response: NextResponse.json({ error: 'Certificate status could not be verified. Try again shortly.' }, { status: 503 }) };
  }

  return { ok: true, buyer: verified.buyer, account };
}
