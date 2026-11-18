/**
 * Sends a fresh confirmation link.
 *
 * The old link is a hashed, single-use token with a 48-hour expiry, so once it has
 * expired there is nothing to recover from it — this is the only way back in for an
 * account that never confirmed. It answers one sentence for every address:
 * registered, unconfirmed, already confirmed or unknown. Nothing in the reply says
 * whether a message actually went out: a field that differed for a real account would
 * turn this into a way to enumerate customers.
 *
 * Two budgets stand in the way of mail-bombing: the Worker's per-IP limit here
 * (cheap, but per isolate) and WordPress's per-account cooldown plus daily cap,
 * which is the durable one because it is stored in user meta.
 */
import { NextResponse } from 'next/server';

import { resendWordPressCustomerVerification } from '@/lib/auth/wordpressCustomerAuth';
import { clientIp } from '@/lib/http/clientIp';
import { checkRateLimit } from '@/lib/rateLimit';
import { SITE_ORIGIN } from '@/lib/site/origin';

const RESEND_RATE_LIMIT = { limit: 5, windowMs: 60 * 60 * 1000 };

const GENERIC_MESSAGE =
  'If that account still needs confirming, we have sent a new link. Check your inbox and spam folder.';

export async function POST(request: Request) {
  const ip = clientIp(request);
  const rl = checkRateLimit(`resend-verification:${ip}`, RESEND_RATE_LIMIT);
  if (!rl.allowed) {
    return NextResponse.json(
      {
        error:
          'Too many confirmation emails were requested from this connection. Please try again later, or email ws@himalayankoh.com.',
      },
      { status: 429 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const login = String(body.login ?? '').trim();
  if (!login) {
    return NextResponse.json(
      { error: 'Enter the email address or username on the account.' },
      { status: 400 }
    );
  }

  const result = await resendWordPressCustomerVerification({ login, origin: SITE_ORIGIN });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ message: GENERIC_MESSAGE });
}
