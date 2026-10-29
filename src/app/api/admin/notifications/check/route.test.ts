import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth/verifyAdminRequest', () => ({ verifyAdminRequest: vi.fn() }));
vi.mock('@/lib/wholesale/store', () => ({ listWholesaleRecords: vi.fn() }));
vi.mock('@/lib/email/inboxStore', () => ({ listInboxState: vi.fn() }));

import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import { listWholesaleRecords } from '@/lib/wholesale/store';
import { listInboxState } from '@/lib/email/inboxStore';
import { GET } from './route';

const makeRequest = () => new Request('http://localhost/api/admin/notifications/check', { method: 'GET' });

describe('Admin Notifications Check API', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(verifyAdminRequest).mockResolvedValue({
      ok: true,
      userId: '1',
      admin: { userId: '1', email: 'owner@himalayankoh.com', username: 'owner', name: 'Owner' },
    });
    vi.mocked(listWholesaleRecords).mockResolvedValue([]);
    vi.mocked(listInboxState).mockResolvedValue({
      messages: [],
      threads: [],
      counts: {
        all: 0,
        allUnread: 0,
        salman: 0,
        salmanUnread: 0,
        sales: 0,
        salesUnread: 0,
        support: 0,
        supportUnread: 0,
        orders: 0,
        ordersUnread: 0,
        marketing: 0,
        marketingUnread: 0,
        admin: 0,
        adminUnread: 0,
        unread: 0,
        sent: 0,
        drafts: 0,
        spam: 0,
        archive: 0,
        trash: 0,
      },
      mailboxes: [],
      infrastructure: {} as any,
    });
  });

  it('rejects unauthorized caller with 401', async () => {
    vi.mocked(verifyAdminRequest).mockResolvedValue({ ok: false, status: 401, error: 'Unauthorized' });
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it('aggregates pending wholesale inquiries and unread emails', async () => {
    vi.mocked(listWholesaleRecords).mockResolvedValue([
      {
        id: 23,
        ref: 'HK-WS-Q00023',
        status: 'SUBMITTED',
        buyer_contact: { business: 'Dealer B-TEST02' },
        lines: [{ boxes: 7 }],
        merchandise_subtotal: 293.37,
        created_at: '2026-10-29T12:00:00Z',
      },
    ]);
    vi.mocked(listInboxState).mockResolvedValue({
      messages: [
        {
          id: 'msg-1',
          subject: 'Need freight update',
          from: { name: 'Austin Dealer', email: 'austin@example.com' },
          unread: true,
          createdAt: '2026-10-29T13:00:00Z',
        } as any,
      ],
      threads: [],
      counts: {
        all: 1,
        allUnread: 1,
        salman: 0,
        salmanUnread: 0,
        sales: 0,
        salesUnread: 0,
        support: 0,
        supportUnread: 0,
        orders: 0,
        ordersUnread: 0,
        marketing: 0,
        marketingUnread: 0,
        admin: 0,
        adminUnread: 0,
        unread: 1,
        sent: 0,
        drafts: 0,
        spam: 0,
        archive: 0,
        trash: 0,
      },
      mailboxes: [],
      infrastructure: {} as any,
    });

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.unreadTotal).toBe(2);
    expect(json.breakdown.inquiries).toBe(1);
    expect(json.breakdown.emails).toBe(1);
    expect(json.alerts.length).toBe(2);
  });
});
