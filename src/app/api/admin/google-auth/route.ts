import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import { readBearerToken } from '@/lib/auth/adminSession';
import { getSettingsForCategory } from '@/lib/settings/serverSettings';
import { createGoogleOAuthTransaction, GOOGLE_OAUTH_CALLBACK, GOOGLE_OAUTH_COOKIE, googleOAuthCookieOptions, googleOAuthOriginAllowed } from '@/lib/auth/googleOAuth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const origin = new URL(request.url).origin;
  if (!googleOAuthOriginAllowed(origin)) return NextResponse.json({ error: 'Google authorization is unavailable on this host.' }, { status: 403 });
  const settings = await getSettingsForCategory('google_oauth');
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() || settings.client_id;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim() || settings.client_secret;
  if (!clientId || !clientSecret) return NextResponse.json({ error: 'Configure the Google OAuth client ID and secret on the server first.' }, { status: 400 });

  const transaction = await createGoogleOAuthTransaction(readBearerToken(request)!, origin);
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({
    client_id: clientId, redirect_uri: `${origin}${GOOGLE_OAUTH_CALLBACK}`,
    response_type: 'code', access_type: 'offline', prompt: 'consent',
    scope: new URL(request.url).searchParams.get('service') === 'search-console'
      ? 'https://www.googleapis.com/auth/webmasters.readonly'
      : 'https://www.googleapis.com/auth/webmasters.readonly https://www.googleapis.com/auth/adsense.readonly',
    state: transaction.state, code_challenge: transaction.challenge, code_challenge_method: 'S256',
  }).toString();
  // A bare browser link cannot carry the admin Authorization header.
  const response = NextResponse.json({ authUrl: url.toString() }, { headers: { 'Cache-Control': 'no-store' } });
  response.cookies.set(GOOGLE_OAUTH_COOKIE, transaction.cookie, googleOAuthCookieOptions());
  return response;
}
