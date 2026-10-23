import { describe, expect, it, vi } from 'vitest';
vi.mock('./accountConfig', () => ({ getAllEmailAccounts: vi.fn(), getEmailAccount: vi.fn().mockResolvedValue({ imapPass: '', imapUser: '' }) }));
import { getEmailAccount } from './accountConfig';
import { syncImapMailboxes } from './inboxStore';
describe('wholesale inbox integration', () => {
 it('includes ws during normal sync and keeps the Sales exclusion unchanged', async () => {
  await syncImapMailboxes();
  const requested = vi.mocked(getEmailAccount).mock.calls.map(([mailbox]) => mailbox);
  expect(requested).toContain('ws@himalayankoh.com');
  expect(requested).not.toContain('sales@himalayankoh.com');
 });
});
