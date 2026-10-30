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
import { WordPressApiError } from '@/lib/backend/wordpress';
import { checkRateLimit } from '@/lib/rateLimit';
import { wholesaleDisabled } from '@/lib/wholesale/gate';
import {
  confirmWholesaleEmail,
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

  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid confirmation request.' }, { status: 400 });
  const token = typeof body.token === 'string' ? body.token.trim() : '';
  if (token.length < 20 || token.length > 64 || !/^[a-f0-9]+$/i.test(token)) {
    return NextResponse.json({ error: 'That confirmation link is not valid.' }, { status: 400 });
  }

  try {
    const updated = await confirmWholesaleEmail(token);
    const id = Number(updated.id);
    const now = new Date();
    const stamp = now.toISOString().slice(0, 19).replace('T', ' ');
    const actor = 'applicant-email-verification';

    // Re-run the evidence now that the address is proven, so the console cannot show
    // "pending email verification" on a row whose email was just confirmed.
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
      { status: error instanceof WordPressApiError && error.status === 410 ? 410 : 502 }
    );
  }
}
