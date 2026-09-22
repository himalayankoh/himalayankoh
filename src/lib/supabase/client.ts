import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
import { getSupabaseConfig } from './config';

// The customer path's own resolver (`./config`), which reads both the Vite-era and
// the Next-era variable spellings. A process.env-only check compiled to an empty
// object in the browser bundle and logged a false "not configured" warning even
// while Supabase auth was configured.
const supabaseConfig = getSupabaseConfig();
const supabaseUrl = supabaseConfig?.url || '';
const supabaseAnonKey = supabaseConfig?.anonKey || '';
const hasSupabaseConfig = supabaseConfig !== null;

if (!hasSupabaseConfig) {
  console.warn(
    'Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local.'
  );
}

export const supabase = createClient<Database>(
  supabaseUrl || 'https://disabled.supabase.co',
  supabaseAnonKey || 'disabled-anon-key',
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  }
);

// Helper to check if Supabase is configured
export const isSupabaseConfigured = () => {
  return hasSupabaseConfig;
};

/**
 * Synchronously wipe every persisted Supabase auth entry from browser storage.
 *
 * Used by the sign-out handlers so a hard navigation lands genuinely logged
 * out even if supabase.auth.signOut() hangs (it can deadlock on
 * navigator.locks). We must match ALL sb-* keys, not just `*-auth-token`:
 * larger sessions (e.g. admins with extra metadata) are split into chunked
 * keys like `sb-<ref>-auth-token.0` / `.1`, which an `endsWith('-auth-token')`
 * filter silently misses — leaving the session alive and bouncing the user
 * straight back in after the redirect.
 */
export const clearSupabaseSession = () => {
  if (typeof window === 'undefined') return;
  for (const store of [window.localStorage, window.sessionStorage]) {
    try {
      Object.keys(store)
        .filter((k) => k.startsWith('sb-') || k.startsWith('supabase.'))
        .forEach((k) => store.removeItem(k));
    } catch {
      /* storage unavailable — ignore */
    }
  }
  // Also expire any cookie-based Supabase session (sb-<ref>-auth-token). If the
  // session lives in a cookie, clearing storage alone leaves it alive and the
  // user is re-authenticated on the very next page load — which is exactly what
  // kept bouncing admins back after "Sign Out".
  try {
    const host = window.location.hostname;
    const domains = ['', `; domain=${host}`, `; domain=.${host}`];
    document.cookie
      .split(';')
      .map((c) => c.split('=')[0].trim())
      .filter((name) => name.startsWith('sb-') || name.startsWith('supabase'))
      .forEach((name) => {
        domains.forEach((d) => {
          document.cookie = `${name}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT${d}`;
        });
      });
  } catch {
    /* cookies unavailable — ignore */
  }
};
