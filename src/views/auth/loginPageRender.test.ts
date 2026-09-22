import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (relative: string) =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');

/** Source with block and line comments removed, so prose about a removed string
 *  is not mistaken for the string itself. */
const readCode = (relative: string) =>
  read(relative)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

/**
 * The sign-in screen must render the same thing on both sides of the wire.
 *
 * It did not. The page decided whether to show a "Supabase environment variables
 * are missing" notice from `isSupabaseConfigured()`, and that answer differed by
 * runtime: the server reads a real `process.env` and said *configured* (so the
 * notice was absent from the prerendered HTML), while the browser bundle could not
 * see `NEXT_PUBLIC_*` at all and said *not configured* → the client rendered a
 * block the server never did, and React raised a hydration error on the exact
 * screen users sign in on.
 *
 * The notice is gone, and these assertions keep the page free of the dependency
 * that caused it: nothing in this file's render may be derived from deployment
 * configuration. `process.env.NODE_ENV` is the one exception, and deliberately so
 * — it is identical on both sides, and it gates code the production minifier
 * strips.
 *
 * Source assertions rather than a render test because this repository has no DOM
 * harness, and because the failure mode is a *reference* to an environment-derived
 * value appearing in a render path — which is exactly what this catches.
 */
describe('login page render', () => {
  const code = readCode('./LoginPage.tsx');

  it('never derives what it renders from deployment configuration', () => {
    expect(code).not.toMatch(/isSupabaseConfigured|getSupabaseConfig/);
    expect(code).not.toMatch(/NEXT_PUBLIC_|VITE_SUPABASE/);
  });

  it('keeps the development helper gated on NODE_ENV, which both sides agree on', () => {
    expect(code).toContain("if (process.env.NODE_ENV !== 'development') return null;");
  });

  /**
   * A hint that does not work is worse than no hint.
   *
   * Both sign-in surfaces used to print demo passwords — one for a customer
   * account that was never seeded, one for the admin account whose real password
   * is different. Verified against the running app: signing in with the advertised
   * `Admin@123` returns 401. Neither surface may hardcode a password again; the
   * development helper fills the admin *email* only.
   */
  it('offers no password it cannot honour', () => {
    for (const file of ['./LoginPage.tsx', '../../components/AuthModal.tsx']) {
      expect(readCode(file)).not.toMatch(/password:\s*['"][^'"]+['"]/);
    }
  });
});
