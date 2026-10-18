import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  SUPPORTED_MAILBOXES,
  MAILBOX_METADATA,
  getEmailAccount,
  listEmailAccounts,
  saveEmailAccountCredentials,
  toClientMailboxView,
  type MailboxEmail,
} from './accountConfig';
import { parseRawRfc822Email } from './imapClient';

const mockRead = vi.fn();
const mockWrite = vi.fn();

vi.mock('@/lib/wordpress/siteContent', () => ({
  siteSettingsApi: {
    read: (...args: unknown[]) => mockRead(...args),
    write: (...args: unknown[]) => mockWrite(...args),
  },
}));

describe('Mailbox Account Configuration & IMAP/SMTP Security', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRead.mockResolvedValue({});
    mockWrite.mockResolvedValue(undefined);
  });

  it('defines the 4 required Himalayan Koh mailbox identities', () => {
    expect(SUPPORTED_MAILBOXES).toEqual([
      'sales@himalayankoh.com',
      'support@himalayankoh.com',
      'salman@himalayankoh.com',
      'admin@himalayankoh.com',
    ]);

    for (const mailbox of SUPPORTED_MAILBOXES) {
      expect(MAILBOX_METADATA[mailbox]).toBeDefined();
      expect(MAILBOX_METADATA[mailbox].displayName).toBeTruthy();
      expect(MAILBOX_METADATA[mailbox].role).toBeTruthy();
    }
  });

  it('defaults to secure Namecheap cPanel ports (465 SMTPS, 993 IMAPS)', async () => {
    const acc = await getEmailAccount('sales@himalayankoh.com');
    expect(acc.smtpHost).toBe('premium164.web-hosting.com');
    expect(acc.smtpPort).toBe(465);
    expect(acc.imapHost).toBe('premium164.web-hosting.com');
    expect(acc.imapPort).toBe(993);
  });

  it('never sends raw passwords to the client in toClientMailboxView', () => {
    const internalAccount = {
      mailbox: 'sales@himalayankoh.com' as MailboxEmail,
      label: 'Sales',
      displayName: 'Himalayan Koh Sales',
      role: 'B2B Sales',
      defaultSignature: 'Sales Team',
      smtpHost: 'premium164.web-hosting.com',
      smtpPort: 465,
      smtpUser: 'sales@himalayankoh.com',
      smtpPass: 'super-secret-password-12345',
      imapHost: 'premium164.web-hosting.com',
      imapPort: 993,
      imapUser: 'sales@himalayankoh.com',
      imapPass: 'another-super-secret-password',
      secure: true,
      smtpStatus: 'authenticated' as const,
      imapStatus: 'authenticated' as const,
      lastTestedAt: '2026-10-18T12:00:00Z',
      source: 'db' as const,
    };

    const clientView = toClientMailboxView(internalAccount);

    expect(clientView.hasSmtpPass).toBe(true);
    expect(clientView.hasImapPass).toBe(true);
    // Ensure raw passwords are never present on client view
    expect((clientView as Record<string, unknown>).smtpPass).toBeUndefined();
    expect((clientView as Record<string, unknown>).imapPass).toBeUndefined();
  });

  it('correctly saves credentials through siteSettingsApi.write and refreshes', async () => {
    await saveEmailAccountCredentials({
      mailbox: 'support@himalayankoh.com',
      smtpPass: 'new-support-password',
      imapPass: 'new-support-password',
      smtpStatus: 'authenticated',
      imapStatus: 'authenticated',
    });

    expect(mockWrite).toHaveBeenCalledTimes(1);
    const [category, updates] = mockWrite.mock.calls[0];
    expect(category).toBe('email_accounts');
    expect(updates['support_smtp_pass']).toBe('new-support-password');
    expect(updates['support_imap_pass']).toBe('new-support-password');
    expect(updates['support_smtp_status']).toBe('authenticated');
    expect(updates['support_imap_status']).toBe('authenticated');
  });

  it('parses raw RFC 822 email headers and body correctly', () => {
    const rawRfc822 = [
      'From: Customer Name <customer@example.com>',
      'To: sales@himalayankoh.com',
      'Subject: Inquiry about bulk salt blocks',
      'Message-ID: <msg-unique-12345@example.com>',
      'Date: Sat, 18 Oct 2026 14:00:00 +0000',
      'Content-Type: text/plain; charset=utf-8',
      '',
      'Hello Himalayan Koh Team,',
      'We would like a quote for 50 pallets of 6 lb salt blocks.',
      'Thank you,',
      'Customer',
    ].join('\r\n');

    const parsed = parseRawRfc822Email(rawRfc822, 'sales@himalayankoh.com');

    expect(parsed.from.email).toBe('customer@example.com');
    expect(parsed.from.name).toBe('Customer Name');
    expect(parsed.to[0].email).toBe('sales@himalayankoh.com');
    expect(parsed.subject).toBe('Inquiry about bulk salt blocks');
    expect(parsed.messageId).toBe('<msg-unique-12345@example.com>');
    expect(parsed.bodyText).toContain('We would like a quote for 50 pallets');
  });
});
