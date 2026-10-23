import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import { wholesaleDisabled } from '@/lib/wholesale/gate';
import { checkRateLimit } from '@/lib/rateLimit';
import { resendInquiryNotification } from '@/lib/wholesale/inquiryNotification';

export async function POST(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const disabled = wholesaleDisabled();
  if (disabled) return disabled;
  const body = await request.json().catch(() => null);
  const id = Number(body?.inquiryId);
  if (!Number.isSafeInteger(id) || id <= 0 || body?.confirm !== true) return NextResponse.json({ error: 'Confirm the inquiry notification resend.' }, { status: 400 });
  if (!checkRateLimit(`wholesale-resend:${id}`, { limit: 2, windowMs: 15 * 60_000 }).allowed) return NextResponse.json({ error: 'This notification was retried recently. Check delivery before retrying.' }, { status: 429 });
  try {
    const result = await resendInquiryNotification(id, auth.admin.email || auth.admin.username || 'admin');
    return NextResponse.json(result, { status: result.adminNotified ? 200 : 502 });
  } catch {
    return NextResponse.json({ error: 'The notification could not be resent. The stored inquiry is unchanged.' }, { status: 502 });
  }
}
