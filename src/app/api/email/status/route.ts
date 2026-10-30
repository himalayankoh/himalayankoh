import { NextResponse } from 'next/server';
import { SITE_CONFIG } from '@/lib/site/config';
import { resolveOmnisendApiKey } from '@/lib/omnisend/client';

export const dynamic = 'force-dynamic';

/**
 * GET /api/email/status
 *
 * Reports the REAL state of email configuration — never fabricates green ticks.
 *
 * Honesty rules:
 * - inbound routing: we can confirm the CF token is present but CANNOT verify
 *   live routing rules without calling the Cloudflare API. State = NOT_VERIFIED.
 * - outbound sending: we can confirm Resend key presence and EMAIL_SEND_ENABLED
 *   flag but cannot confirm delivery without sending a message. State = CONFIGURED
 *   or SIMULATION depending on the flag.
 * - SPF / DKIM: DNS records cannot be verified from application code. State = NOT_VERIFIED.
 * - Omnisend: reports configured status and Free Tier parameters.
 */
export async function GET() {
  const hasCloudflareToken = Boolean(SITE_CONFIG.cloudflareToken);
  const hasResend = Boolean(SITE_CONFIG.resendKey);
  const sendEnabled = SITE_CONFIG.emailSendEnabled;
  const omnisendKey = SITE_CONFIG.omnisendKey || (await resolveOmnisendApiKey());

  return NextResponse.json({
    ok: true,
    domain: SITE_CONFIG.emailDomain,
    forwardDestination: SITE_CONFIG.forwardDestination,

    inbound: {
      status: hasCloudflareToken ? ('NOT_VERIFIED' as const) : ('NOT_CONFIGURED' as const),
      cloudflareTokenPresent: hasCloudflareToken,
      note: hasCloudflareToken
        ? 'Cloudflare API token is present. Routing rules are NOT_VERIFIED from the application — check the Cloudflare dashboard to confirm active rules.'
        : 'CLOUDFLARE_API_TOKEN is not set. Inbound email routing cannot be verified or managed from the application.',
    },

    outbound: {
      status: !hasResend
        ? ('NOT_CONFIGURED' as const)
        : !sendEnabled
          ? ('SIMULATION' as const)
          : ('CONFIGURED' as const),
      sender: SITE_CONFIG.defaultFromEmail,
      resendConfigured: hasResend,
      sendEnabled,
      note: !hasResend
        ? 'RESEND_API_KEY is not set — outbound email is in simulation mode. No emails are sent.'
        : !sendEnabled
          ? 'Resend is configured but EMAIL_SEND_ENABLED is not set to "true". Real sending is intentionally disabled (simulation mode). Set EMAIL_SEND_ENABLED=true in server environment to enable.'
          : 'Outbound email is configured and real sending is enabled.',
    },

    spf: {
      status: 'NOT_VERIFIED' as const,
      note: 'SPF records cannot be verified from application code. Verify in Cloudflare DNS or MXToolbox.',
    },
    dkim: {
      status: 'NOT_VERIFIED' as const,
      note: 'DKIM cannot be verified from application code. Verify in Cloudflare DNS or MXToolbox.',
    },

    omnisend: {
      status: omnisendKey
        ? ('CONFIGURED' as const)
        : ('NOT_CONFIGURED' as const),
      note: omnisendKey
        ? 'OMNISEND_API_KEY is present and active (Free Tier: 500 emails/mo, 250 contacts).'
        : 'OMNISEND_API_KEY is not set.',
    },
  });
}

