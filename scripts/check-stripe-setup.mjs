/**
 * Stripe credential check — `npm run check:stripe`.
 *
 * Two things changed from the Supabase era:
 *
 *  1. This build has no Supabase, so the old script's demand for
 *     NEXT_PUBLIC_SUPABASE_URL / *_ANON_KEY / SERVICE_ROLE_KEY was making a
 *     perfectly configured Stripe account report as a failure. Those checks are
 *     gone.
 *
 *  2. The secret key no longer has to live in `.env.local`. The app reads it
 *     from Admin → Settings → Service & API Keys first (WordPress options, no
 *     redeploy) and only falls back to `process.env`. A check that reads only
 *     the environment therefore reports "MISSING" for a key the running site is
 *     happily using, so this script says where to look and points at the Test
 *     connection button for the stored-key case.
 *
 * To check a key you hold but have not stored anywhere:
 *     STRIPE_SECRET_KEY=sk_test_... npm run check:stripe
 *
 * It never charges. In test mode it creates and immediately cancels a $1
 * PaymentIntent (the smallest thing that proves the key can write); in live mode
 * it only reads the balance, because a diagnostic must not touch real money.
 */
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

const root = process.cwd();
const envPath = path.join(root, '.env.local');

if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  console.log('NOTE  No .env.local in this directory — checking environment variables only.');
}

const placeholder = /^(your|xxx|change|todo|example)/i;
const usable = (v) => Boolean(v && v.trim().length > 8 && !placeholder.test(v.trim()));

const secretKey = (process.env.STRIPE_SECRET_KEY || '').trim();
const publishableKey = (
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ||
  process.env.VITE_STRIPE_PUBLISHABLE_KEY ||
  ''
).trim();

const secretInEnv = usable(secretKey);
const publishableInEnv = usable(publishableKey);

console.log('Stripe credentials visible to this script (.env.local + process env)');
console.log(`  ${publishableInEnv ? 'OK     ' : 'ABSENT '} NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY${publishableInEnv ? `  (${publishableKey.slice(0, 8)}…${publishableKey.slice(-4)}, ${publishableKey.startsWith('pk_test_') ? 'test' : publishableKey.startsWith('pk_live_') ? 'LIVE' : 'unrecognised prefix'})` : ''}`);
console.log(`  ${secretInEnv ? 'OK     ' : 'ABSENT '} STRIPE_SECRET_KEY${secretInEnv ? `  (${secretKey.slice(0, 8)}…${secretKey.slice(-4)}, ${secretKey.startsWith('sk_test_') ? 'test' : secretKey.startsWith('sk_live_') ? 'LIVE' : 'unrecognised prefix'})` : ''}`);
console.log(`  ${usable(process.env.STRIPE_WEBHOOK_SECRET) ? 'OK     ' : 'ABSENT '} STRIPE_WEBHOOK_SECRET`);

if (!publishableInEnv && !secretInEnv) {
  console.log(`
Neither key is in the environment. That is expected if you saved them in the
admin console instead — the site reads Admin → Settings → Service & API Keys
first and only then falls back to the environment. Use Test connection on the
Stripe card there to verify the stored key, or re-run this script as:

    STRIPE_SECRET_KEY=sk_test_... npm run check:stripe
`);
  process.exit(0);
}

if (!secretInEnv) {
  console.log(`
A publishable key is present but no secret key is in the environment, so there is
nothing here to call Stripe with. The server may still have a secret key stored in
Admin → Settings → Service & API Keys — use Test connection there, or export the
key for this script to verify it directly.`);
  process.exit(0);
}

const isTest = secretKey.startsWith('sk_test_');
const isLive = secretKey.startsWith('sk_live_');

if (isLive) {
  console.warn('\nWARN  This is a LIVE secret key. The app refuses live charging unless STRIPE_ALLOW_LIVE=true is set on the server.');
} else if (!isTest) {
  console.warn('\nWARN  The secret key starts with neither sk_test_ nor sk_live_ — check you copied the right value.');
}

if (publishableInEnv && isTest && publishableKey.startsWith('pk_live_')) {
  console.warn('WARN  Publishable and secret keys are from different modes (pk_live_ with sk_test_). Stripe.js rejects that pair — both keys must come from the same mode.');
}

console.log(`\nCalling the Stripe API to verify the key (read-only${isTest ? ' + one $1 test PaymentIntent it cancels' : ''}) …`);

const { default: Stripe } = await import('stripe');
const stripe = new Stripe(secretKey);

try {
  const balance = await stripe.balance.retrieve();
  console.log(`OK    Key accepted by Stripe. livemode: ${balance.livemode}`);

  if (isTest) {
    const intent = await stripe.paymentIntents.create({
      amount: 100,
      currency: 'usd',
      automatic_payment_methods: { enabled: true },
      description: 'himalayan-koh check-stripe-setup diagnostic (never charged)',
    });
    await stripe.paymentIntents.cancel(intent.id);
    console.log(`OK    Test PaymentIntent created and cancelled: ${intent.id}`);
    console.log('\nStripe is ready. Test card: 4242 4242 4242 4242 · any future expiry · any CVC.');
    console.log('For local webhooks: stripe listen --forward-to localhost:3000/api/stripe/webhook');
  } else {
    console.log('      Live key: no PaymentIntent was created — a diagnostic must not touch real money.');
  }
} catch (error) {
  console.error(`FAIL  Stripe rejected the request: ${error.message}`);
  process.exit(1);
}
