/**
 * Supabase configuration — the customer path's, and the only place it is resolved.
 *
 * ## Why it lives here
 *
 * Customer accounts are the last thing still on Supabase (`lib/auth/customerRequest.ts`,
 * `lib/supabase/api/*`), so the storefront still needs to know where the project
 * is. Admin auth has *left* Supabase, so this resolver belongs to the customer path
 * and nowhere else.
 *
 * It used to live in `src/services/supabase.ts`, a file that also re-exported the
 * whole WordPress admin client. That made one file answerable for two backends —
 * and made the admin client's *public face* a Supabase-named module even though
 * none of the code behind it touched Supabase. Both are gone: this is the customer
 * path's config, and the admin client is imported from its own module
 * (`services/wordpressAdminAuth.ts`).
 *
 * ## The rule is pure, the wrapper is ambient
 *
 * `pickSupabaseConfig` is exported so the precedence can be pinned by a test
 * without depending on whatever the environment happens to hold — the same reason
 * `lib/backend/config.ts` exports `resolveDataSource` and `describeReadiness` as
 * pure functions. Two variable spellings are accepted because this codebase has
 * been built by more than one bundler: `import.meta.env.VITE_*` (the Vite-era
 * build) and `process.env.NEXT_PUBLIC_*` / `VITE_*` (Next.js). Reading only one of
 * them is what produced a false "Supabase is not configured" warning in a
 * deployment that was configured.
 */

/** The resolved project, or null when the deployment has not been given one. */
export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

/**
 * Resolves the Supabase project from whichever environment object it was passed.
 *
 * Returns **null** when either half is missing. A URL without a key is not a
 * configuration — treating it as one is how a client gets built against a project
 * it cannot query, and the honest "not configured" state is what every caller
 * checks for.
 */
export function pickSupabaseConfig(
  metaEnv: Record<string, string | undefined> = {},
  procEnv: Record<string, string | undefined> = {}
): SupabaseConfig | null {
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
 * The deployment's Supabase configuration, read from the ambient environment.
 *
 * The anon key is public by design (it is the key the browser is *meant* to
 * carry); the service-role key is not, and lives server-side only — see
 * `lib/stripe/server/supabaseAdmin.ts`.
 */
export function getSupabaseConfig(): SupabaseConfig | null {
  const metaEnv =
    (typeof import.meta !== 'undefined' && (import.meta as { env?: Record<string, string> }).env) || {};
  const procEnv =
    (typeof process !== 'undefined' && (process.env as Record<string, string | undefined>)) || {};
  return pickSupabaseConfig(metaEnv, procEnv);
}
