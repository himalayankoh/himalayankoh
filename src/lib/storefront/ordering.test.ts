import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  ORDERS_PAUSED_ENV_KEY,
  ORDERS_PAUSED_MESSAGE,
  ORDERS_PAUSED_PUBLIC_ENV_KEY,
  isOrderingPaused,
  orderingState,
  resolveOrderingState,
} from './ordering';

describe('the catalogue-only launch switch', () => {
  it('pauses only on an explicit true', () => {
    for (const value of ['true', 'TRUE', ' true ', 'True']) {
      expect(resolveOrderingState(value)).toEqual({ paused: true, source: 'deployment' });
    }
  });

  it('orders only on an explicit false', () => {
    for (const value of ['false', 'FALSE', ' false ']) {
      expect(resolveOrderingState(value)).toEqual({ paused: false, source: 'deployment' });
    }
  });

  it('leaves an unset or unrecognised value on the deployment’s own behaviour', () => {
    // Not guessed at: `'1'`, `'yes'` and a misspelling are values nobody decided, and
    // this switch exists to stop a launch taking orders, so it must not be *inferred*
    // from something that might be a typo in either direction.
    for (const value of [undefined, null, '', '   ', '1', '0', 'yes', 'no', 'on', 'off', 'ture']) {
      expect(resolveOrderingState(value)).toEqual({ paused: false, source: 'default' });
    }
  });

  it('reads the deployment variable by name', () => {
    expect(ORDERS_PAUSED_ENV_KEY).toBe('STOREFRONT_ORDERS_PAUSED');
    expect(orderingState({ [ORDERS_PAUSED_ENV_KEY]: 'true' }).paused).toBe(true);
    expect(isOrderingPaused({ [ORDERS_PAUSED_ENV_KEY]: 'false' })).toBe(false);
    expect(isOrderingPaused({})).toBe(false);
  });

  it('tells the shopper how to order instead, without naming configuration', () => {
    expect(ORDERS_PAUSED_MESSAGE).toMatch(/temporarily unavailable/i);
    // A real way to buy, not just a refusal.
    expect(ORDERS_PAUSED_MESSAGE).toMatch(/sales@himalayankoh\.com/);
    expect(ORDERS_PAUSED_MESSAGE).toMatch(/832/);
    // Nothing about keys, Stripe, readiness or deployments: a shopper is owed the
    // fact, not the diagnosis.
    expect(ORDERS_PAUSED_MESSAGE).not.toMatch(/stripe|key|webhook|config/i);
  });
});

/**
 * The production deployment is in catalogue-only mode, pinned where it is declared.
 *
 * The unit tests above prove the switch behaves; these prove the *deployment* has it.
 * A switch that defaults to "ordering allowed" is only safe because production does
 * not rely on the default — and the two files checked here are the whole chain: the
 * overlay is what wrangler deploys, and the guard's variable set is what refuses a
 * build whose overlay lost the pause. Read as text, the same way the footer's and the
 * homepage's category links are guarded in `lib/categoryContent/shelves.test.ts`.
 */
describe('production launches in catalogue-only mode', () => {
  const read = (relative: string) =>
    readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');

  it('declares the pause in the production overlay, in both forms', () => {
    const overlay = read('../../../wrangler.production.jsonc');
    expect(overlay).toMatch(/"STOREFRONT_ORDERS_PAUSED"\s*:\s*"true"/);
    // The browser's copy: a mismatch would show a cart control to a shopper whose order
    // the routes refuse.
    expect(overlay).toMatch(/"NEXT_PUBLIC_ORDERS_PAUSED"\s*:\s*"true"/);
    expect(ORDERS_PAUSED_PUBLIC_ENV_KEY).toBe('NEXT_PUBLIC_ORDERS_PAUSED');
  });

  it('inlines the browser’s copy into a production build from the same constant', () => {
    const prepare = read('../../../scripts/prepare-deploy-env.mjs');
    expect(prepare).toMatch(/PRODUCTION_ORDERS_PAUSED_PUBLIC/);
    expect(prepare).toMatch(/NEXT_PUBLIC_ORDERS_PAUSED=\$\{ordersPausedPublic\}/);
  });

  it('renders no purchase control on the surfaces a shopper buys from', () => {
    // The screens are client components on prerendered pages, so the pause reaches them as
    // the inlined constant; these are the two that render the cart control, and the
    // wishlist and quick view reuse the card.
    for (const file of ['../../components/ProductCard.tsx', '../../components/ProductDetailView.tsx']) {
      const source = read(file);
      expect(source, file).toMatch(/ORDERING_ENABLED/);
    }
    const card = read('../../components/ProductCard.tsx');
    expect(card).toMatch(/const canBuy = ORDERING_ENABLED &&/);
    expect(card).toMatch(/\{ORDERING_ENABLED && \(/);
    const detail = read('../../components/ProductDetailView.tsx');
    expect(detail).toMatch(/!ORDERING_ENABLED\s*\?\s*'Ordering unavailable'/);
    expect(detail).toMatch(/ORDERS_PAUSED_MESSAGE/);
    // The quantity stepper is a purchase control as well, so the paused deployment renders
    // none: a stepper beside a button that says ordering is unavailable still reads as a
    // shop that takes orders.
    expect(detail).toMatch(/\{ORDERING_ENABLED && \(\s*<div className="mb-5">/);
  });

  it('keeps the pause in the set of variables the guard accepts, and nothing else', () => {
    const guard = read('../../../scripts/assert-production-config.mjs');
    expect(guard).toMatch(/STOREFRONT_ORDERS_PAUSED:\s*PRODUCTION_ORDERS_PAUSED/);
    // The set comparison is the protection: a minimum check would let the pause be
    // deleted from the overlay without failing the build.
    expect(guard).toMatch(/varKeys\.join\(','\) !== expectedKeys\.join\(','\)/);
  });

  it('states the launch mode as a production constant that is itself pinned', () => {
    const target = read('../../../scripts/production-target.mjs');
    expect(target).toMatch(/export const PRODUCTION_ORDERS_PAUSED = 'true'/);
  });

  it('enforces the pause on the route that writes an order', () => {
    const route = read('../../app/api/orders/create/route.ts');
    // Enforced by the server, before the body is read — a screen is not a control.
    expect(route).toMatch(/isOrderingPaused\(\)/);
    expect(route).toMatch(/ORDERS_PAUSED_MESSAGE/);
  });
});
