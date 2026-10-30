/**
 * Wholesale portal sign-in.
 *
 * ## The three questions, in order
 *
 *   1. **Is this a real WordPress/WooCommerce user, with that password?** Answered by
 *      the storefront plugin's own `/customer/login`, which checks the hash where it
 *      lives. This route never sees a hash and never stores the password.
 *   2. **Does that email hold an ACTIVE wholesale account?** Answered by the wholesale
 *      plugin's `/access`, which returns the account only when it is active. A pending
 *      or rejected applicant gets the reason, not a session.
 *   3. **Only then**, mint a wholesale session carrying that account's id.
 *
 * ## Why the portal is not the retail login
 *
 * A wholesaler signs in on `/wholesale/login`, and what they get is a *wholesale*
 * session — its own key, its own role, its own 14-day lifetime. It does not make
 * them a retail customer, it cannot read a retail account, and a retail customer
 * token cannot open the portal. The owner's console login is a third thing again and
 * is untouched by any of this.
 *
 * ## What is deliberately not here
 *
 * No password reset, no sign-up. A wholesale account is created by approving an
 * application, not by self-service — so this route only ever answers "sign in" or
 * "not an approved wholesale customer yet".
 */

import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { verifyWordPressCustomerCredentials } from '@/lib/auth/wordpressCustomerAuth';
import { wholesaleDisabled } from '@/lib/wholesale/gate';
import {
  createWholesaleSession,
  isWholesaleAuthConfigured,
  wholesaleSessionTtlMs,
} from '@/lib/wholesale/session';
import { readWholesaleAccess, upsertWholesaleRecord } from '@/lib/wholesale/store';
import { accountFromRow } from '@/lib/wholesale/mapping';

export const dynamic = 'force-dynamic';

/**
 * The rate-limit key: the caller's address.
 *
 * `cf-connecting-ip` first, matching the admin sign-in route: Cloudflare sets it at
 * the edge, so a client cannot forge it to get a fresh allowance for a password guess.
 */
function clientKey(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for') || '';
  const ip =
    request.headers.get('cf-connecting-ip') ||
    forwarded.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown';
  return `wholesale-login:${ip}`;
}

/** What an applicant whose application is not approved yet should be told. */
const STATUS_MESSAGES: Record<string, string> = {
  PENDING:
    'Your wholesale application is still being reviewed. We will email the business address on the application.',
  MORE_INFO_REQUIRED:
    'We need a little more information before we can open your wholesale account. Check your email for our question.',
  REJECTED: 'This wholesale application was not approved. Reply to our email if you think that is wrong.',
  SUSPENDED: 'This wholesale account is currently suspended. Contact your account manager.',
  NONE: 'No wholesale account is registered for that email. Apply for a wholesale account to get started.',
};

export async function POST(request: Request) {
  const disabled = wholesaleDisabled();
  if (disabled) return disabled;

  const limit = checkRateLimit(clientKey(request), { limit: 10, windowMs: 15 * 60 * 1000 });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many sign-in attempts. Wait a few minutes and try again.' },
      { status: 429 }
    );
  }

  if (!isWholesaleAuthConfigured()) {
    return NextResponse.json(
      { error: 'The wholesale portal is not configured on the server.' },
      { status: 503 }
    );
  }

  let body: { login?: string; email?: string; password?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const login = String(body.login ?? body.email ?? '').trim();
  const password = String(body.password ?? '');
  if (!login || !password) {
    return NextResponse.json({ error: 'Enter your email and password.' }, { status: 400 });
  }

  const verified = await verifyWordPressCustomerCredentials(login, password);
  if (!verified.ok) {
    return NextResponse.json({ error: verified.error }, { status: verified.status });
  }

  // The email WordPress reported, not the one that was typed: the account lookup
  // must key off the identity that was verified.
  const email = verified.customer.email.toLowerCase();

  let access;
  try {
    access = await readWholesaleAccess(email);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? `The wholesale records could not be read: ${error.message}`
            : 'The wholesale records could not be read.',
      },
      { status: 502 }
    );
  }

  if (!access.account) {
    return NextResponse.json(
      {
        error: STATUS_MESSAGES[access.status] || STATUS_MESSAGES.NONE,
        applicationStatus: access.status,
      },
      { status: 403 }
    );
  }

  const account = accountFromRow(access.account);

  // Link the account to the WordPress user that just proved the password, so the
  // record of who a wholesale account belongs to stops depending on an email match.
  if (!account.wpUserId || account.wpUserId !== verified.customer.id) {
    try {
      await upsertWholesaleRecord(
        'accounts',
        { wp_user_id: verified.customer.id },
        { id: account.rowId, actor: 'wholesale-login' }
      );
    } catch {
      /* a failed link must not deny a buyer who was verified and approved */
    }
  }

  const { token, payload } = await createWholesaleSession({
    accountId: account.rowId,
    email: account.email || email,
    company: account.companyName,
    role: account.role,
  });

  return NextResponse.json({
    token,
    expiresAt: payload.exp,
    ttlMs: wholesaleSessionTtlMs(),
    buyer: {
      accountId: account.rowId,
      ref: account.ref,
      company: account.companyName,
      contactName: account.contactName,
      email: account.email || email,
      country: account.country,
      role: account.role,
      destinationCountry: account.destinationCountry,
      destinationPort: account.destinationPort,
      paymentTerms: account.paymentTerms,
    },
  });
}
