/**
 * Himalayan Koh — Namecheap cPanel Email Infrastructure Client
 *
 * Outbound email delivery using Namecheap/cPanel Exim infrastructure:
 * Host: premium164.web-hosting.com (@ 162.0.209.25)
 * SMTPS: Port 465 (TLS with verified certificates)
 * Senders:
 *   - sales@himalayankoh.com
 *   - support@himalayankoh.com
 *   - salman@himalayankoh.com
 *   - admin@himalayankoh.com
 *
 * FAILS CLOSED:
 * - Requires explicit, authenticated SMTP credentials (no guessing or fallback to hosting passwords).
 * - Enforces TLS certificate verification (rejectUnauthorized: true).
 * - Treats SMTP 250 as accepted/queued by Exim, never as confirmed recipient inbox delivery.
 * - Never fabricates delivery success on failure or exception.
 * - Strictly NO RESEND.
 */

export interface EmailAttachment {
  filename: string;
  mimeType?: string;
  sizeBytes?: number;
  contentBase64?: string;
  content?: Buffer | string;
}

export interface CPanelEmailInput {
  from?: string;
  fromName?: string;
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject: string;
  bodyText?: string;
  bodyHtml?: string;
  attachments?: EmailAttachment[];
  headers?: Record<string, string>;
  /** The RFC 5322 Message-ID the caller already recorded for this message. */
  messageId?: string;
  simulate?: boolean;
}

export interface CPanelEmailResult {
  ok: boolean;
  messageId: string;
  deliveryStatus: 'accepted' | 'delivered' | 'simulated' | 'failed';
  provider: 'cpanel-exim' | 'cpanel-relay' | 'simulation';
  deliveryNote: string;
  error?: string;
  timestamp: string;
}

export const AUTHORIZED_SENDERS = [
  'sales@himalayankoh.com',
  'support@himalayankoh.com',
  'orders@himalayankoh.com',
  'marketing@himalayankoh.com',
  'salman@himalayankoh.com',
  'admin@himalayankoh.com',
] as const;

export type AuthorizedSender = (typeof AUTHORIZED_SENDERS)[number];

export const SENDER_PROFILES: Record<
  AuthorizedSender,
  { name: string; email: AuthorizedSender; title: string }
> = {
  'sales@himalayankoh.com': {
    name: 'Himalayan Koh Commercial Sales',
    email: 'sales@himalayankoh.com',
    title: 'B2B Wholesale & Commercial Sales',
  },
  'support@himalayankoh.com': {
    name: 'Himalayan Koh Customer Support',
    email: 'support@himalayankoh.com',
    title: 'Customer Service & Inquiries',
  },
  'orders@himalayankoh.com': {
    name: 'Himalayan Koh Orders & Fulfillment',
    email: 'orders@himalayankoh.com',
    title: 'Customer Orders, Invoices & Logistics',
  },
  'marketing@himalayankoh.com': {
    name: 'Himalayan Koh Livestock Division',
    email: 'marketing@himalayankoh.com',
    title: 'Livestock & Farm Supply Outreach',
  },
  'salman@himalayankoh.com': {
    name: 'Salman — Himalayan Koh',
    email: 'salman@himalayankoh.com',
    title: 'Executive & Founder',
  },
  'admin@himalayankoh.com': {
    name: 'Himalayan Koh Administration',
    email: 'admin@himalayankoh.com',
    title: 'System & Security Operations',
  },
};

export const DEFAULT_AUTHORIZED_RECIPIENT = '8002salman@gmail.com';

export function isAuthorizedSender(email: string): email is AuthorizedSender {
  const norm = email.trim().toLowerCase();
  return AUTHORIZED_SENDERS.includes(norm as AuthorizedSender);
}

export function resolveAuthorizedSender(sender?: string): { email: AuthorizedSender; name: string } {
  if (!sender) {
    return SENDER_PROFILES['sales@himalayankoh.com'];
  }
  const match = sender.match(/<([^>]+)>/);
  const emailCandidate = (match ? match[1] : sender).trim().toLowerCase();
  if (isAuthorizedSender(emailCandidate)) {
    return SENDER_PROFILES[emailCandidate];
  }
  return SENDER_PROFILES['sales@himalayankoh.com'];
}

