import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

function sourceOf(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8');
}

const source = sourceOf('./client.ts');

describe('Supabase SDK client configuration', () => {
  it('uses the customer path\u2019s own config resolver', () => {
    expect(source).toContain("import { getSupabaseConfig } from './config';");
    expect(source).toContain('const supabaseConfig = getSupabaseConfig();');
    expect(source).toContain('const hasSupabaseConfig = supabaseConfig !== null;');
  });

  it('does not use the browser-unsafe process.env-only config path', () => {
    expect(source).not.toContain("import { publicEnv } from '@/lib/env';");
    expect(source).not.toContain('Boolean(supabaseUrl && supabaseAnonKey)');
  });

  it('keeps missing-config detection enabled for an actually empty resolver result', () => {
    expect(source).toContain('Supabase is not configured.');
    expect(source).toContain('const hasSupabaseConfig = supabaseConfig !== null;');
  });
});

/**
 * One home per backend.
 *
 * `src/services/supabase.ts` used to be both the Supabase config resolver and the
 * WordPress admin client's public face: 26 admin modules imported the admin client
 * from a Supabase-named module, and that module answered for two backends. These
 * two assertions are what keep it collapsed — a re-introduced shim fails the
 * suite rather than quietly splitting the admin client's home again.
 */
describe('backend ownership', () => {
  it('has no Supabase-named module serving the WordPress admin client', () => {
    expect(existsSync(fileURLToPath(new URL('../../services/supabase.ts', import.meta.url)))).toBe(false);
  });

  it('keeps the WordPress admin client free of Supabase-named exports', () => {
    const adminClient = sourceOf('../../services/wordpressAdminAuth.ts');
    const exportedNames = [
      ...adminClient.matchAll(/^export (?:async )?(?:function|const|type|interface|class) (\w+)/gm),
    ].map((match) => match[1]);

    // The module's prose still explains what it replaced — that history is worth
    // keeping. What must not come back is a *name*: a Supabase-named export here
    // would advertise a backend this module never talks to, and the deprecated
    // `isSupabaseConfigured` alias was exactly that.
    expect(exportedNames.filter((name) => /supabase/i.test(name))).toEqual([]);
    expect(exportedNames).toContain('isWordPressAdminAuthConfigured');
  });
});
