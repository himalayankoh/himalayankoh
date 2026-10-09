import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  authorized: true,
  secret: 'sk_test_health_fixture',
  signingSecret: 'whsec_health_fixture',
  balance: vi.fn(),
  save: vi.fn(),
}));
vi.mock('@/lib/auth/verifyAdminRequest', () => ({
  verifyAdminRequest: async () => state.authorized
    ? { ok: true }
    : { ok: false, error: 'Unauthorized', status: 401 },
}));
vi.mock('@/lib/settings/serverSettings', () => ({
  getSettingsForCategory: async () => ({}),
  upsertSettings: state.save,
}));
vi.mock('@/lib/stripe/server/stripe', () => ({
  resolveStripeSecretKey: async () => state.secret,
  resolveStripeWebhookSecret: async () => state.signingSecret,
  getStripeSignatureVerifier: async () => ({ balance: { retrieve: state.balance } }),
}));
import { POST } from './route';

function healthRequest() {
  return new Request('https://store.example/api/admin/payments', {
    method: 'POST',
    body: JSON.stringify({ provider: 'stripe', action: 'health' }),
  });
}

describe('Stripe administration health check', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    state.authorized = true;
    state.secret = 'sk_test_health_fixture';
    state.signingSecret = 'whsec_health_fixture';
    state.balance.mockResolvedValue({ livemode: false });
  });

  it('requires administrator authorization before any external call or settings write', async () => {
    state.authorized = false;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect((await POST(healthRequest())).status).toBe(401);
    expect(state.balance).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(state.save).not.toHaveBeenCalled();
  });

  it('uses a valid signature and a non-payment diagnostic to establish endpoint health', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe('https://store.example/api/stripe/webhook');
      const body = String(init.body);
      const signature = (init.headers as Record<string, string>)['stripe-signature'];
      const timestamp = signature.split(',')[0].slice(2);
      const expected = createHmac('sha256', state.signingSecret).update(`${timestamp}.${body}`).digest('hex');
      expect(signature).toBe(`t=${timestamp},v1=${expected}`);
      const probe = JSON.parse(body);
      expect(probe.type).toBe('hk.configuration.probe');
      expect(probe.livemode).toBe(false);
      expect(probe.id).not.toMatch(/^evt_/);
      expect(body).not.toMatch(/payment_intent|pi_health_|woo_order_id/);
      return new Response(JSON.stringify({ received: true }));
    }));
    expect((await (await POST(healthRequest())).json()).ok).toBe(true);
    expect(state.save).toHaveBeenCalledWith('payments', expect.objectContaining({
      stripe_health_ok: 'true', stripe_webhook_endpoint_ok: 'true',
    }));
  });

  it('does not report readiness when the endpoint rejects the signature', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Bad signature', { status: 400 })));
    expect((await (await POST(healthRequest())).json()).ok).toBe(false);
    expect(state.save).toHaveBeenCalledWith('payments', expect.objectContaining({
      stripe_health_ok: 'false', stripe_webhook_endpoint_ok: 'false',
    }));
  });

  it('does not report readiness when Stripe rejects the API key', async () => {
    state.balance.mockRejectedValue(new Error('Invalid API key'));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"received":true}')));
    expect((await (await POST(healthRequest())).json()).ok).toBe(false);
    expect(state.save).toHaveBeenCalledWith('payments', expect.objectContaining({
      stripe_health_ok: 'false', stripe_webhook_endpoint_ok: 'true',
    }));
  });

  it('cannot probe or report readiness without a signing secret', async () => {
    state.signingSecret = '';
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect((await (await POST(healthRequest())).json()).ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
