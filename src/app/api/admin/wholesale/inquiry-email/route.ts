import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import { wholesaleDisabled } from '@/lib/wholesale/gate';
import { checkRateLimit } from '@/lib/rateLimit';
import { resendInquiryNotification, sendQuoteDecisionNotification } from '@/lib/wholesale/inquiryNotification';

export async function POST(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const disabled = wholesaleDisabled();
  if (disabled) return disabled;

  const body = await request.json().catch(() => null);
  const id = Number(body?.inquiryId);
  if (!Number.isSafeInteger(id) || id <= 0 || body?.confirm !== true) {
    return NextResponse.json({ error: 'Confirm the inquiry notification action.' }, { status: 400 });
  }

  const action = String(body?.action || 'resend').toLowerCase();
  const actor = auth.admin.email || auth.admin.username || 'admin';

  if (!['resend', 'approve', 'decline'].includes(action)) {
    return NextResponse.json({ error: `Unknown notification action: ${action}` }, { status: 400 });
  }

  const rateLimitKey = `wholesale-email-${action}:${id}`;
  if (!checkRateLimit(rateLimitKey, { limit: 5, windowMs: 15 * 60_000 }).allowed) {
    return NextResponse.json(
      { error: 'This notification action was executed recently. Check delivery before retrying.' },
      { status: 429 }
    );
  }

  try {
    if (action === 'approve' || action === 'decline') {
      const reason = typeof body?.reason === 'string' ? body.reason : undefined;
      const isCounterOffer = Boolean(body?.isCounterOffer);
      const counterNote = typeof body?.counterNote === 'string' ? body.counterNote : undefined;
      const result = await sendQuoteDecisionNotification(id, action, actor, { reason, isCounterOffer, counterNote });
      return NextResponse.json(result, { status: result.buyerNotified ? 200 : 502 });
    } else {
      const result = await resendInquiryNotification(id, actor);
      return NextResponse.json(result, { status: result.adminNotified ? 200 : 502 });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'The notification could not be dispatched.';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
