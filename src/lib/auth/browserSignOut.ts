/**
 * SIGNING OUT OF THIS BROWSER — one owner, one call.
 *
 * A browser can hold three credentials at once, in three different stores:
 *
 *   - the signed admin session, `luxedge_sb_session` in localStorage, owned by
 *     `services/wordpressAdminAuth.ts`;
 *   - the signed customer session, `hk_customer_session` in localStorage, owned by
 *     `lib/auth/customerClient.ts`; and
 *   - the customer Supabase session, `sb-*` keys in localStorage/sessionStorage
 *     plus a cookie, owned by `lib/supabase/client.ts` (the last thing still on
 *     Supabase, kept here so an old session cannot outlive the migration).
 *
 * Each of those modules owns its own store and knows nothing about the other —
 * which is deliberate, and why neither of them can be the place that ends *both*.
 * This module is that place, and the only one: every screen that offers a
 * sign-out calls this, so no screen has to remember which key to clear.
 *
 * Forgetting that is exactly the bug this replaces. The console's sign-out called
 * only `clearSupabaseSession()`, which wipes `sb-*` keys — while the admin token
 * sits under `luxedge_sb_session`. The admin stayed signed in, and `/login`, which
 * sends an authenticated visitor to their role's landing page, carried them
 * straight back to `/admin`.
 *
 * Synchronous on purpose: it must finish before the caller's hard navigation. Any
 * await here is a window in which the token is still on disk.
 */

import { clearSupabaseSession } from '../supabase/client';
import { endSession } from '../../services/wordpressAdminAuth';
import { clearStoredCustomerSession } from './customerClient';

export function signOutOfBrowser(): void {
  // The admin session first: it is the credential that outranks the customer one,
  // and the one whose survival resurrects a signed-out console.
  endSession();
  // Then the customer session, and any surviving Supabase session —
  // localStorage, sessionStorage and cookie.
  clearStoredCustomerSession();
  clearSupabaseSession();
}
