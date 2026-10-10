import { getSetting } from '@/lib/settings/serverSettings';

export type OutreachDeliveryState =
  | 'simulated'
  | 'provider_unavailable'
  | 'provider_failed'
  | 'delivered';

export interface OutreachDeliveryResult {
  state: OutreachDeliveryState;
  provider: 'simulation' | 'resend';
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

  const key = (await getSetting('resend', 'api_key')) || process.env.RESEND_API_KEY?.trim();
  const fromEmail = (await getSetting('resend', 'from_email')) || 'sales@himalayankoh.com';
  const fromName = 'Himalayan Koh';

  if (!key || !key.startsWith('re_')) {
    return {
      state: 'provider_unavailable',
      provider: 'resend',
      providerMessageId: null,
      error: 'LeadOS email provider is not configured.',
    };
  }

  const from = `${fromName} <${fromEmail}>`;
  try {
    const htmlBody = buildOutreachHtml(input.text, fromEmail);
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ from, to: [input.to], subject: input.subject, text: input.text, html: htmlBody }),
      signal: AbortSignal.timeout(15000),
    });
    const body = await response.json().catch(() => ({})) as { id?: string; message?: string };
    if (!response.ok) {
      return { state: 'provider_failed', provider: 'resend', providerMessageId: null, error: body.message || `Provider HTTP ${response.status}` };
    }
    return { state: 'delivered', provider: 'resend', providerMessageId: body.id || null };
  } catch (error) {
    return { state: 'provider_failed', provider: 'resend', providerMessageId: null, error: error instanceof Error ? error.message : 'Provider request failed.' };
  }
}
