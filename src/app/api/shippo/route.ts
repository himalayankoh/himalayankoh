import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import { resolveShippoConfigError, resolveShippoFromAddress } from '@/lib/shippo/config';
import { resolveShippoApiKey, shippoRequest } from '@/lib/shippo/server/client';

export const runtime = 'nodejs';

function maskApiKey(key: string): string {
  if (!key) return '';
  if (key.length <= 12) return '••••••••';
  return `${key.slice(0, 11)}••••${key.slice(-4)}`;
}

export async function POST(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const action = String(body.action || '');

  if (action === 'status') {
    const configError = await resolveShippoConfigError();
    const apiKey = await resolveShippoApiKey();
    const from = await resolveShippoFromAddress();

    return NextResponse.json({
      configured: configError === null,
      apiKeyPresent: Boolean(apiKey),
      apiKeyMasked: maskApiKey(apiKey),
      fromName: from.name || '',
      fromAddress: from.street1 || '',
      fromCity: from.city || '',
      fromState: from.state || '',
      fromZip: from.zip || '',
    });
  }

  if (action === 'test') {
    const configError = await resolveShippoConfigError();
    if (configError) {
      return NextResponse.json({
        ok: false,
        message: configError,
      });
    }

    const start = Date.now();
    try {
      await shippoRequest<unknown>('/addresses/?results=1');
      const latencyMs = Date.now() - start;
      return NextResponse.json({
        ok: true,
        message: 'Shippo connection verified',
        latencyMs,
      });
    } catch (error) {
      return NextResponse.json({
        ok: false,
        message: error instanceof Error ? error.message : 'Shippo connection test failed',
        latencyMs: Date.now() - start,
      });
    }
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
