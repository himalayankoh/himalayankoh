import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/auth/verifyAdminRequest', () => ({ verifyAdminRequest: vi.fn() }));
vi.mock('@/lib/wholesale/store', () => ({ getWholesaleRecord: vi.fn(), decideWholesaleApplication: vi.fn(), upsertWholesaleRecord: vi.fn() }));
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import { getWholesaleRecord, decideWholesaleApplication, upsertWholesaleRecord } from '@/lib/wholesale/store';
import { POST } from './route';
const request = () => new Request('http://localhost/api/admin/wholesale/decide', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ applicationId: 42, decision: 'APPROVED' }) });
const verified = { id: 42, declaration_name: 'Internal test owner', declaration_at: '2026-01-01', email_verified_at: '2026-01-01' };
beforeEach(() => { vi.resetAllMocks(); vi.stubEnv('NEXT_PUBLIC_WHOLESALE_ENABLED', 'true'); vi.mocked(verifyAdminRequest).mockResolvedValue({ ok: true, userId: '1', admin: { userId: '1', email: 'owner@example.invalid', username: 'owner', name: 'Owner' } }); vi.mocked(upsertWholesaleRecord).mockResolvedValue({}); });
describe('approval must be a database fact', () => {
  it('refuses a non-admin before reading or writing', async () => {
    vi.mocked(verifyAdminRequest).mockResolvedValue({ ok: false, status: 401, error: 'Unauthorized' });
    expect((await POST(request())).status).toBe(401); expect(getWholesaleRecord).not.toHaveBeenCalled();
  });
  it('refuses an email-unverified application without creating an account', async () => {
    vi.mocked(getWholesaleRecord).mockResolvedValue({ ...verified, email_verified_at: '' });
    expect((await POST(request())).status).toBe(409); expect(decideWholesaleApplication).not.toHaveBeenCalled();
  });
  it('does not claim success when the decision response leaves the stored application pending', async () => {
    vi.mocked(getWholesaleRecord).mockResolvedValueOnce(verified).mockResolvedValueOnce({ ...verified, status: 'PENDING' });
    vi.mocked(decideWholesaleApplication).mockResolvedValue({ application: { status: 'PENDING' }, account: null });
    expect((await POST(request())).status).toBe(502);
  });
  it('only confirms approval after reading APPROVED back from storage', async () => {
    vi.mocked(getWholesaleRecord).mockResolvedValueOnce(verified).mockResolvedValueOnce({ ...verified, status: 'APPROVED' });
    vi.mocked(decideWholesaleApplication).mockResolvedValue({ application: { status: 'APPROVED' }, account: { id: 5 } });
    expect((await POST(request())).status).toBe(200);
    expect(getWholesaleRecord).toHaveBeenCalledTimes(2);
  });
});
