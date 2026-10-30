import { beforeEach, describe, expect, it, vi } from 'vitest';

const { checkRateLimit, record, list, verify } = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
  record: vi.fn(),
  list: vi.fn(), verify: vi.fn(),
}));

vi.mock('@/lib/rateLimit', () => ({ checkRateLimit }));
vi.mock('@/lib/wordpress/siteContent', () => ({
  siteEventsApi: { record, list },
}));
vi.mock('@/lib/auth/verifyAdminRequest', () => ({ verifyAdminRequest: verify }));

import { POST, GET } from './route';

function post(body: unknown): Request {
  return new Request('http://localhost/api/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('POST /api/events', () => {
  beforeEach(() => {
    checkRateLimit.mockReset();
    record.mockReset();
    checkRateLimit.mockReturnValue({ allowed: true, remaining: 10, resetAt: Date.now() + 60_000 });
    record.mockResolvedValue(undefined);
  });

  it('records a visitor event through WordPress', async () => {
    const res = await POST(post({ event: 'free_gift_popup_view', path: '/products/x', device: 'mobile' }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, recorded: true });
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'free_gift_popup_view', path: '/products/x', device: 'mobile' })
    );
  });

  it('rejects a body with no event or no path', async () => {
    expect((await POST(post({ path: '/x' }))).status).toBe(400);
    expect((await POST(post({ event: 'page_view' }))).status).toBe(400);
    expect(record).not.toHaveBeenCalled();
  });

  it('rejects malformed JSON', async () => {
    expect((await POST(post('not json'))).status).toBe(400);
    expect(record).not.toHaveBeenCalled();
  });

  it('drops unknown fields and caps the ones it keeps', async () => {
    await POST(
      post({
        event: 'e'.repeat(200),
        path: '/x',
        secret: 'must not be stored',
        utm_source: 's'.repeat(500),
        item_ids: Array.from({ length: 40 }, (_, i) => `p${i}`),
      })
    );

    const row = record.mock.calls[0][0] as Record<string, unknown>;
    expect(row).not.toHaveProperty('secret');
    expect(row.event).toHaveLength(64);
    expect(row.utm_source).toHaveLength(256);
    expect(row.item_ids).toHaveLength(20);
  });

  it('is a quiet no-op when throttled, because analytics must never surface an error', async () => {
    checkRateLimit.mockReturnValue({ allowed: false, remaining: 0, resetAt: Date.now() + 1000 });

    const res = await POST(post({ event: 'page_view', path: '/x' }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, recorded: false });
    expect(record).not.toHaveBeenCalled();
  });

  it('reports recorded: false instead of failing when WordPress rejects the event', async () => {
    record.mockRejectedValue(new Error('WordPress is not configured'));

    const res = await POST(post({ event: 'page_view', path: '/x' }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, recorded: false });
  });
});

describe('GET /api/events', () => {
  beforeEach(() => {
    list.mockReset().mockResolvedValue([]);
    verify.mockReset().mockResolvedValue({ ok: true });
  });
  it('keeps raw traffic private and bypasses caches', async () => {
    const response = await GET(new Request('https://himalayankoh.com/api/events?days=30'));
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(await response.json()).toEqual({ events: [], truncated: false });
  });
  it('rejects unauthenticated reads before reaching WordPress', async () => {
    verify.mockResolvedValue({ ok: false, error: 'Unauthorized', status: 401 });
    expect((await GET(new Request('https://himalayankoh.com/api/events'))).status).toBe(401);
    expect(list).not.toHaveBeenCalled();
  });
  it.each(['-1', '91', 'NaN', '2.5'])('bounds the read window %s', async days => {
    expect((await GET(new Request(`https://himalayankoh.com/api/events?days=${days}`))).status).toBe(400);
    expect(list).not.toHaveBeenCalled();
  });
  it('marks capped rows as partial', async () => {
    list.mockResolvedValue(Array.from({ length: 5000 }, () => ({ event: 'page_view' })));
    const response = await GET(new Request('https://himalayankoh.com/api/events'));
    expect((await response.json()).truncated).toBe(true);
  });
});
