import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('./session', () => ({ verifyWholesaleRequest: vi.fn() }));
vi.mock('./store', () => ({ listWholesaleRecords: vi.fn() }));
import { verifyWholesaleRequest } from './session';
import { listWholesaleRecords } from './store';
import { requireActiveBuyer } from './requireBuyer';
beforeEach(() => { vi.resetAllMocks(); vi.stubEnv('NEXT_PUBLIC_WHOLESALE_ENABLED', 'true'); vi.mocked(verifyWholesaleRequest).mockResolvedValue({ ok: true, payload: { wid: 7, email: 'internal@example.invalid', company: 'Internal', role: 'wholesale_customer', iat: 0, exp: 9999999999 }, buyer: { accountId: 7, email: 'internal@example.invalid', company: 'Internal', role: 'wholesale_customer' } }); });
describe('buyer access is rechecked against current account and certificate', () => {
  it('revokes access immediately for a suspended account', async () => {
    vi.mocked(listWholesaleRecords).mockResolvedValue([{ id: 7, status: 'SUSPENDED' }]);
    const result = await requireActiveBuyer(new Request('http://localhost'));
    expect(result.ok).toBe(false); if (!result.ok) expect(result.response.status).toBe(403);
  });
  it.each(['REVERIFICATION_REQUIRED', 'EXPIRED', 'REJECTED'])('blocks a certificate with status %s', async (status) => {
    vi.mocked(listWholesaleRecords).mockResolvedValueOnce([{ id: 7, status: 'ACTIVE' }]).mockResolvedValueOnce([{ account_id: 7, status: 'APPROVED', email_verified_at: '2026-01-01', certificate_status: status }]);
    const result = await requireActiveBuyer(new Request('http://localhost'));
    expect(result.ok).toBe(false);
  });
  it('fails closed on a certificate read outage', async () => {
    vi.mocked(listWholesaleRecords).mockResolvedValueOnce([{ id: 7, status: 'ACTIVE' }]).mockRejectedValueOnce(new Error('Offline'));
    const result = await requireActiveBuyer(new Request('http://localhost'));
    expect(result.ok).toBe(false); if (!result.ok) expect(result.response.status).toBe(503);
  });
});
