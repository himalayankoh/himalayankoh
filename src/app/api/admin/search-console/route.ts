import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import { readSearchConsole, SearchConsoleError } from '@/lib/google/searchConsole';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await verifyAdminRequest(request);
  const headers = { 'Cache-Control': 'no-store' };
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status, headers });
  const days = Number(new URL(request.url).searchParams.get('days') ?? '28');
  if (![7, 28, 90].includes(days)) return NextResponse.json({ error: 'days must be 7, 28 or 90.' }, { status: 400, headers });
  try {
    return NextResponse.json(await readSearchConsole(days), { headers });
  } catch (error) {
    if (error instanceof SearchConsoleError) return NextResponse.json({ connected: false, status: error.code, error: error.message }, { status: error.status, headers });
    // Provider errors can contain credential material. Never echo or log them.
    return NextResponse.json({ connected: false, status: 'GOOGLE_API_ERROR', error: 'Search Console could not be read. Try again.' }, { status: 502, headers });
  }
}
