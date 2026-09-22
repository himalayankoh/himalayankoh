/**
 * ADMIN AUTH — now WordPress, no longer Supabase.
 *
 * This module used to be the browser Supabase auth client: it held the
 * access/refresh tokens, refreshed them, and mapped the `app_metadata.role`
 * claim. Admin auth has moved to WordPress REST API authentication, and the
 * implementation is now `./wordpressAdminAuth` — the admin signs in with a
 * WordPress username + application password, the server verifies it and returns
 * a signed session token, and that token is what admin writes carry.
 *
 * The names below are re-exported unchanged so the ~20 admin panels, the
 * feature modules and the legacy zustand store that import from here keep
 * working without a single edit at their call sites.
 *
 * What remains here, and why: `getSupabaseConfig`. The *customer* path
 * (sign-up, customer sign-in, orders) is still Supabase and has not been
 * migrated — `lib/supabase/client.ts` builds the SDK client from this resolver,
 * so deleting it would break the storefront. When the customer path moves to
 * WordPress/WooCommerce, this resolver goes with it and this file can be
 * deleted outright.
 */

// ---------------------------------------------------------------------------
// Supabase configuration — kept only for the customer path (see module header)
// ---------------------------------------------------------------------------
let configOverride: { url: string; anonKey: string } | null | undefined = undefined;

/**
 * Resolve the Supabase project configuration from the environment. Returns null
 * when not configured — callers must show an honest "not configured" state.
 */
export function getSupabaseConfig(): { url: string; anonKey: string } | null {
  if (configOverride !== undefined) return configOverride;
  const metaEnv =
    (typeof import.meta !== 'undefined' && (import.meta as { env?: Record<string, string> }).env) || {};
  const procEnv =
    (typeof process !== 'undefined' && (process.env as Record<string, string | undefined>)) || {};
  const url =
    metaEnv.VITE_SUPABASE_URL ||
    procEnv.NEXT_PUBLIC_SUPABASE_URL ||
    procEnv.VITE_SUPABASE_URL ||
    '';
  const anonKey =
    metaEnv.VITE_SUPABASE_ANON_KEY ||
    procEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    procEnv.VITE_SUPABASE_ANON_KEY ||
    '';
  if (!url || !anonKey) return null;
  return { url: url.replace(/\/$/, ''), anonKey };
}

/**
 * Test-only hook: override the resolved config (null = simulate unconfigured,
 * undefined = restore real env resolution). Never called by app code.
 */
export function __setSupabaseConfigForTests(
  config: { url: string; anonKey: string } | null | undefined
): void {
  configOverride = config;
}

// ---------------------------------------------------------------------------
// Admin auth — WordPress (the implementation lives in ./wordpressAdminAuth)
// ---------------------------------------------------------------------------

export {
  type SbUser,
  type SbSession,
  type AuthChangeEvent,
  SESSION_STORAGE_KEY,
  adminLoginUrl,
  readStoredSession,
  getAccessToken,
  getFreshAccessToken,
  getSession,
  getSessionUser,
  onAuthStateChange,
  signInWithPassword,
  signUp,
  signOut,
  updatePassword,
  updateUserMetadata,
  isWordPressAdminAuthConfigured,
  isSupabaseConfigured,
} from './wordpressAdminAuth';
