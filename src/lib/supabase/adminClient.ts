/**
 * The service-role Supabase client — **server-only, and now on the way out**.
 *
 * ## What still uses it
 *
 * Exactly one thing: `lib/orders/legacyOrders.ts`, the read-only adapter for orders
 * placed through this app before WooCommerce became the order store. Nothing else
 * imports this module, and nothing should be added to it.
 *
 * ## Why it moved here
 *
 * It used to live at `lib/stripe/server/supabaseAdmin.ts`, which was accurate when
 * Stripe wrote order and payment state to Supabase. It has not been for a while: the
 * payment path is WooCommerce's order plus Stripe's own metadata, and the only
 * remaining caller is a historical *read*. A module named for Stripe that sells a
 * service-role key on behalf of the orders table is how the next feature ends up
 * "just using the client that is already there". The name now says what it is.
 *
 * ## Removal condition
 *
 * Deleted with `legacyOrders.ts` once `npm run migrate:orders --apply` has imported
 * the historical orders and been reconciled — see
 * `docs/ORDERS-WOOCOMMERCE-MIGRATION.md` §4. Do not build on it.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';

let adminClient: SupabaseClient<Database> | undefined;

export function getSupabaseAdmin() {
  if (adminClient) return adminClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      'Supabase service role is not configured. Set SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL.'
    );
  }

  adminClient = createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return adminClient;
}
