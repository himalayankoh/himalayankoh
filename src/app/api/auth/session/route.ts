/**
 * Who is this? — answered by the server, from the signed token.
 *
 * The console needs to know whether the visitor is an administrator, and the only
 * thing entitled to answer that is the server that checked the credential. This
 * route is that answer: it reads the Bearer token, verifies the HMAC with the same
 * code every protected route uses, and returns the role the token actually carries.
 *
 * It exists because the client used to decide for itself, by comparing the session's
 * email against a hardcoded list of administrator addresses. That is a client-side
 * authorization rule — an email string is not a credential, and a customer whose
 * address happened to match would have been handed the console's UI. The role now
 * travels one way only: the server issues it at sign-in, the client displays it.
 *
 * Both identities are answered, because a browser can hold either:
 *
 *   admin    → role `admin`,    identity from `ADMIN_SESSION_SECRET`-signed token
 *   customer → role `customer`, identity from `CUSTOMER_SESSION_SECRET`-signed token
 *
 * Unauthenticated is a first-class answer (`authenticated: false`, HTTP 200) rather
 * than a 401: the caller is asking a question, not making a request that failed, and
 * a 401 would have the console showing an error for a visitor who is simply signed
 * out. No secret, digest or password is ever part of the response — only the
 * identity the token itself already carries.
 */

import { NextResponse } from 'next/server';
import { readBearerToken, verifyAdminSessionToken } from '@/lib/auth/adminSession';
import { verifyCustomerSessionToken } from '@/lib/auth/customerSession';

export const dynamic = 'force-dynamic';

/** Never cached: this is a per-request identity, and a shared cache would serve one. */
const NO_STORE = { 'Cache-Control': 'no-store' } as const;

export async function GET(request: Request) {
  const token = readBearerToken(request);

  if (token) {
    const admin = await verifyAdminSessionToken(token);
    if (admin) {
      return NextResponse.json(
        {
          authenticated: true,
          role: 'admin' as const,
          user: {
            id: admin.sub,
            email: admin.email || '',
            name: admin.name || admin.username,
            username: admin.username,
          },
        },
        { headers: NO_STORE }
      );
    }

    const customer = await verifyCustomerSessionToken(token);
    if (customer) {
      return NextResponse.json(
        {
          authenticated: true,
          role: 'customer' as const,
          user: {
            id: String(customer.cid),
            email: customer.email || '',
            name: customer.name,
          },
        },
        { headers: NO_STORE }
      );
    }
  }

  // Either no credential, or one this server did not sign (tampered, expired, or
  // minted by a deployment whose keys were rotated). Both are "not signed in".
  return NextResponse.json({ authenticated: false, role: null, user: null }, { headers: NO_STORE });
}
