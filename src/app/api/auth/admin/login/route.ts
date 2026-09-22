/**
 * Admin sign-in — the owner's login, in, and a signed session out.
 *
 * Two credential sources, tried in this order:
 *
 *  1. **Configured admin accounts** (`ADMIN_LOGIN_ACCOUNTS`, see
 *     `lib/auth/adminAccounts`). These are the owner's existing console logins —
 *     the same addresses and passwords the admin console used before Supabase was
 *     retired. They need no WordPress round trip, so the console stays reachable
 *     even when WordPress is down or has no matching user.
 *  2. **WordPress administrators** — a WordPress username plus an application
 *     password, verified against the WordPress REST API and requiring the
 *     `administrator` role.
 *
 * Either way the answer is the same shape: an HMAC-signed session token that
 * every later admin request carries as a Bearer credential. Passwords are never
 * stored, logged, or echoed back.
 *
 * The token is stateless, so there is deliberately no logout endpoint: signing
 * out is the client discarding it, and its lifetime is bounded by the token's own
 * expiry. To revoke sessions sooner, rotate `ADMIN_SESSION_SECRET` — that
 * invalidates every issued token at once.
 *
 * GET on this path reports which sources are configured, so the login screen can
 * say so honestly instead of offering a form that cannot succeed. It never
 * reveals an identifier: "is admin sign-in configured?" is a legitimate thing for
 * an anonymous caller to ask, "which email addresses are administrators?" is not.
 */

import { NextResponse } from 'next/server';
import {
  areAdminAccountsConfigured,
  verifyAdminAccount,
} from '@/lib/auth/adminAccounts';
import { createAdminSession, isAdminAuthConfigured } from '@/lib/auth/adminSession';
import {
  isWordPressAuthConfigured,
  verifyWordPressAdminCredentials,
} from '@/lib/auth/wordpressAdminAuth';
import { checkRateLimit } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

/** Attempts allowed per (caller, identifier) pair inside the window. */
const LOGIN_ATTEMPT_LIMIT = 10;
const LOGIN_ATTEMPT_WINDOW_MS = 10 * 60_000;

/** Best-effort caller identity for rate limiting behind a proxy/CDN. */
function callerKey(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const first = forwarded ? forwarded.split(',')[0].trim() : '';
  return (
    request.headers.get('cf-connecting-ip') || first || request.headers.get('x-real-ip') || 'unknown'
  );
}

interface AdminIdentity {
  id: string;
  username: string;
  email: string;
  name: string;
}

/** Mints the session and answers. The only place a token is ever created. */
async function issueSession(identity: AdminIdentity) {
  const { token, payload } = await createAdminSession(identity);

  return NextResponse.json({
    token,
    expiresAt: payload.exp,
    user: {
      id: payload.sub,
      username: identity.username,
      email: identity.email,
      name: identity.name,
      role: 'admin' as const,
    },
  });
}

export async function GET() {
  return NextResponse.json({
    /** Both sources are reported: the screen can say *why* a login would fail. */
    configured: isAdminAuthConfigured() && (isWordPressAuthConfigured() || areAdminAccountsConfigured()),
    /** The signing key is present, so a token issued here could be verified. */
    signingConfigured: isAdminAuthConfigured(),
    /** The owner's configured logins are present. */
    loginAccountsConfigured: areAdminAccountsConfigured(),
    /** A WordPress origin is configured, so application passwords can be checked. */
    wordpressConfigured: isWordPressAuthConfigured(),
  });
}

export async function POST(request: Request) {
  if (!isAdminAuthConfigured()) {
    return NextResponse.json(
      {
        error:
          'Admin sign-in is not configured on the server. Set ADMIN_SESSION_SECRET (at least 16 characters) and redeploy.',
      },
      { status: 503 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const record = (body ?? {}) as Record<string, unknown>;
  const username = typeof record.username === 'string' ? record.username.trim() : '';
  const password = typeof record.password === 'string' ? record.password : '';

  if (!username || !password) {
    return NextResponse.json(
      { error: 'Enter your email/username and password.' },
      { status: 400 }
    );
  }

  const limit = checkRateLimit(`admin-login:${callerKey(request)}:${username.toLowerCase()}`, {
    limit: LOGIN_ATTEMPT_LIMIT,
    windowMs: LOGIN_ATTEMPT_WINDOW_MS,
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many sign-in attempts. Wait a few minutes and try again.' },
      { status: 429 }
    );
  }

  const configuredAdmin = await verifyAdminAccount(username, password);
  if (configuredAdmin) {
    const { identifier, name } = configuredAdmin;
    return issueSession({
      id: identifier,
      username: identifier,
      // A configured login may be a WordPress-style login name rather than an
      // address; only fill `email` when it actually is one.
      email: identifier.includes('@') ? identifier : '',
      // The entry's own display name when it has one, otherwise the identifier —
      // the console must never invent a name for whoever signed in.
      name: name || identifier,
    });
  }

  // Distinguish "no second source to try" from "the password was wrong". Falling
  // through to WordPress when it is not configured would answer 503 for a typo,
  // which reads as a deployment problem and sends the owner looking in the wrong
  // place.
  if (!isWordPressAuthConfigured()) {
    if (areAdminAccountsConfigured()) {
      return NextResponse.json({ error: 'Wrong email/username or password.' }, { status: 401 });
    }
    return NextResponse.json(
      {
        error:
          'No admin login is configured on the server. Set ADMIN_LOGIN_ACCOUNTS (npm run admin:hash -- "password"), or WORDPRESS_BASE_URL plus an administrator application password.',
      },
      { status: 503 }
    );
  }

  const result = await verifyWordPressAdminCredentials(username, password);
  if (!result.ok) {
    // WordPress's own message is worth passing through when it says something
    // specific — "that account is not an administrator", "application passwords
    // are disabled". On a plain 401 with configured accounts also in play, it is
    // actively misleading: someone who typed their console email with a typo
    // would be told to check a WordPress application password they never had.
    const message =
      result.status === 401 && areAdminAccountsConfigured()
        ? 'Wrong email/username or password.'
        : result.error;

    return NextResponse.json({ error: message }, { status: result.status });
  }

  return issueSession(result.user);
}
