import { beforeEach, describe, expect, it, vi } from 'vitest';

const { checkRateLimit, subscribe } = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
  subscribe: vi.fn(),
}));

vi.mock('@/lib/rateLimit', () => ({ checkRateLimit }));
vi.mock('@/lib/wordpress/siteContent', () => ({
  newsletterApi: { subscribe },
}));

import { POST } from './route';

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/newsletter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('POST /api/newsletter', () => {
  beforeEach(() => {
    checkRateLimit.mockReset();
    subscribe.mockReset();
    checkRateLimit.mockReturnValue({ allowed: true, remaining: 4, resetAt: Date.now() + 60_000 });
    subscribe.mockResolvedValue(true);
  });

  it('subscribes a valid email with the default footer source', async () => {
    const res = await POST(makeRequest({ email: '  Customer@Example.com  ' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, created: true });
    expect(subscribe).toHaveBeenCalledWith('customer@example.com', 'footer');
  });

  it('passes through a provided source', async () => {
    const res = await POST(makeRequest({ email: 'a@b.co', source: 'homepage' }));
    expect(res.status).toBe(200);
    expect(subscribe).toHaveBeenCalledWith('a@b.co', 'homepage');
  });

  it('reports an address that was already subscribed rather than claiming a new signup', async () => {
    subscribe.mockResolvedValue(false);

    const res = await POST(makeRequest({ email: 'a@b.co' }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, created: false });
  });

  it('rejects malformed JSON', async () => {
    const res = await POST(makeRequest('not json'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid JSON body.' });
    expect(subscribe).not.toHaveBeenCalled();
  });

  it('requires an email', async () => {
    const res = await POST(makeRequest({ email: '' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Email is required.' });
  });

  it('rejects an invalid email address', async () => {
    const res = await POST(makeRequest({ email: 'not-an-email' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Enter a valid email address.' });
  });

  it('returns 429 when the client is rate limited', async () => {
    checkRateLimit.mockReturnValue({ allowed: false, remaining: 0, resetAt: Date.now() + 60_000 });
    const res = await POST(makeRequest({ email: 'a@b.co' }));
    expect(res.status).toBe(429);
    expect(subscribe).not.toHaveBeenCalled();
  });

  it('returns 500 when the subscriber could not be stored', async () => {
    subscribe.mockRejectedValue(new Error('boom'));
    const res = await POST(makeRequest({ email: 'a@b.co' }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Unable to subscribe. Please try again.' });
  });
});