export interface CPanelCredentials {
  host: string;
  port: number;
  user: string;
  pass: string;
}

import { getEmailAccountSync, getEmailAccount, type MailboxEmail, SUPPORTED_MAILBOXES } from './accountConfig';

/**
 * Resolve dedicated authenticated SMTP credentials.
 * Checks stored account settings in WordPress first, then dedicated environment variables.
 * NEVER guesses passwords or reuses general hosting/WordPress passwords.
 */
export async function resolveCPanelCredentialsAsync(senderEmail?: string): Promise<CPanelCredentials | null> {
  const host = process.env.NAMECHEAP_SMTP_HOST || 'premium164.web-hosting.com';
  const port = Number(process.env.NAMECHEAP_SMTP_PORT || 465);

  if (senderEmail) {
    const norm = senderEmail.trim().toLowerCase();
    if (SUPPORTED_MAILBOXES.includes(norm as MailboxEmail)) {
      try {
        const stored = await getEmailAccount(norm as MailboxEmail);
        if (stored && stored.smtpPass && stored.smtpUser) {
          return {
            host: stored.smtpHost || host,
            port: stored.smtpPort || port,
            user: stored.smtpUser,
            pass: stored.smtpPass,
          };
        }
      } catch {
        // Fall back to env
      }
    }
  }
  return resolveCPanelCredentials(senderEmail);
}

export function resolveCPanelCredentials(senderEmail?: string): CPanelCredentials | null {
  const host = process.env.NAMECHEAP_SMTP_HOST || 'premium164.web-hosting.com';
  const port = Number(process.env.NAMECHEAP_SMTP_PORT || 465);

  if (senderEmail) {
    const norm = senderEmail.trim().toLowerCase();
    if (SUPPORTED_MAILBOXES.includes(norm as MailboxEmail)) {
      try {
        const stored = getEmailAccountSync(norm as MailboxEmail);
        if (stored && stored.smtpPass && stored.smtpUser) {
          return {
            host: stored.smtpHost || host,
            port: stored.smtpPort || port,
            user: stored.smtpUser,
            pass: stored.smtpPass,
          };
        }
      } catch {
        // Fall back to env
      }
    }

    const cleanKey = norm.replace(/[^a-z0-9]/g, '_').toUpperCase();
    const senderPass = process.env[`SMTP_PASS_${cleanKey}`] || process.env[`NAMECHEAP_SMTP_PASS_${cleanKey}`];
    const senderUser = process.env[`SMTP_USER_${cleanKey}`] || process.env[`NAMECHEAP_SMTP_USER_${cleanKey}`] || norm;
    if (senderPass && senderUser) {
      return { host, port, user: senderUser, pass: senderPass };
    }
  }

  const user = process.env.NAMECHEAP_SMTP_USER || process.env.SMTP_USER;
  const pass = process.env.NAMECHEAP_SMTP_PASS || process.env.SMTP_PASS;

  if (user && pass) {
    return { host, port, user: user.trim(), pass: pass.trim() };
  }

  return null;
}

export function isCPanelConfigured(senderEmail?: string): boolean {
  return Boolean(resolveCPanelCredentials(senderEmail));
}

/**
 * Generate RFC 5322 Compliant Message-ID
 */
export function generateMessageId(domain = 'himalayankoh.com'): string {
  const timestamp = Date.now();
  const rand = Math.random().toString(36).slice(2, 10);
  return `<hk-${timestamp}-${rand}@${domain}>`;
}

/**
 * Build RFC 5322 MIME message raw string
 */
export function encodeTextPart(text: string, type: 'text/plain' | 'text/html'): string {
  const b64 = Buffer.from(text, 'utf8').toString('base64');
  const chunks = b64.match(/.{1,76}/g) || [b64];
  const wrapped = chunks.join('\r\n');
  return `Content-Type: ${type}; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${wrapped}\r\n\r\n`;
}

