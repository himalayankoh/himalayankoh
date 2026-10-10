import { NextResponse } from 'next/server';
import { getSetting } from '@/lib/settings/serverSettings';

export async function GET() {
  const apiKey = (await getSetting('omnisend', 'api_key')) || process.env.OMNISEND_API_KEY?.trim();

  if (!apiKey) {
    return NextResponse.json({
      connected: false,
      configured: false,
      message: 'Omnisend not configured. Add OMNISEND_API_KEY in Cloudflare environment variables to activate email & SMS automations.',
    });
  }

  try {
    const res = await fetch('https://api.omnisend.com/v3/contacts?limit=1', {
      headers: { 'X-API-KEY': apiKey },
    });

    if (!res.ok) {
      return NextResponse.json({
        connected: false,
        configured: true,
        message: `Omnisend API returned status ${res.status}. Check API key permissions.`,
      });
    }

    const data = await res.json().catch(() => ({}));
    return NextResponse.json({
      connected: true,
      configured: true,
      message: 'Omnisend connected successfully for Himalayan Koh.',
      audience: data.paging?.total || 0,
    });
  } catch (err) {
    return NextResponse.json({
      connected: false,
      configured: true,
      message: `Failed to contact Omnisend: ${(err as Error).message}`,
    });
  }
}
