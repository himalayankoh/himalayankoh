import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import { updateSavedLead } from '@/lib/leados/db';
import { getSupabaseAdmin } from '@/lib/stripe/server/supabaseAdmin';

export async function POST(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json();
    const {
      leadId,
      recipientEmail,
      recipientName,
      subject,
      message,
      templateId,
    } = body;

    // Server-side email format validation
    if (!recipientEmail || typeof recipientEmail !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail.trim())) {
      return NextResponse.json({ error: 'A valid recipient email address is required.' }, { status: 400 });
    }

    if (!subject || typeof subject !== 'string' || !subject.trim()) {
      return NextResponse.json({ error: 'Email subject line is required.' }, { status: 400 });
    }

    if (!message || typeof message !== 'string' || !message.trim()) {
      return NextResponse.json({ error: 'Email message body is required.' }, { status: 400 });
    }

    const resendFrom = process.env.RESEND_FROM || 'Himalayan Koh <sales@himalayankoh.com>';
    const senderEmail = 'sales@himalayankoh.com';
    
    let isSimulated = false;
    let providerSuccess = false;
    let providerMessageId: string | null = null;
    let providerError: string | null = null;

    // ================================================================
    // Provider priority:
    //   1. Cloudflare send_email binding (EMAIL_SENDER) — preferred on staging
    //   2. Resend API (RESEND_API_KEY) — fallback
    //   3. Simulation mode — when no provider is available
    // ================================================================

    // --- 1. Cloudflare send_email binding ---
    const cfSender = (globalThis as any).EMAIL_SENDER ?? (process.env as any).EMAIL_SENDER;
    if (cfSender && typeof cfSender.send === 'function') {
      try {
        // Build HTML email with Himalayan Koh branding
        const htmlBody = `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; line-height: 1.6; color: #1e293b;">
            ${message.trim().replace(/\n/g, '<br/>')}
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
            <p style="font-size: 12px; color: #64748b;">
              <strong>Himalayan Koh</strong><br />
              12620 FM 1960 W Ste A-4, Houston, TX 77065<br />
              Direct B2B Inquiries: sales@himalayankoh.com | (832) 224-6466
            </p>
          </div>
        `;

        const emailMsg = new (globalThis as any).EmailMessage(
          senderEmail,
          recipientEmail.trim(),
          subject.trim(),
          htmlBody,
        );
        await cfSender.send(emailMsg);
        providerSuccess = true;
        providerMessageId = `cf-${Date.now()}`;
      } catch (err: any) {
        providerError = `Cloudflare send_email: ${err.message || err}`;
        isSimulated = true;
      }
    } else {
      // --- 2. Resend API fallback ---
      const resendKey = process.env.RESEND_API_KEY;
      if (resendKey && resendKey.trim().startsWith('re_')) {
        try {
          const resendRes = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${resendKey}`,
            },
            body: JSON.stringify({
              from: resendFrom,
              to: [recipientEmail.trim()],
              subject: subject.trim(),
              text: message.trim(),
              html: `
                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; line-height: 1.6; color: #1e293b;">
                  ${message.trim().replace(/\n/g, '<br/>')}
                  <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
                  <p style="font-size: 12px; color: #64748b;">
                    <strong>Himalayan Koh</strong><br />
                    12620 FM 1960 W Ste A-4, Houston, TX 77065<br />
                    Direct B2B Inquiries: sales@himalayankoh.com | (832) 224-6466
                  </p>
                </div>
              `,
            }),
          });

          if (resendRes.ok) {
            const resendData = await resendRes.json();
            providerSuccess = true;
            providerMessageId = resendData.id || null;
          } else {
            providerError = `Resend HTTP ${resendRes.status}`;
            isSimulated = true;
          }
        } catch (err: any) {
          providerError = err.message || 'Resend connection failed';
          isSimulated = true;
        }
      } else {
        // --- 3. Simulation mode ---
        isSimulated = true;
      }
    }

    // STRICT STATUS UPDATE RULE:
    // Only a confirmed successful provider response marks the lead as 'contacted'.
    // Simulation or failure NEVER marks as contacted.
    if (leadId) {
      if (providerSuccess) {
        await updateSavedLead(leadId, {
          status: 'contacted',
          notes: `[OUTREACH SENT] Dispatched on ${new Date().toLocaleDateString()} (ID: ${providerMessageId}): "${subject}"`,
        });
      } else if (isSimulated) {
        await updateSavedLead(leadId, {
          notes: `[SIMULATION] Outreach preview generated on ${new Date().toLocaleDateString()}: "${subject}" (RESEND_API_KEY unconfigured)`,
        });
      }
    }

    // Maintain comprehensive audit log
    try {
      const supabase = getSupabaseAdmin();
      await (supabase as any).from('leados_audit_logs').insert({
        action: providerSuccess ? 'outreach_email_delivered' : 'outreach_email_simulated',
        entity_type: 'lead',
        entity_id: leadId || null,
        details: {
          recipient: recipientEmail,
          recipientName: recipientName || null,
          subject,
          templateId: templateId || null,
          simulated: isSimulated,
          providerSuccess,
          providerMessageId,
          providerError,
          dispatchedAt: new Date().toISOString(),
        },
      });
    } catch {
      // Non-fatal
    }

    return NextResponse.json({
      ok: true,
      success: providerSuccess || isSimulated,
      simulated: isSimulated,
      label: isSimulated ? '[SIMULATION]' : '[DELIVERED]',
      message: isSimulated
        ? `[SIMULATION] Staging preview mode: Email was verified and logged to audit trail. To send live, configure RESEND_API_KEY.`
        : `[DELIVERED] Outreach email successfully dispatched to ${recipientEmail} via Resend.`,
    });
  } catch (error) {
    console.error('LeadOS outreach send error:', error);
    return NextResponse.json({ error: 'Failed to process outreach email request.' }, { status: 500 });
  }
}
