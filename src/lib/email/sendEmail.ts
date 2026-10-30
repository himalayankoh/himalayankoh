import { SITE_ORIGIN } from '@/lib/site/origin';
import { SITE_CONFIG } from '@/lib/site/config';
import { sendCPanelEmail, isCPanelConfigured } from '@/lib/email/cpanelMail';

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
  /**
   * Where a reply should go, when that is not the sender address.
   *
   * A wholesale inquiry is sent *from* the wholesale mailbox and must be answered by
   * the buyer, so the notification carries their address here rather than pretending
   * to be from them — sending as the buyer would fail SPF/DKIM at the first hop.
   */
  replyTo?: string;
}

export function isEmailConfigured(senderEmail?: string): boolean {
  return isCPanelConfigured(senderEmail);
}

export async function sendEmail(input: SendEmailInput): Promise<boolean> {
  const requestedSender = input.from?.match(/<([^>]+)>/)?.[1] || input.from;
  if (requestedSender !== 'ws@himalayankoh.com' && !isEmailConfigured(requestedSender)) {
    console.warn('[sendEmail] Email sending aborted: Authenticated Namecheap SMTP credentials are not configured.');
    return false;
  }
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
      headers: input.replyTo ? { 'Reply-To': input.replyTo } : undefined,
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
