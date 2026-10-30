import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  SUPPORTED_MAILBOXES,
  MAILBOX_METADATA,
  getEmailAccount,
  getAllEmailAccounts,
  saveEmailAccountCredentials,
  toClientMailboxView,
  openMailboxPassword,
  sealMailboxPassword,
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
    process.env.ADMIN_SESSION_SECRET = 'test-admin-session-secret-for-encryption-32ch';
  });

  it('includes the dedicated Wholesale identity while keeping Sales excluded', () => {
    expect(SUPPORTED_MAILBOXES).not.toContain('sales@himalayankoh.com');
    expect(SUPPORTED_MAILBOXES).toEqual([
      'ws@himalayankoh.com',
      'support@himalayankoh.com',
      'orders@himalayankoh.com',
      'marketing@himalayankoh.com',
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
    expect(clientView.smtpPassMasked).toBe('••••••••');
    expect(clientView.imapPassMasked).toBe('••••••••');
    // Ensure raw passwords are never present on client view
    expect((clientView as unknown as Record<string, unknown>).smtpPass).toBeUndefined();
    expect((clientView as unknown as Record<string, unknown>).imapPass).toBeUndefined();
  });

  it('correctly encrypts credentials with AES-256-GCM before saving to siteSettingsApi', async () => {
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
    // Passwords must be sealed with v1.<iv>.<ciphertext> format, NEVER raw plaintext
    expect(updates['support_smtp_pass']).toMatch(/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(updates['support_imap_pass']).toMatch(/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(updates['support_smtp_status']).toBe('authenticated');
    expect(updates['support_imap_status']).toBe('authenticated');

    // Round-trip decrypt proves integrity
    const decrypted = await openMailboxPassword(updates['support_smtp_pass']);
    expect(decrypted).toBe('new-support-password');
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

  it('fails closed when encryption secret is unavailable', async () => {
    const origSession = process.env.ADMIN_SESSION_SECRET;
    const origEmail = process.env.EMAIL_ENCRYPTION_SECRET;
    try {
      delete process.env.ADMIN_SESSION_SECRET;
      delete process.env.EMAIL_ENCRYPTION_SECRET;
      delete process.env.EMAIL_ENCRYPTION_SECRET_PREVIOUS;

      await expect(sealMailboxPassword('my-secret-pass')).rejects.toThrow(
        /Mailbox encryption key is unavailable/i
      );
    } finally {
      if (origSession) process.env.ADMIN_SESSION_SECRET = origSession;
      if (origEmail) process.env.EMAIL_ENCRYPTION_SECRET = origEmail;
    }
  });

  it('supports key rotation across previous and primary secrets', async () => {
    const origSession = process.env.ADMIN_SESSION_SECRET;
    const origEmail = process.env.EMAIL_ENCRYPTION_SECRET;
    const origPrev = process.env.EMAIL_ENCRYPTION_SECRET_PREVIOUS;

    try {
      // Step 1: Encrypt with key A
      process.env.ADMIN_SESSION_SECRET = 'key-version-alpha-secret-32-chars-long';
      delete process.env.EMAIL_ENCRYPTION_SECRET;
      const sealedWithAlpha = await sealMailboxPassword('rotated-mailbox-password-123');

      // Step 2: Rotate to key B, keeping key A as previous
      process.env.EMAIL_ENCRYPTION_SECRET = 'key-version-bravo-secret-32-chars-long';
      process.env.EMAIL_ENCRYPTION_SECRET_PREVIOUS = 'key-version-alpha-secret-32-chars-long';

      // Step 3: Decrypt ciphertext that was sealed with key A
      const decrypted = await openMailboxPassword(sealedWithAlpha);
      expect(decrypted).toBe('rotated-mailbox-password-123');

      // Step 4: New seal uses primary key B
      const sealedWithBravo = await sealMailboxPassword('rotated-mailbox-password-123');
      const decryptedBravo = await openMailboxPassword(sealedWithBravo);
      expect(decryptedBravo).toBe('rotated-mailbox-password-123');
    } finally {
      if (origSession) process.env.ADMIN_SESSION_SECRET = origSession;
      if (origEmail) process.env.EMAIL_ENCRYPTION_SECRET = origEmail;
      if (origPrev) process.env.EMAIL_ENCRYPTION_SECRET_PREVIOUS = origPrev;
      else delete process.env.EMAIL_ENCRYPTION_SECRET_PREVIOUS;
    }
  });
});
