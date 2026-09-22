import { describe, expect, it } from 'vitest';

import { pickSupabaseConfig } from './config';

/**
 * The rule itself, not the ambient environment.
 *
 * `pickSupabaseConfig` takes both environment objects so these assertions do not
 * depend on whether `.env.local` happens to be loaded by the test runner — a test
 * that read the real environment would pass or fail depending on the developer's
 * checkout, which is exactly the failure mode `lib/backend/config.ts` documents
 * for its own resolver.
 */
describe('pickSupabaseConfig', () => {
  it('prefers the Vite-era spelling that the previous build populated', () => {
    expect(
      pickSupabaseConfig(
        { VITE_SUPABASE_URL: 'https://vite.supabase.co', VITE_SUPABASE_ANON_KEY: 'vite-key' },
        { NEXT_PUBLIC_SUPABASE_URL: 'https://next.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'next-key' }
      )
    ).toEqual({ url: 'https://vite.supabase.co', anonKey: 'vite-key' });
  });

  it('falls back to the Next.js spelling', () => {
    expect(
      pickSupabaseConfig(
        {},
        { NEXT_PUBLIC_SUPABASE_URL: 'https://next.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'next-key' }
      )
    ).toEqual({ url: 'https://next.supabase.co', anonKey: 'next-key' });
  });

  it('strips a trailing slash so callers can join paths without doubling it', () => {
    expect(
      pickSupabaseConfig(
        { VITE_SUPABASE_URL: 'https://project.supabase.co/', VITE_SUPABASE_ANON_KEY: 'key' }
      )?.url
    ).toBe('https://project.supabase.co');
  });

  it('is not configured when either half is missing', () => {
    // A URL without a key is not a configuration, and reporting one as configured
    // is what makes a client fail later with a confusing 401 instead of the honest
    // "not configured" state.
    expect(pickSupabaseConfig({ VITE_SUPABASE_URL: 'https://project.supabase.co' })).toBeNull();
    expect(pickSupabaseConfig({ VITE_SUPABASE_ANON_KEY: 'key' })).toBeNull();
    expect(pickSupabaseConfig({}, {})).toBeNull();
  });

  it('resolves each half independently, as the resolver it replaced did', () => {
    // Pinned rather than tightened: each half takes the first source that supplies
    // it, so a deployment that declares the two halves in different environments
    // still resolves. That is the behaviour existing deployments rely on, and
    // changing it here would be a silent breaking change to their configuration.
    expect(
      pickSupabaseConfig(
        { VITE_SUPABASE_URL: 'https://vite.supabase.co' },
        { NEXT_PUBLIC_SUPABASE_ANON_KEY: 'next-key' }
      )
    ).toEqual({ url: 'https://vite.supabase.co', anonKey: 'next-key' });
  });

  it('treats empty strings as unset', () => {
    expect(
      pickSupabaseConfig({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' }, {})
    ).toBeNull();
  });
});
