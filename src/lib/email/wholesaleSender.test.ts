import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveAuthorizedSender, resolveCPanelCredentials } from './cpanelMail';
import { SUPPORTED_MAILBOXES, getEmailAccountSync } from './accountConfig';
afterEach(() => vi.unstubAllEnvs());
describe('dedicated wholesale mailbox boundary', () => {
  it('resolves ws as itself and keeps Sales excluded from the inbox', () => {
    expect(resolveAuthorizedSender('Himalayan Koh Wholesale <ws@himalayankoh.com>').email).toBe('ws@himalayankoh.com');
    expect(SUPPORTED_MAILBOXES).toContain('ws@himalayankoh.com');
    expect(SUPPORTED_MAILBOXES).not.toContain('sales@himalayankoh.com');
  });
  it('never borrows the global Sales SMTP credential', () => {
    vi.stubEnv('NAMECHEAP_SMTP_USER', 'sales@himalayankoh.com'); vi.stubEnv('NAMECHEAP_SMTP_PASS', 'test-global-only');
    vi.stubEnv('WHOLESALE_SMTP_PASS', '');
    expect(resolveCPanelCredentials('ws@himalayankoh.com')).toBeNull();
    expect(getEmailAccountSync('ws@himalayankoh.com').smtpPass).toBe('');
  });
  it('requires the exact wholesale authenticated identity and verified TLS port', () => {
    vi.stubEnv('WHOLESALE_SMTP_USER', 'ws@himalayankoh.com'); vi.stubEnv('WHOLESALE_SMTP_PASS', 'test-wholesale-only');
    expect(resolveCPanelCredentials('ws@himalayankoh.com')?.user).toBe('ws@himalayankoh.com');
    vi.stubEnv('WHOLESALE_SMTP_USER', 'sales@himalayankoh.com');
    expect(resolveCPanelCredentials('ws@himalayankoh.com')).toBeNull();
  });
});
