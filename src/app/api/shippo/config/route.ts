import { NextResponse } from 'next/server';
import { resolveShippoConfigError } from '@/lib/shippo/config';

export const runtime = 'nodejs';

/**
 * Runtime Shippo status for the client. Enabled = API key + warehouse address
 * are configured and valid. If either is missing, Shippo is disabled and explains why.
 */
export async function GET() {
  const configError = await resolveShippoConfigError();
  const isConfigured = configError === null;
  return NextResponse.json({
    enabled: isConfigured,
    configured: isConfigured,
    reason: configError,
  });
}