function buildMimeMessage(input: {
  from: string;
  fromName: string;
  to: string[];
  cc?: string[];
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  messageId: string;
  inReplyTo?: string;
  references?: string[];
  attachments?: EmailAttachment[];
  /** Extra RFC 5322 headers, e.g. `Reply-To`. CR/LF are stripped from each value. */
  headers?: Record<string, string>;
}): string {
  const boundary = `====_hk_part_${Date.now()}_${Math.random().toString(36).slice(2, 8)}_====`;
  const altBoundary = `====_hk_alt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}_====`;

  const headers: string[] = [
    `From: "${input.fromName.replace(/"/g, '')}" <${input.from}>`,
    `To: ${input.to.join(', ')}`,
    ...(input.cc && input.cc.length > 0 ? [`Cc: ${input.cc.join(', ')}`] : []),
    `Subject: =?UTF-8?B?${Buffer.from(input.subject, 'utf8').toString('base64')}?=`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: ${input.messageId}`,
    `MIME-Version: 1.0`,
  ];

  if (input.inReplyTo) {
    headers.push(`In-Reply-To: ${input.inReplyTo}`);
  }
  if (input.references && input.references.length > 0) {
    headers.push(`References: ${input.references.join(' ')}`);
  }
  for (const [name, value] of Object.entries(input.headers || {})) {
    // A header value is one line. Anything else is header injection.
    if (!/^[A-Za-z-]+$/.test(name)) continue;
    const clean = String(value).replace(/[\r\n]+/g, ' ').trim();
    if (clean) headers.push(`${name}: ${clean}`);
  }

  const hasAttachments = input.attachments && input.attachments.length > 0;

  if (hasAttachments) {
    headers.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
  } else if (input.bodyHtml) {
    headers.push(`Content-Type: multipart/alternative; boundary="${altBoundary}"`);
  } else {
    headers.push(`Content-Type: text/plain; charset=UTF-8`);
  }

  let body = '';

  if (hasAttachments) {
    body += `--${boundary}\r\n`;
    if (input.bodyHtml) {
      body += `Content-Type: multipart/alternative; boundary="${altBoundary}"\r\n\r\n`;
      body += `--${altBoundary}\r\n`;
      body += encodeTextPart(input.bodyText, 'text/plain');
      body += `--${altBoundary}\r\n`;
      body += encodeTextPart(input.bodyHtml, 'text/html');
      body += `--${altBoundary}--\r\n\r\n`;
    } else {
      body += encodeTextPart(input.bodyText, 'text/plain');
    }

    for (const att of input.attachments || []) {
      const filename = att.filename || 'attachment';
      const mime = att.mimeType || 'application/octet-stream';
      let b64 = att.contentBase64 || '';
      if (!b64 && att.content) {
        b64 = Buffer.isBuffer(att.content) ? att.content.toString('base64') : Buffer.from(att.content).toString('base64');
      }
      body += `--${boundary}\r\n`;
      body += `Content-Type: ${mime}; name="${filename}"\r\n`;
      body += `Content-Disposition: attachment; filename="${filename}"\r\n`;
      body += `Content-Transfer-Encoding: base64\r\n\r\n`;
      body += `${b64.match(/.{1,76}/g)?.join('\r\n') || b64}\r\n\r\n`;
    }
    body += `--${boundary}--\r\n`;
  } else if (input.bodyHtml) {
    body += `--${altBoundary}\r\n`;
    body += encodeTextPart(input.bodyText, 'text/plain');
    body += `--${altBoundary}\r\n`;
    body += encodeTextPart(input.bodyHtml, 'text/html');
    body += `--${altBoundary}--\r\n`;
  } else {
    body += encodeTextPart(input.bodyText, 'text/plain');
  }

  return `${headers.join('\r\n')}\r\n\r\n${body}`;
}

/**
 * Deliver outbound email via Namecheap cPanel email infrastructure.
 * FAILS CLOSED if unconfigured, unauthenticated, or rejected.
 */
export async function sendCPanelEmail(input: CPanelEmailInput): Promise<CPanelEmailResult> {
  const timestamp = new Date().toISOString();
  // Reuse the id the inbox already stored, so the sent message and the record that
  // links it to its thread share one Message-ID instead of two unrelated ones.
  const messageId = input.messageId || generateMessageId();
  const sender = resolveAuthorizedSender(input.from);
  const fromName = input.fromName || sender.name;

  const toList = (Array.isArray(input.to) ? input.to : [input.to])
    .map((e) => e.trim())
    .filter(Boolean);
  const ccList = (Array.isArray(input.cc) ? input.cc : input.cc ? [input.cc] : [])
    .map((e) => e.trim())
    .filter(Boolean);
  const bccList = (Array.isArray(input.bcc) ? input.bcc : input.bcc ? [input.bcc] : [])
    .map((e) => e.trim())
    .filter(Boolean);

  if (toList.length === 0) {
    return {
      ok: false,
      messageId,
      deliveryStatus: 'failed',
      provider: 'cpanel-exim',
      deliveryNote: 'Recipient address required.',
      error: 'No valid recipient address provided.',
      timestamp,
    };
  }

  const bodyText = input.bodyText || input.subject;
  const bodyHtml = input.bodyHtml;

  // Simulation mode check: explicitly declared simulation only
  if (input.simulate || process.env.EMAIL_SIMULATE === 'true') {
    return {
      ok: true,
      messageId,
      deliveryStatus: 'simulated',
      provider: 'simulation',
      deliveryNote: `Simulated dispatch from ${sender.email} to ${toList.join(', ')} (Simulation Mode)`,
      timestamp,
    };
  }

  // Resolve dedicated authenticated SMTP credentials
  const creds = (await resolveCPanelCredentialsAsync(sender.email)) || resolveCPanelCredentials(sender.email);
  if (!creds) {
    return {
      ok: false,
      messageId,
      deliveryStatus: 'failed',
      provider: 'cpanel-exim',
      deliveryNote: `No authenticated SMTP credentials configured for ${sender.email}. Transport failed closed.`,
      error: `Missing authenticated SMTP credentials for ${sender.email}. Set NAMECHEAP_SMTP_USER and NAMECHEAP_SMTP_PASS.`,
      timestamp,
    };
  }

  const { host, port, user, pass } = creds;

  try {
    const rawMime = buildMimeMessage({
      from: sender.email,
      fromName,
      to: toList,
      cc: ccList,
      subject: input.subject,
      bodyText,
      bodyHtml,
      messageId,
      attachments: input.attachments,
      headers: input.headers,
    });

    if (typeof process !== 'undefined' && process.versions && process.versions.node) {
      const tls = await import('node:tls');

      const sendPromise = new Promise<CPanelEmailResult>((resolve) => {
        let timedOut = false;
        const timeout = setTimeout(() => {
          timedOut = true;
          socket.destroy();
          resolve({
            ok: false,
            messageId,
            deliveryStatus: 'failed',
            provider: 'cpanel-exim',
            deliveryNote: `SMTP connection timeout to ${host}:${port}`,
            error: `Connection to ${host}:${port} timed out after 12s`,
            timestamp,
          });
        }, 12000);

        // STABLE TLS CERTIFICATE VERIFICATION ENFORCED
        const socket = tls.connect(
          port,
          host,
          { rejectUnauthorized: true, servername: host },
          () => {
            // Connected with valid, verified TLS certificate
          }
        );

        socket.setEncoding('utf8');
        let step = 0;
        let authSent = false;

        socket.on('data', (data: string) => {
          if (timedOut) return;
          const lines = data.split('\r\n').filter(Boolean);
          const lastLine = lines[lines.length - 1] || '';

          if (step === 0 && lastLine.startsWith('220')) {
            step = 1;
            socket.write(`EHLO himalayankoh.com\r\n`);
          } else if (step === 1 && (lastLine.startsWith('250') || lastLine.includes('250 '))) {
            step = 2;
            socket.write(`AUTH LOGIN\r\n`);
          } else if (step === 2 && lastLine.startsWith('334')) {
            step = 3;
            socket.write(`${Buffer.from(user).toString('base64')}\r\n`);
          } else if (step === 3 && lastLine.startsWith('334')) {
            step = 4;
            authSent = true;
            socket.write(`${Buffer.from(pass).toString('base64')}\r\n`);
          } else if (step === 4) {
            if (authSent && lastLine.startsWith('235')) {
              // Successfully authenticated
              step = 5;
              socket.write(`MAIL FROM:<${sender.email}>\r\n`);
            } else if (authSent && (lastLine.startsWith('535') || lastLine.startsWith('5'))) {
              clearTimeout(timeout);
              socket.end();
              resolve({
                ok: false,
                messageId,
                deliveryStatus: 'failed',
                provider: 'cpanel-exim',
                deliveryNote: `Namecheap cPanel SMTP Auth failed (${lastLine.trim()})`,
                error: `Authentication rejected: ${lastLine.trim()}`,
                timestamp,
              });
            }
          } else if (step === 5 && lastLine.startsWith('250')) {
            step = 6;
            const allRcpts = [...toList, ...ccList, ...bccList];
            for (const r of allRcpts) {
              socket.write(`RCPT TO:<${r}>\r\n`);
            }
          } else if (step === 6) {
            if (lastLine.startsWith('250')) {
              step = 7;
              socket.write(`DATA\r\n`);
            } else if (lastLine.startsWith('550') || lastLine.startsWith('5')) {
              clearTimeout(timeout);
              socket.end();
              resolve({
                ok: false,
                messageId,
                deliveryStatus: 'failed',
                provider: 'cpanel-exim',
                deliveryNote: `Namecheap cPanel recipient rejected: ${lastLine.trim()}`,
                error: lastLine.trim(),
                timestamp,
              });
            }
          } else if (step === 7 && lastLine.startsWith('354')) {
            step = 8;
            socket.write(`${rawMime}\r\n.\r\n`);
          } else if (step === 8) {
            clearTimeout(timeout);
            socket.end();
            if (lastLine.startsWith('250')) {
              // SMTP 250 indicates acceptance by local Exim queue (queued for delivery)
              resolve({
                ok: true,
                messageId,
                deliveryStatus: 'accepted',
                provider: 'cpanel-exim',
                deliveryNote: `SMTP 250 accepted by Namecheap Exim (${host}: ${lastLine.trim()}). Queued for relay.`,
                timestamp,
              });
            } else {
              resolve({
                ok: false,
                messageId,
                deliveryStatus: 'failed',
                provider: 'cpanel-exim',
                deliveryNote: `Exim rejected final message data: ${lastLine.trim()}`,
                error: lastLine.trim(),
                timestamp,
              });
            }
          }
        });

        socket.on('error', (err) => {
          clearTimeout(timeout);
          resolve({
            ok: false,
            messageId,
            deliveryStatus: 'failed',
            provider: 'cpanel-exim',
            deliveryNote: `Namecheap cPanel SMTP TLS socket error: ${err.message}`,
            error: err.message,
            timestamp,
          });
        });
      });

      return await sendPromise;
    }
  } catch (err) {
    return {
      ok: false,
      messageId,
      deliveryStatus: 'failed',
      provider: 'cpanel-exim',
      deliveryNote: `SMTP delivery execution failed: ${err instanceof Error ? err.message : String(err)}`,
      error: err instanceof Error ? err.message : String(err),
      timestamp,
    };
  }

  // Fail closed if runtime has no socket capabilities
  return {
    ok: false,
    messageId,
    deliveryStatus: 'failed',
    provider: 'cpanel-exim',
    deliveryNote: 'Direct TLS SMTP socket execution unsupported in this runtime environment.',
    error: 'Runtime environment lacks TCP/TLS socket capability.',
    timestamp,
  };
}
