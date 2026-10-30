import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import { getSettingsForCategory, upsertSettings, deleteSetting } from '@/lib/settings/serverSettings';
import { resolveStripeSecretKey, resolveStripeWebhookSecret } from '@/lib/stripe/server/stripe';

export const dynamic = 'force-dynamic';

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
    const settings = await getSettingsForCategory('stripe');
    const secretKey = await resolveStripeSecretKey();
    const webhookSecret = await resolveStripeWebhookSecret();
    const publishableKey =
      settings.publishable_key?.trim() ||
      process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() ||
      process.env.VITE_STRIPE_PUBLISHABLE_KEY?.trim() ||
      '';

    return NextResponse.json({
      secretKey: {
        configured: Boolean(secretKey),
        masked: maskKey(secretKey),
        source: settings.secret_key ? 'db' : process.env.STRIPE_SECRET_KEY ? 'env' : 'none',
      },
      webhookSecret: {
        configured: Boolean(webhookSecret),
        masked: maskKey(webhookSecret),
        source: settings.webhook_secret ? 'db' : process.env.STRIPE_WEBHOOK_SECRET ? 'env' : 'none',
      },
      publishableKey: {
        configured: Boolean(publishableKey),
        masked: maskKey(publishableKey),
        source: settings.publishable_key ? 'db' : process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ? 'env' : 'none',
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message || 'Failed to load payment keys' },
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
      action: 'set' | 'clear';
      keyType: 'publishableKey';
      key?: string;
    };

    if (body.keyType === 'publishableKey') {
      if (body.action === 'set') {
        const pk = (body.key || '').trim();
        if (!pk) {
          return NextResponse.json({ error: 'Publishable key cannot be empty' }, { status: 400 });
        }
        await upsertSettings('stripe', { publishable_key: pk });
        return NextResponse.json({ ok: true, message: 'Stripe publishable key saved' });
      }

      if (body.action === 'clear') {
        await deleteSetting('stripe', 'publishable_key');
        return NextResponse.json({ ok: true, message: 'Stripe publishable key cleared' });
      }
    }

    return NextResponse.json({ error: 'Invalid keyType or action' }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message || 'Failed to update payment key' },
      { status: 500 }
    );
  }
}
