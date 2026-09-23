import { NextRequest, NextResponse } from 'next/server';
import { SITE_CONFIG } from '@/lib/site/config';

/**
 * GET /api/email/routes    — list current routing addresses
 * POST /api/email/routes   — add a new forwarding address
 * DELETE /api/email/routes — remove a forwarding address
 *
 * Preview/staging implementation: routes are stored in-memory for the
 * current server instance. A production implementation would call the
 * Cloudflare Email Routing API using SITE_CONFIG.cloudflareToken.
 *
 * Routes are always forwarded to SITE_CONFIG.forwardDestination.
 */

const DOMAIN = SITE_CONFIG.emailDomain;
const DEFAULT_DESTINATION = SITE_CONFIG.forwardDestination;

// In-memory route store (stateless preview/staging).
// Production: replace with Cloudflare Email Routing API calls.
const IN_MEMORY_ROUTES: Array<{
  id: string;
  address: string;
  local: string;
  forwardsTo: string;
  enabled: boolean;
}> = [
  { id: '1', address: `sales@${DOMAIN}`, local: 'sales', forwardsTo: DEFAULT_DESTINATION, enabled: true },
  { id: '2', address: `contact@${DOMAIN}`, local: 'contact', forwardsTo: DEFAULT_DESTINATION, enabled: true },
  { id: '3', address: `info@${DOMAIN}`, local: 'info', forwardsTo: DEFAULT_DESTINATION, enabled: true },
  { id: '4', address: `support@${DOMAIN}`, local: 'support', forwardsTo: DEFAULT_DESTINATION, enabled: true },
];

export async function GET() {
  const hasToken = Boolean(SITE_CONFIG.cloudflareToken);
  return NextResponse.json({
    ok: true,
    configured: hasToken,
    domain: DOMAIN,
    routes: IN_MEMORY_ROUTES,
    // Only reported when the deployment names one. An empty address would read as a
    // destination and is not: this route's whole job is to say where mail goes, so
    // "nowhere configured" has to look different from a destination.
    destinations: DEFAULT_DESTINATION
      ? [
          {
            email: DEFAULT_DESTINATION,
            verified: false,
            note: 'Verification state unknown — check Cloudflare dashboard.',
          },
        ]
      : [],
    note: hasToken
      ? 'Cloudflare API token present. Routes shown are in-memory defaults for preview/staging. Live sync with Cloudflare requires CF API integration.'
      : 'CLOUDFLARE_API_TOKEN not set. Routes shown are preview defaults only — not synced to Cloudflare.',
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const name = String(body.name || '').trim().toLowerCase().replace(/@.*$/, '');
    const forwardTo = String(body.forwardTo || DEFAULT_DESTINATION).trim();

    if (!name) {
      return NextResponse.json({ ok: false, error: 'Address local part is required' }, { status: 400 });
    }

    // Refuse rather than add a route that forwards to nothing. The caller no longer
    // supplies this value (the browser used to, from a hardcoded address), so an
    // empty one means the deployment has not configured a forwarding inbox — a
    // server setting, not something a request can invent.
    if (!forwardTo) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'No forwarding inbox is configured. Set CLOUDFLARE_EMAIL_FORWARD in the server environment so new addresses have somewhere to deliver.',
        },
        { status: 503 }
      );
    }

    const fullAddress = `${name}@${DOMAIN}`;
    if (!IN_MEMORY_ROUTES.find((r) => r.local === name)) {
      IN_MEMORY_ROUTES.push({
        id: String(Date.now()),
        address: fullAddress,
        local: name,
        forwardsTo: forwardTo,
        enabled: true,
      });
    }

    return NextResponse.json({
      ok: true,
      message: `[PREVIEW] Address ${fullAddress} → ${forwardTo} added (in-memory). Persist permanently in the Cloudflare dashboard.`,
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const name = searchParams.get('name')?.trim().toLowerCase();

  if (!name) {
    return NextResponse.json({ ok: false, error: 'Address local part is required' }, { status: 400 });
  }

  const idx = IN_MEMORY_ROUTES.findIndex((r) => r.local === name);
  if (idx !== -1) IN_MEMORY_ROUTES.splice(idx, 1);

  return NextResponse.json({
    ok: true,
    message: `[PREVIEW] Address ${name}@${DOMAIN} removed (in-memory only). Remove permanently in the Cloudflare dashboard.`,
  });
}
