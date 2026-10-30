/**
 * The wholesale switch, at the server.
 *
 * Checked on the server rather than only in the UI: a hidden rail entry is a
 * convenience, not a control, and a deployment with the plugin uninstalled should
 * answer the wholesale APIs with a stated 503 instead of an unhandled plugin error.
 *
 * **Retail never calls this.** Nothing in the shop, the cart, the account, checkout or
 * the retail console imports it, so wholesale being off cannot make a retail request
 * fail — which is the isolation the retail system was promised.
 *
 * Every wholesale route calls this immediately after it has established who is
 * asking, so a disabled deployment says so rather than half-working.
 */

import { NextResponse } from 'next/server';
import { isWholesaleEnabled } from './feature';

/** The response to return when wholesale is off, or null when it is on. */
export function wholesaleDisabled(): NextResponse | null {
  if (isWholesaleEnabled()) return null;
  return NextResponse.json(
    {
      error:
        'Wholesale is switched off for this deployment (WHOLESALE_ENABLED). The retail shop is unaffected — accounts, quotations and orders are untouched and come back when it is switched on.',
      wholesaleEnabled: false,
    },
    { status: 503 }
  );
}
