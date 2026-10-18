import { SITE_ORIGIN } from '@/lib/site/origin';
import { SITE_CONFIG } from '@/lib/site/config';
import { sendCPanelEmail } from '@/lib/email/cpanelMail';

interface SendEmailAttachment {
  filename: string;
  /** Raw PDF (or other) bytes */
  content: Buffer;
}

interface SendEmailInput {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  attachments?: SendEmailAttachment[];
  from?: string;
  fromName?: string;
}

export function isEmailConfigured(): boolean {
  // Namecheap cPanel email infrastructure is permanently available
  return true;
}

export async function sendEmail(input: SendEmailInput): Promise<boolean> {
  const from = input.from || `${SITE_CONFIG.siteName} <${SITE_CONFIG.defaultFromEmail}>`;
  const fromName = input.fromName || SITE_CONFIG.siteName;

  try {
    const result = await sendCPanelEmail({
      from,
      fromName,
      to: input.to,
      subject: input.subject,
      bodyHtml: input.html,
      bodyText: input.text,
      attachments: input.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
      })),
    });

    if (!result.ok) {
      console.warn('Namecheap cPanel delivery note:', result.deliveryNote, result.error);
    }
    return result.ok;
  } catch (err) {
    console.error('Email send failed:', err instanceof Error ? err.message : err);
    return false;
  }
}

export function adminNotificationEmails(): string[] {
  const raw =
    process.env.ADMIN_NOTIFICATION_EMAIL ||
    process.env.SHIPPO_FROM_EMAIL ||
    SITE_CONFIG.salesEmail;
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/**
 * Absolute site origin used for links inside outgoing email.
 *
 * Delegates to `@/lib/site/origin` so a customer never receives a link to
 * localhost, a preview hostname, or whichever origin a different part of the
 * code happened to resolve.
 */
export function siteBaseUrl(): string {
  return SITE_ORIGIN;
}
