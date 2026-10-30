import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  fileURLToPath(new URL('./AuthContext.tsx', import.meta.url)),
  'utf8',
);

describe('AuthContext hydration boundary', () => {
  it('does not read browser session storage during the initial render', () => {
    expect(source).not.toMatch(/useState<.*>\(\(\)\s*=>[\s\S]*readStoredSession/);
    expect(source).toContain('const [user, setUser] = useState<SessionUser | null>(null);');
    expect(source).toContain('const [session, setSession] = useState<AuthSession | null>(null);');
    expect(source).toContain('const [loading, setLoading] = useState(true);');
  });

  it('initializes the signed session from an effect, out of the two owned stores', () => {
    expect(source).toContain('const storedAdmin = readStoredAdminSession();');
    expect(source).toContain('const storedCustomer = getCustomerSession();');
    // Both stores are read inside the effect and after the first render, which is
    // what keeps SSR and the browser's first paint identical.
    expect(source).toMatch(/useEffect\(\(\) => \{[\s\S]*readStoredAdminSession\(\)[\s\S]*getCustomerSession\(\)/);
  });

  /**
   * The SDK must not come back through the root of the client graph. `AuthContext`
   * wraps every route, so an import here put Supabase in the bundle of all 59 of
   * them — the reason this file is asserted rather than merely edited.
   */
  it('carries no Supabase client or session', () => {
    expect(source).not.toContain("from '@supabase/supabase-js'");
    expect(source).not.toContain('lib/supabase/client');
    expect(source).not.toContain('supabase.auth');
    expect(source).not.toContain('authApi');
  });
});
