import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import { getSettingsForCategoryWithStatus } from '@/lib/settings/serverSettings';
import { ADSENSE_PUBLISHER, adSenseFailure, readAdSenseConnection } from '@/lib/google/adsense';

export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const headers = { 'Cache-Control': 'private, no-store' };
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status, headers });
  const settings = await getSettingsForCategoryWithStatus('google_oauth');
  const base = { clientConfigured: Boolean((process.env.GOOGLE_OAUTH_CLIENT_ID || settings.values.client_id)
    && (process.env.GOOGLE_OAUTH_CLIENT_SECRET || settings.values.client_secret)), publisherId: ADSENSE_PUBLISHER, site: 'himalayankoh.com', lastSync: null };
  try {
    await readAdSenseConnection();
    return NextResponse.json({ ...base, connected: true }, { headers });
  } catch (error) {
    const failure = adSenseFailure(error);
    return NextResponse.json({ ...base, connected: false, status: failure.code, message: failure.message }, { headers });
  }
}
