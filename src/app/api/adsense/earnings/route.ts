import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import { adSenseFailure, readAdSenseEarnings } from '@/lib/google/adsense';
import { checkRateLimit } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const headers = { 'Cache-Control': 'private, no-store' };
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status, headers });
  if (!checkRateLimit(`adsense-report:${auth.userId}`, { limit: 6, windowMs: 60_000 }).allowed) {
    return NextResponse.json({ error: 'Wait a minute before requesting another AdSense report.' }, { status: 429, headers });
  }
  try {
    return NextResponse.json({ connected: true, data: await readAdSenseEarnings() }, { headers });
  } catch (error) {
    const failure = adSenseFailure(error);
    return NextResponse.json({ connected: false, data: null, status: failure.code, error: failure.message }, { status: failure.status, headers });
  }
}
