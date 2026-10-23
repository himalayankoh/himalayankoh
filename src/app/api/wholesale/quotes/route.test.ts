import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/wholesale/requireBuyer', () => ({ requireActiveBuyer: vi.fn() }));
vi.mock('@/lib/wholesale/pricing', () => ({ loadWholesaleData: vi.fn() }));
vi.mock('@/lib/wholesale/store', () => ({ listWholesaleRecords: vi.fn(), upsertWholesaleRecord: vi.fn() }));
vi.mock('@/lib/email/wholesaleInquiry', () => ({ sendWholesaleInquiryEmails: vi.fn(), wholesaleInquiryRecipient: () => 'ws@himalayankoh.com' }));
import { requireActiveBuyer } from '@/lib/wholesale/requireBuyer';
import { loadWholesaleData } from '@/lib/wholesale/pricing';
import { listWholesaleRecords, upsertWholesaleRecord } from '@/lib/wholesale/store';
import { sendWholesaleInquiryEmails } from '@/lib/email/wholesaleInquiry';
import { productFromRow, priceTierFromRow, accountFromRow, containerProfileFromRow } from '@/lib/wholesale/mapping';
import { GET, POST } from './route';
const body = { requestKey: 'internal-test-request-0001', shippingAddress: 'Internal controlled shipping destination', lines: [{ productRowId: 1, units: 2, unitPrice: 0.01 }], accountId: 999 };
const req = (data: unknown = body) => new Request('http://localhost/api/wholesale/quotes', { method: 'POST', body: JSON.stringify(data), headers: { 'Content-Type': 'application/json' } });
beforeEach(() => {
 vi.resetAllMocks();
 vi.mocked(requireActiveBuyer).mockResolvedValue({ ok: true, buyer: { accountId: 7, email: 'internal@example.invalid', company: 'Internal' }, account: accountFromRow({ id: 7, email: 'internal@example.invalid', company: 'Internal', status: 'ACTIVE' }) });
 vi.mocked(listWholesaleRecords).mockResolvedValue([]);
 vi.mocked(loadWholesaleData).mockResolvedValue({ products: [productFromRow({ id: 1, woo_product_id: 2543, woo_variation_id: 2560, name: '2 lb salt lick', wholesale_sku: 'HK-LFH-2lbs', net_unit_weight_kg: 0.907185, available_units: 10, active: 1 })], tiers: [priceTierFromRow({ id: 1, product_id: 1, min_units: 1, unit_price: 9.07, currency: 'USD' })], containers: [containerProfileFromRow({ id: 1, code: '20FT', name: '20ft Standard', usable_cbm: 33.2, max_cargo_weight_kg: 28200, practical_volume_factor: 0.9, pallet_capacity: 10 })], costProfiles: [], freightRates: [] });
 vi.mocked(upsertWholesaleRecord).mockImplementation(async (resource, data) => resource === 'quotes' ? { id: 42, ...data } : {});
 vi.mocked(sendWholesaleInquiryEmails).mockResolvedValue({ adminNotified: true, buyerAcknowledged: true, error: '' });
});
describe('buyer inquiry boundary integration', () => {
 it('rejects unauthorized requests without reading or writing records', async () => {
  vi.mocked(requireActiveBuyer).mockResolvedValue({ ok: false, response: new (await import('next/server')).NextResponse(null, { status: 401 }) });
  expect((await POST(req())).status).toBe(401); expect(upsertWholesaleRecord).not.toHaveBeenCalled();
 });
 it('recalculates from server tiers, scopes the buyer, saves snapshots before email and never deducts stock', async () => {
  const response = await POST(req()); expect(response.status).toBe(201);
  const data = vi.mocked(upsertWholesaleRecord).mock.calls[0][1];
  expect(data.account_id).toBe(7); expect(data.lines).toEqual(expect.arrayContaining([expect.objectContaining({ units: 2, unitPriceIndicative: 9.07, lineSubtotalIndicative: 18.14, wooVariationId: 2560 })]));
  expect(vi.mocked(upsertWholesaleRecord).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(sendWholesaleInquiryEmails).mock.invocationCallOrder[0]);
  expect(vi.mocked(upsertWholesaleRecord).mock.calls.every(([resource]) => ['quotes','audit'].includes(resource))).toBe(true);
 });
 it('retains a persisted inquiry when mail fails and records the failure', async () => {
  vi.mocked(sendWholesaleInquiryEmails).mockResolvedValue({ adminNotified: false, buyerAcknowledged: false, error: 'Transport unavailable' });
  expect((await POST(req())).status).toBe(201);
  expect(upsertWholesaleRecord).toHaveBeenCalledWith('audit', expect.objectContaining({ action: 'inquiry_email_failed', entity_id: 42 }), expect.anything());
 });
 it('rejects stock excess, duplicate lines, missing shipping and null bodies before saving', async () => {
  for (const data of [{ ...body, lines: [{ productRowId: 1, units: 11 }] }, { ...body, lines: [...body.lines, ...body.lines] }, { ...body, shippingAddress: '' }, null]) expect((await POST(req(data))).status).toBe(400);
  expect(upsertWholesaleRecord).not.toHaveBeenCalled();
 });
 it('uses the original inquiry on an idempotent retry without sending duplicate emails', async () => {
  vi.mocked(upsertWholesaleRecord).mockResolvedValue({ id: 42, account_id: 7, _deduplicated: true });
  const response = await POST(req()); expect(response.status).toBe(200); expect((await response.json()).duplicate).toBe(true); expect(sendWholesaleInquiryEmails).not.toHaveBeenCalled();
 });
 it('ignores a caller-supplied account filter', async () => {
  await GET(new Request('http://localhost/api/wholesale/quotes?account_id=999'));
  expect(listWholesaleRecords).toHaveBeenCalledWith('quotes', { account_id: 7, limit: 200 });
 });
});
