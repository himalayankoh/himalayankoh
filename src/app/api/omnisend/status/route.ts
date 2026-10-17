import { NextResponse } from 'next/server';
import { resolveOmnisendApiKey } from '@/lib/omnisend/client';

export async function GET() {
  const apiKey = await resolveOmnisendApiKey();

  if (!apiKey) {
    return NextResponse.json({
      connected: false,
      configured: false,
      message: 'Omnisend not configured. Add OMNISEND_API_KEY in environment variables or Admin Settings to activate email & SMS automations.',
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
      plan: 'Free Tier (500 emails/month, 250 contacts)',
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
