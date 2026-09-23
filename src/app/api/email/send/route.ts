import { NextRequest, NextResponse } from 'next/server';
import { sendEmail, isEmailConfigured } from '@/lib/email/sendEmail';
import { SITE_CONFIG } from '@/lib/site/config';

/**
 * POST /api/email/send
 *
 * Sends a test or transactional email.
 *
 * Safety guards — TWO conditions must both be true for real sending:
 *   1. RESEND_API_KEY must be configured (isEmailConfigured() === true)
 *   2. EMAIL_SEND_ENABLED must be set to "true" in server environment
 *
 * If either is absent, the request is logged and returns a SIMULATION response.
 * A failed provider response is reported as an error, never as success.
 * API keys are never exposed to the browser.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const to = String(body.to || SITE_CONFIG.forwardDestination).trim();
    const subject = String(body.subject || `${SITE_CONFIG.siteName} test email`).trim();
    const text = String(body.text || '').trim();
    const html = String(body.html || `<p>${text}</p>`).trim();

    if (!to) {
      // No recipient and no configured default. Named honestly, because the likeliest
      // cause is a deployment that never set the forwarding inbox rather than a bad
      // request — and "Recipient address required" would send someone looking at the
      // form instead of at the environment.
      return NextResponse.json(
        {
          ok: false,
          error:
            'No recipient given, and no default is configured. Set CLOUDFLARE_EMAIL_FORWARD in the server environment, or pass an explicit recipient.',
        },
        { status: 400 }
      );
    }

    const providerConfigured = isEmailConfigured();
    const sendEnabled = SITE_CONFIG.emailSendEnabled;

    if (providerConfigured && sendEnabled) {
      // Real send path — both guards cleared
      const sent = await sendEmail({ to, subject, html, text });
      if (sent) {
        return NextResponse.json({ ok: true, message: `Email sent to ${to} from ${SITE_CONFIG.defaultFromEmail}` });
      }
      // Provider accepted the request but reported failure
      return NextResponse.json(
        { ok: false, error: 'Provider reported failure. Check Resend dashboard for details.' },
        { status: 500 }
      );
    }

    // Simulation mode — determine which guard failed for transparency
    const reason = !providerConfigured
      ? 'RESEND_API_KEY is not configured'
      : 'EMAIL_SEND_ENABLED is not set to "true" in the server environment';

    console.info('[email/send] Simulation mode —', reason);

    return NextResponse.json({
      ok: true,
      simulated: true,
      reason,
      message: `[SIMULATION] Would send from ${SITE_CONFIG.defaultFromEmail} → ${to}. No email was sent. ${reason}.`,
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
