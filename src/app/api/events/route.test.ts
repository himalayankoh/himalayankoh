import { beforeEach, describe, expect, it, vi } from 'vitest';

const { checkRateLimit, verifyAdminRequest, insert, select } = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
  verifyAdminRequest: vi.fn(),
  insert: vi.fn(),
  select: vi.fn(),
}));

vi.mock('@/lib/rateLimit', () => ({ checkRateLimit }));
vi.mock('@/lib/auth/verifyAdminRequest', () => ({ verifyAdminRequest }));
vi.mock('@/lib/stripe/server/supabaseAdmin', () => ({
  getSupabaseAdmin: () => ({ from: () => ({ insert, select }) }),
}));

import { GET, POST } from './route';

function post(body: unknown): Request {
  return new Request('http://localhost/api/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function get(query = ''): Request {
  return new Request(`http://localhost/api/events${query}`, {
    headers: { Authorization: 'Bearer admin-token' },
  });
}

/** The read is a chain, so the mock has to return the builder's own methods. */
function selectChain(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  for (const method of ['gte', 'order', 'limit']) chain[method] = () => chain;
  chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return chain;
}

describe('POST /api/events', () => {
  beforeEach(() => {
    checkRateLimit.mockReset();
    insert.mockReset();
    checkRateLimit.mockReturnValue({ allowed: true, remaining: 10, resetAt: Date.now() + 60_000 });
    insert.mockResolvedValue({ error: null });
  });

  it('records a visitor event', async () => {
    const res = await POST(post({ event: 'free_gift_popup_view', path: '/products/x', device: 'mobile' }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, recorded: true });
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'free_gift_popup_view', path: '/products/x', device: 'mobile' })
    );
  });

  it('rejects a body with no event or no path', async () => {
    expect((await POST(post({ path: '/x' }))).status).toBe(400);
    expect((await POST(post({ event: 'page_view' }))).status).toBe(400);
    expect(insert).not.toHaveBeenCalled();
  });

  it('rejects malformed JSON', async () => {
    expect((await POST(post('not json'))).status).toBe(400);
    expect(insert).not.toHaveBeenCalled();
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

    const row = insert.mock.calls[0][0] as Record<string, unknown>;
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
    expect(insert).not.toHaveBeenCalled();
  });

  it('retries without the revenue columns when migration 043 has not run', async () => {
    insert
      .mockResolvedValueOnce({ error: { code: 'PGRST204', message: "Could not find the 'value' column" } })
      .mockResolvedValueOnce({ error: null });

    const res = await POST(post({ event: 'purchase', path: '/checkout', value: 19.95, currency: 'USD' }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, recorded: true });
    const retryRow = insert.mock.calls[1][0] as Record<string, unknown>;
    expect(retryRow).not.toHaveProperty('value');
    expect(retryRow).not.toHaveProperty('currency');
  });

  it('reports recorded: false instead of failing when the insert is rejected', async () => {
    insert.mockResolvedValue({ error: { code: '42501', message: 'permission denied' } });

    const res = await POST(post({ event: 'page_view', path: '/x' }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, recorded: false });
  });
});

describe('GET /api/events', () => {
  beforeEach(() => {
    verifyAdminRequest.mockReset();
    select.mockReset();
  });

  it('refuses a caller who is not an admin', async () => {
    verifyAdminRequest.mockResolvedValue({ ok: false, status: 401, error: 'Admin authentication required.' });

    const res = await GET(get('?days=7'));

    expect(res.status).toBe(401);
    expect(select).not.toHaveBeenCalled();
  });

  it('returns the window, newest-first, with absent revenue fields as null', async () => {
    verifyAdminRequest.mockResolvedValue({ ok: true, userId: '1', admin: {} });
    const rows = [{ event: 'page_view', path: '/x', occurred_at: '2026-09-01T00:00:00Z' }];
    select.mockReturnValue(selectChain({ data: rows, error: null }));

    const res = await GET(get('?days=7'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ events: [{ ...rows[0], value: null, currency: null }] });
    expect(select).toHaveBeenCalledWith('*');
  });

  it('reports a read failure as 502 rather than an empty dashboard', async () => {
    verifyAdminRequest.mockResolvedValue({ ok: true, userId: '1', admin: {} });
    select.mockReturnValue(selectChain({ data: null, error: { message: 'boom' } }));

    expect((await GET(get())).status).toBe(502);
  });
});
