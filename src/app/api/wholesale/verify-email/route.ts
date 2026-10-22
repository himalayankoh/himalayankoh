/**
 * Confirming a wholesale applicant's business email.
 *
 * The browser holds only the token that was emailed to the applicant. The token is
 * looked up **server-side** with the site's administrator credential, so WordPress
 * needs no public endpoint for this: the wholesale namespace stays entirely behind
 * `manage_options`, and a caller with no token learns nothing.
 *
 * The write is single use — the token is cleared in the same update that stamps the
 * timestamp — and the certificate checks are re-run afterwards, because "the email is
 * now proven" changes what the stored evidence says. The status can still only be
 * `AUTOMATED_CHECKS_COMPLETED` or `ADDITIONAL_INFO_REQUIRED`; confirmation never
 * approves an account.
 */

import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { wholesaleDisabled } from '@/lib/wholesale/gate';
import {
  getWholesaleRecord,
  listWholesaleRecords,
  upsertWholesaleRecord,
} from '@/lib/wholesale/store';
import { applicationReference, recheckStoredApplication } from '@/lib/wholesale/certificateReview';

export const dynamic = 'force-dynamic';

function clientKey(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for') || '';
  const ip =
    request.headers.get('cf-connecting-ip') ||
    forwarded.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown';
  return `wholesale-verify:${ip}`;
}

export async function POST(request: Request) {
  const disabled = wholesaleDisabled();
  if (disabled) return disabled;

  const limit = checkRateLimit(clientKey(request), { limit: 20, windowMs: 60 * 60 * 1000 });
  if (!limit.allowed) {
    return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 });
  }

  let body: { token?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const token = typeof body.token === 'string' ? body.token.trim() : '';
  if (token.length < 20 || token.length > 64 || !/^[a-f0-9]+$/i.test(token)) {
    return NextResponse.json({ error: 'That confirmation link is not valid.' }, { status: 400 });
  }

  try {
    const rows = await listWholesaleRecords('applications', { email_verification_token: token, limit: 5 });

    /**
     * The token is compared again here, against the row the plugin returned.
     *
     * The filter is the fast path, but the plugin on the site may be an older build
     * that does not know that filter yet — it would ignore the parameter and return
     * the first application. Writing to that row would verify a stranger's email, so
     * the token must match the row before anything is changed. This is the check that
     * makes a plugin/deployment version skew harmless instead of dangerous.
     */
    const row = rows.find((entry) => {
      const stored = typeof entry.email_verification_token === 'string' ? entry.email_verification_token : '';
      return stored.length > 0 && stored === token;
    });

    if (!row) {
      return NextResponse.json(
        {
          error:
            'This confirmation link has already been used or has expired. If your email is not confirmed yet, apply again or contact the wholesale team.',
        },
        { status: 410 }
      );
    }

    const id = Number(row.id ?? 0);
    if (!id) {
      return NextResponse.json({ error: 'That confirmation link is not valid.' }, { status: 400 });
    }

    const now = new Date();
    const stamp = now.toISOString().slice(0, 19).replace('T', ' ');
    const actor = 'applicant-email-verification';

    await upsertWholesaleRecord(
      'applications',
      { email_verified_at: stamp, email_verification_token: '' },
      { id, actor }
    );

    // Re-run the evidence now that the address is proven, so the console cannot show
    // "pending email verification" on a row whose email was just confirmed.
    const updated = await getWholesaleRecord('applications', id);
    const { verification, write } = recheckStoredApplication(updated, actor, now);
    await upsertWholesaleRecord('applications', { ...write } as Record<string, unknown>, { id, actor });

    await upsertWholesaleRecord(
      'audit',
      {
        at: stamp,
        actor: 'applicant',
        action: 'application_email_verified',
        entity: 'applications',
        entity_id: id,
        detail: { email: String(updated.email ?? '') },
      },
      { id: 0, actor }
    ).catch(() => undefined);

    return NextResponse.json({
      verified: true,
      reference: applicationReference(id),
      status: verification.status,
      message:
        'Your business email is confirmed. Our wholesale team will review your resale certificate and reply by email.',
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? `The link could not be confirmed: ${error.message}`
            : 'The link could not be confirmed.',
      },
      { status: 502 }
    );
  }
}
