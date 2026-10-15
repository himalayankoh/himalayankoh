import { NextResponse } from 'next/server';
import {
  exchangeMetaAuthCode,
  getManagedFacebookPages,
  setConnectedMetaAccounts,
} from '@/lib/leados/meta-client';

export const runtime = 'edge';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');
  const errorDescription = url.searchParams.get('error_description');

  const redirectTarget = new URL('/admin/leados', url.origin);

  if (error || !code) {
    redirectTarget.searchParams.set('meta_error', errorDescription || error || 'Missing authorization code');
    return NextResponse.redirect(redirectTarget.toString());
  }

  try {
    const redirectUri = `${url.protocol}//${url.host}/api/leados/meta/callback`;
    const tokenInfo = await exchangeMetaAuthCode(code, redirectUri);
    const pages = await getManagedFacebookPages(tokenInfo.accessToken);

    if (!pages || pages.length === 0) {
      redirectTarget.searchParams.set('meta_error', 'No managed Facebook Pages found on your Meta account.');
      return NextResponse.redirect(redirectTarget.toString());
    }

    // Match Himalayan Koh Page or use first available
    const hkPage = pages.find((p) => /himalayan\s*koh/i.test(p.name)) || pages[0];

    // Store connected accounts
    setConnectedMetaAccounts({
      page: hkPage,
      userAccessToken: tokenInfo.accessToken,
    });

    redirectTarget.searchParams.set('meta_connected', 'true');
    redirectTarget.searchParams.set('page_name', hkPage.name);
    return NextResponse.redirect(redirectTarget.toString());
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Meta callback processing failed';
    redirectTarget.searchParams.set('meta_error', msg);
    return NextResponse.redirect(redirectTarget.toString());
  }
}
