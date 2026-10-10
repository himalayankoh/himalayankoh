import { NextRequest, NextResponse } from 'next/server';
import { getSettingsForCategory, upsertSettings } from '@/lib/settings/serverSettings';
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import { GOOGLE_OAUTH_CALLBACK, GOOGLE_OAUTH_COOKIE, googleOAuthCookieOptions, sealGoogleOAuthValue, validateGoogleOAuthTransaction } from '@/lib/auth/googleOAuth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const finish = (response: NextResponse) => {
    response.headers.set('Cache-Control', 'no-store');
    response.cookies.set(GOOGLE_OAUTH_COOKIE, '', { ...googleOAuthCookieOptions(), maxAge: 0 });
    return response;
  };
  const transaction = await validateGoogleOAuthTransaction(
    request.cookies.get(GOOGLE_OAUTH_COOKIE)?.value || '', url.searchParams.get('state') || '', url.origin,
  );
  if (!transaction) return finish(NextResponse.json({ error: 'Invalid or expired Google authorization. Start again from the admin console.' }, { status: 403 }));
  const auth = await verifyAdminRequest(new Request(request.url, { headers: { Authorization: `Bearer ${transaction.adminToken}` } }));
  if (!auth.ok) return finish(NextResponse.json({ error: auth.error }, { status: auth.status }));
  if (url.searchParams.has('error')) return finish(NextResponse.json({ error: 'Google authorization was not granted.' }, { status: 400 }));
  const code = url.searchParams.get('code');
  if (!code) return finish(NextResponse.json({ error: 'Missing authorization code.' }, { status: 400 }));

  const settings = await getSettingsForCategory('google_oauth');
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() || settings.client_id;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim() || settings.client_secret;
  if (!clientId || !clientSecret) return finish(NextResponse.json({ error: 'Google OAuth credentials are missing.' }, { status: 400 }));
  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret,
        redirect_uri: `${url.origin}${GOOGLE_OAUTH_CALLBACK}`, grant_type: 'authorization_code', code_verifier: transaction.verifier }),
      signal: AbortSignal.timeout(15_000),
    });
    const data = await response.json() as { refresh_token?: unknown; error?: unknown };
    // Only known OAuth error identifiers are safe to return. Never forward the
    // provider description, code, tokens, or credential payload.
    if (!response.ok) {
      const known = ['invalid_grant', 'invalid_client', 'unauthorized_client', 'redirect_uri_mismatch'];
      const providerCode = typeof data.error === 'string' && known.includes(data.error) ? data.error : 'token_exchange_failed';
      const guidance = providerCode === 'invalid_grant'
        ? 'The code may be expired or already used, or the callback/PKCE transaction may not match. Start a fresh connection from Settings in the same browser; do not reload the callback.'
        : providerCode === 'invalid_client' || providerCode === 'unauthorized_client'
          ? 'The server OAuth client credentials were rejected. The owner must verify the matching client ID and replacement secret privately.'
          : providerCode === 'redirect_uri_mismatch'
            ? 'The OAuth client must register this exact storefront callback URL.'
            : 'Start a fresh connection from Settings. If it persists, verify the OAuth client and exact callback privately.';
      return finish(NextResponse.json({ error: `Google rejected the authorization code. ${guidance}`, providerCode }, { status: 502 }));
    }
    if (typeof data.refresh_token !== 'string' || !data.refresh_token) return finish(NextResponse.json({ error: 'Google did not issue a refresh token. Start authorization again and grant offline access.' }, { status: 502 }));
    await upsertSettings('google_oauth', { refresh_token_encrypted: await sealGoogleOAuthValue(data.refresh_token, 'refresh-token') });
    return finish(NextResponse.redirect(`${url.origin}/admin/settings?google=connected`));
  } catch {
    return finish(NextResponse.json({ error: 'Google authorization could not be completed.' }, { status: 502 }));
  }
}
