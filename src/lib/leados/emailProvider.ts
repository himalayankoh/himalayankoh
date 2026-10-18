import { sendCPanelEmail } from '@/lib/email/cpanelMail';

export type OutreachDeliveryState =
  | 'simulated'
  | 'provider_unavailable'
  | 'provider_failed'
  | 'delivered';

export interface OutreachDeliveryResult {
  state: OutreachDeliveryState;
  provider: 'simulation' | 'resend' | 'cpanel-exim';
  providerMessageId: string | null;
  error?: string;
}

export interface OutreachEmailInput {
  to: string;
  subject: string;
  text: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildOutreachHtml(text: string, fromEmail = 'sales@himalayankoh.com'): string {
  return `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#1e293b;">${escapeHtml(text).replace(/\n/g, '<br/>')}<hr><p style="font-size:12px;color:#64748b"><strong>Himalayan Koh</strong><br>Direct B2B inquiries: ${escapeHtml(fromEmail)}</p></div>`;
}

export async function sendLeadOSMail(
  input: OutreachEmailInput,
  options: { simulationRequested: boolean },
): Promise<OutreachDeliveryResult> {
  if (options.simulationRequested) {
    return { state: 'simulated', provider: 'simulation', providerMessageId: null };
  }

  if (process.env.OUTREACH_PROVIDER_UNAVAILABLE === 'true') {
    return {
      state: 'provider_unavailable',
      provider: 'cpanel-exim',
      providerMessageId: null,
    };
  }

  const fromEmail = 'sales@himalayankoh.com';
  const fromName = 'Himalayan Koh Commercial Sales';

  try {
    const htmlBody = buildOutreachHtml(input.text, fromEmail);
    const result = await sendCPanelEmail({
      from: fromEmail,
      fromName,
      to: [input.to],
      subject: input.subject,
      bodyText: input.text,
      bodyHtml: htmlBody,
    });

    if (result.ok) {
      return {
        state: 'delivered',
        provider: 'cpanel-exim',
        providerMessageId: result.messageId,
      };
    }

    return {
      state: 'provider_failed',
      provider: 'cpanel-exim',
      providerMessageId: null,
      error: result.error || result.deliveryNote,
    };
  } catch (error) {
    return {
      state: 'provider_failed',
      provider: 'cpanel-exim',
      providerMessageId: null,
      error: error instanceof Error ? error.message : 'Namecheap cPanel email delivery error.',
    };
  }
}
