import { NextResponse } from 'next/server';
import { createHmac } from 'node:crypto';
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import { getSettingsForCategory, upsertSettings } from '@/lib/settings/serverSettings';
import {
  evaluateCurrentStripeReadiness,
  getStripeSignatureVerifier,
  resolveStripeSecretKey,
  resolveStripeWebhookSecret,
} from '@/lib/stripe/server/stripe';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function maskKey(val: string | null | undefined): string {
  if (!val || val.length < 8) return '';
  return val.slice(0, 4) + '••••••••' + val.slice(-4);
}

export async function GET(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const [stripeDbSettings, paymentSettings] = await Promise.all([
      getSettingsForCategory('stripe'),
      getSettingsForCategory('payments'),
    ]);

    const stripeSecret = await resolveStripeSecretKey();
    const stripeWebhook = await resolveStripeWebhookSecret();
    const stripePk =
      stripeDbSettings.publishable_key?.trim() ||
      process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() ||
      process.env.VITE_STRIPE_PUBLISHABLE_KEY?.trim() ||
      '';

    // The console reports what the server would actually do, not whether keys are
    // present. `evaluateCurrentStripeReadiness` is the same decision every money
    // route uses, so the screen cannot call a setup "ready" while checkout is
    // returning 503 for it.
    const readiness = await evaluateCurrentStripeReadiness();

    const stripeConfigured = Boolean(stripeSecret && stripePk);
    const stripeMode = readiness.secretMode === 'live' ? 'production' : 'sandbox';
    const stripeEnabled = paymentSettings.stripe_enabled !== 'false' && stripeConfigured;
    /** Test/staging vs live/production, said in words the owner can act on. */
    const stripeStageLabel =
      readiness.stage === 'off' ? 'OFF' : readiness.stage === 'live' ? 'LIVE / PRODUCTION' : 'TEST / STAGING';
    const stripeReady =
      stripeEnabled && readiness.chargingEnabled && readiness.orderSyncConfigured && (readiness.stage === 'test' || readiness.readyForLive);

    const primary = (paymentSettings.primary_provider as any) || (stripeConfigured ? 'stripe' : 'none');
    const backup = (paymentSettings.backup_provider as any) || 'none';

    const providers = [
      {
        id: 'stripe',
        name: 'Stripe',
        enabled: stripeEnabled,
        role: primary === 'stripe' ? 'primary' : backup === 'stripe' ? 'backup' : 'available',
        mode: stripeMode,
        status: !stripeConfigured
          ? 'not_configured'
          : !stripeEnabled
          ? 'disabled'
          : stripeReady
          ? 'ready'
          : 'error',
        stage: readiness.stage,
        stageLabel: stripeStageLabel,
        ready: stripeReady,
        readyForLive: readiness.readyForLive,
        chargingEnabled: readiness.chargingEnabled,
        orderSyncConfigured: readiness.orderSyncConfigured,
        blockers: readiness.blockers,
        checks: readiness.checks,
        isConfigured: stripeConfigured,
        keys: {
          publishableKey: {
            configured: Boolean(stripePk),
            masked: maskKey(stripePk),
            source: stripeDbSettings.publishable_key ? 'db' : process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ? 'env' : 'none',
          },
          secretKey: {
            configured: Boolean(stripeSecret),
            masked: maskKey(stripeSecret),
            source: stripeDbSettings.secret_key ? 'db' : process.env.STRIPE_SECRET_KEY ? 'env' : 'none',
          },
          webhookSecret: {
            configured: Boolean(stripeWebhook),
            masked: maskKey(stripeWebhook),
            source: stripeDbSettings.webhook_secret ? 'db' : process.env.STRIPE_WEBHOOK_SECRET ? 'env' : 'none',
          },
        },
        dashboardUrl: 'https://dashboard.stripe.com',
        setupChecklist: [
          'Create a Stripe account',
          'Add Publishable Key (pk_test_... or pk_live_...)',
          'Add Secret Key (sk_test_... or sk_live_...)',
          'Configure Webhook endpoint (/api/stripe/webhook)',
        ],
        lastTestAt: paymentSettings.stripe_last_test_at || undefined,
        lastTestOk: paymentSettings.stripe_last_test_ok === 'true',
        // The first blocker, not a generic "error": the screen has to say what is
        // missing or the owner has to go looking for it.
        lastError: stripeReady
          ? undefined
          : readiness.blockers[0] || paymentSettings.stripe_last_error || undefined,
      },
      {
        id: 'paypal',
        name: 'PayPal',
        enabled: paymentSettings.paypal_enabled === 'true',
        role: primary === 'paypal' ? 'primary' : backup === 'paypal' ? 'backup' : 'available',
        mode: 'sandbox',
        status: 'not_configured',
        isConfigured: false,
        keys: {
          clientId: { configured: false, masked: '', source: 'none' },
          clientSecret: { configured: false, masked: '', source: 'none' },
        },
        dashboardUrl: 'https://developer.paypal.com/dashboard',
        setupChecklist: [
          'Create a PayPal Developer app',
          'Add Client ID and Client Secret',
          'Configure IPN / Webhooks for order completion',
        ],
      },
      {
        id: 'square',
        name: 'Square',
        enabled: paymentSettings.square_enabled === 'true',
        role: primary === 'square' ? 'primary' : backup === 'square' ? 'backup' : 'available',
        mode: 'sandbox',
        status: 'not_configured',
        isConfigured: false,
        keys: {
          applicationId: { configured: false, masked: '', source: 'none' },
          accessToken: { configured: false, masked: '', source: 'none' },
        },
        dashboardUrl: 'https://developer.squareup.com/apps',
        setupChecklist: [
          'Create Square Developer Application',
          'Get Sandbox/Production Application ID & Access Token',
        ],
      },
      {
        id: 'braintree',
        name: 'Braintree',
        enabled: paymentSettings.braintree_enabled === 'true',
        role: primary === 'braintree' ? 'primary' : backup === 'braintree' ? 'backup' : 'available',
        mode: 'sandbox',
        status: 'not_configured',
        isConfigured: false,
        keys: {
          merchantId: { configured: false, masked: '', source: 'none' },
          publicKey: { configured: false, masked: '', source: 'none' },
          privateKey: { configured: false, masked: '', source: 'none' },
        },
        dashboardUrl: 'https://sandbox.braintreegateway.com',
        setupChecklist: [
          'Sign in to Braintree Sandbox',
          'Obtain Merchant ID, Public Key, and Private Key',
        ],
      },
      {
        id: 'payoneer',
        name: 'Payoneer Checkout',
        enabled: paymentSettings.payoneer_enabled === 'true',
        role: primary === 'payoneer' ? 'primary' : backup === 'payoneer' ? 'backup' : 'available',
        mode: 'sandbox',
        status: 'not_configured',
        isConfigured: false,
        keys: {
          merchantCode: { configured: false, masked: '', source: 'none' },
          apiKey: { configured: false, masked: '', source: 'none' },
        },
        dashboardUrl: 'https://checkout.payoneer.com',
        setupChecklist: [
          'Register Payoneer Checkout Merchant Account',
          'Obtain API Credentials',
        ],
      },
      {
        id: 'authorize_net',
        name: 'Authorize.Net',
        enabled: paymentSettings.authorize_net_enabled === 'true',
        role: primary === 'authorize_net' ? 'primary' : backup === 'authorize_net' ? 'backup' : 'available',
        mode: 'sandbox',
        status: 'not_configured',
        isConfigured: false,
        keys: {
          apiLoginId: { configured: false, masked: '', source: 'none' },
          transactionKey: { configured: false, masked: '', source: 'none' },
        },
        dashboardUrl: 'https://sandbox.authorize.net',
        setupChecklist: [
          'Log in to Authorize.Net Sandbox Merchant Interface',
          'Generate API Login ID and Transaction Key',
        ],
      },
    ];

    return NextResponse.json({
      ok: true,
      primary,
      backup,
      providers,
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message || 'Failed to load payment providers' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = (await request.json()) as {
      action: 'test' | 'health' | 'toggle' | 'set_primary' | 'set_backup';
      provider: string;
      enabled?: boolean;
    };

    const { action, provider } = body;

    if (action === 'toggle') {
      await upsertSettings('payments', {
        [`${provider}_enabled`]: body.enabled ? 'true' : 'false',
      });
      return NextResponse.json({
        ok: true,
        message: `${provider} ${body.enabled ? 'enabled' : 'disabled'}.`,
      });
    }

    if (action === 'set_primary') {
      await upsertSettings('payments', {
        primary_provider: provider,
      });
      return NextResponse.json({
        ok: true,
        message: `Primary payment provider set to ${provider}.`,
      });
    }

    if (action === 'set_backup') {
      await upsertSettings('payments', {
        backup_provider: provider,
      });
      return NextResponse.json({
        ok: true,
        message: `Backup payment provider set to ${provider}.`,
      });
    }

    if (action === 'test') {
      if (provider === 'stripe') {
        const stripeSecret = await resolveStripeSecretKey();
        if (!stripeSecret) {
          await upsertSettings('payments', {
            stripe_last_test_at: new Date().toISOString(),
            stripe_last_test_ok: 'false',
            stripe_last_error: 'STRIPE_SECRET_KEY is not configured',
          });
          return NextResponse.json({
            ok: false,
            error: 'Stripe secret key is not configured. Add credentials in Admin or environment variables.',
          });
        }

        try {
          // Read-only, and deliberately not the charging client: validating a key
          // and being allowed to charge with it are different questions. An owner
          // must be able to confirm a live key is valid on a deployment where live
          // charging is switched off, and this call moves no money.
          const stripe = await getStripeSignatureVerifier();
          const balance = await stripe.balance.retrieve();
          await upsertSettings('payments', {
            stripe_last_test_at: new Date().toISOString(),
            stripe_last_test_ok: 'true',
            stripe_last_error: '',
          });
          return NextResponse.json({
            ok: true,
            message: `Stripe accepted the key (read-only balance call, livemode: ${balance.livemode}). No charge was made.`,
          });
        } catch (testErr) {
          const msg = (testErr as Error).message || 'Stripe API call failed';
          await upsertSettings('payments', {
            stripe_last_test_at: new Date().toISOString(),
            stripe_last_test_ok: 'false',
            stripe_last_error: msg,
          });
          return NextResponse.json({
            ok: false,
            error: msg,
          });
        }
      }

      return NextResponse.json({
        ok: false,
        error: `${provider} credentials are not configured on this server.`,
      });
    }

    if (action === 'health') {
      if (provider !== 'stripe') {
        return NextResponse.json({ ok: false, error: `${provider} has no health check.` }, { status: 400 });
      }

      const secretKey = await resolveStripeSecretKey();
      if (!secretKey) {
        await upsertSettings('payments', {
          stripe_health_at: new Date().toISOString(),
          stripe_health_ok: 'false',
          stripe_webhook_endpoint_ok: 'false',
          stripe_health_detail: 'No Stripe secret key is configured.',
        });
        return NextResponse.json({ ok: false, error: 'No Stripe secret key is configured.' });
      }

      /* --- Payment side: is the key usable? (read-only) ------------------- */
      let paymentOk = false;
      let paymentDetail = '';
      try {
        const stripe = await getStripeSignatureVerifier();
        const balance = await stripe.balance.retrieve();
        paymentOk = true;
        paymentDetail = `Stripe accepted the key. livemode: ${balance.livemode}.`;
      } catch (err) {
        paymentDetail = (err as Error).message || 'Stripe rejected the key.';
      }

      /* --- Webhook side: does this deployment's endpoint answer? ----------- */
      // The probe is signed with the stored signing secret and carries a harmless
      // event type that touches no order. It therefore proves the endpoint is up
      // and the secret in settings is the one the endpoint verifies with. It does
      // NOT prove the secret matches the endpoint Stripe has on file — only a real
      // delivery can prove that, and the wording says so.
      let webhookOk = false;
      let webhookDetail = '';
      const webhookSecret = await resolveStripeWebhookSecret();
      if (!webhookSecret) {
        webhookDetail = 'No webhook signing secret is stored, so the endpoint cannot be probed.';
      } else {
        try {
          const origin = new URL(request.url).origin;
          const stamp = Date.now();
          const payload = JSON.stringify({
            id: `evt_health_${stamp}`,
            object: 'event',
            type: 'payment_intent.created',
            livemode: false,
            data: { object: { id: `pi_health_${stamp}`, object: 'payment_intent', livemode: false, metadata: {} } },
          });
          const t = Math.floor(stamp / 1000);
          const signature = createHmac('sha256', webhookSecret).update(`${t}.${payload}`).digest('hex');
          const res = await fetch(`${origin}/api/stripe/webhook`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'stripe-signature': `t=${t},v1=${signature}` },
            body: payload,
          });
          const answer = await res.text();
          webhookOk = res.ok && answer.includes('"received":true');
          webhookDetail = webhookOk
            ? 'The endpoint verified a correctly signed probe. This shows the endpoint and the stored secret agree; only a real Stripe delivery proves the secret belongs to your Stripe endpoint.'
            : `The endpoint answered HTTP ${res.status}: ${answer.slice(0, 200)}`;
        } catch (err) {
          webhookDetail = (err as Error).message || 'The webhook endpoint could not be reached.';
        }
      }

      const allOk = paymentOk && webhookOk;
      await upsertSettings('payments', {
        stripe_health_at: new Date().toISOString(),
        stripe_health_ok: allOk ? 'true' : 'false',
        stripe_webhook_endpoint_ok: webhookOk ? 'true' : 'false',
        stripe_health_detail: JSON.stringify({ paymentDetail, webhookDetail }).slice(0, 900),
      });

      return NextResponse.json({
        ok: allOk,
        message: allOk
          ? 'Payment and webhook health checks passed.'
          : 'Health check incomplete — see the details.',
        payment: { ok: paymentOk, detail: paymentDetail },
        webhook: { ok: webhookOk, detail: webhookDetail },
      });
    }

    return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message || 'Failed to perform payment action' },
      { status: 500 }
    );
  }
}
