import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import { getMetaOAuthUrl } from '@/lib/leados/meta-client';

export const runtime = 'edge';

export async function GET(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const platform = (searchParams.get('platform') === 'instagram' ? 'instagram' : 'facebook') as 'facebook' | 'instagram';
  
  // Build absolute redirect URI
  const requestUrl = new URL(request.url);
  const redirectUri = `${requestUrl.protocol}//${requestUrl.host}/api/leados/meta/callback`;
  const randomBytesArr = new Uint8Array(16);
  crypto.getRandomValues(randomBytesArr);
  const csrfState = Array.from(randomBytesArr, (b) => b.toString(16).padStart(2, '0')).join('');

  const { url, error } = getMetaOAuthUrl(platform, redirectUri, csrfState);

  if (error || !url) {
    return NextResponse.json({
      ok: false,
      error: error || 'Failed to generate Meta OAuth URL.',
      configured: false,
      ownerAction: 'Add META_APP_ID and META_APP_SECRET to Cloudflare Worker secrets or environment variables.',
    }, { status: 400 });
  }

  if (searchParams.get('redirect') === 'true') {
    return NextResponse.redirect(url);
  }

  return NextResponse.json({
    ok: true,
    platform,
    url,
    csrfState,
    redirectUri,
  });
}
