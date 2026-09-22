import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The storefront must not ship the Supabase SDK.
 *
 * Why a source test and not the build: the acceptance measurement
 * (`scripts/check-client-supabase.mjs`) needs a built app and a running server,
 * so it cannot run under `vitest`. This pins the same property at the source
 * level, which is where a regression would come from — and it is cheap.
 *
 * The mechanism worth understanding, because it is why one line here matters
 * more than its size suggests: a bundler follows the whole module graph of an
 * imported module. Importing one pure constant from a file whose other exports
 * include a `supabase.from(...)` call pulls the library into the bundle, so the
 * file list below is really a list of *transitive* entry points.
 *
 * Two groups:
 *
 *   app-wide  modules in the root or `(main)` layout graph. Anything they import
 *             is downloaded by every storefront route — `AuthModal` alone was
 *             worth 26 routes.
 *   pages     the storefront's own screens.
 *
 * `lib/supabase/database.types` is deliberately not in the forbidden set: it
 * exports types only, TypeScript erases those imports, and roughly twenty
 * screens read its `Order`/`Address` shapes.
 */

const FORBIDDEN = [
  '@/lib/supabase/client',
  '@/lib/supabase/api',
  '@/lib/supabase/config',
  '@supabase/supabase-js',
];

const APP_WIDE = [
  'src/app/providers.tsx',
  'src/components/Layout.tsx',
  'src/components/AuthModal.tsx',
  'src/components/CartDrawer.tsx',
  'src/components/SearchModal.tsx',
  'src/context/AuthContext.tsx',
  'src/lib/env.ts',
];

const STOREFRONT = [
  'src/views/CheckoutPage.tsx',
  'src/views/CheckoutSuccessPage.tsx',
  'src/views/OrderConfirmationPage.tsx',
  'src/views/ProductsPage.tsx',
  'src/hooks/useCategoryHubContent.ts',
  // The account portal and the article page each read their data straight from
  // Supabase, which put the SDK on `/account` and `/blog/[slug]`. Both now read
  // through a route (`/api/account/addresses`, `/api/account/password`,
  // `/api/blog/articles`), and these entries keep them there.
  'src/views/AccountPage.tsx',
  'src/views/BlogDetailPage.tsx',
  'src/lib/account/addresses.ts',
  'src/lib/blog/client.ts',
  'src/lib/orders/totals.ts',
  'src/lib/orders/client.ts',
  // The product detail page's campaign path reaches this pair, which is how the
  // Supabase project URL used to reach the storefront's most-visited page.
  'src/lib/marketing.ts',
  'src/services/siteEvents.ts',
];

/** Runtime imports of Supabase — `import type` is erased and therefore exempt. */
function runtimeSupabaseImports(source: string): string[] {
  return source
    .split('\n')
    .filter((line) => /^\s*import\b/.test(line) && !/^\s*import\s+type\b/.test(line))
    .filter((line) => FORBIDDEN.some((mod) => line.includes(`'${mod}'`) || line.includes(`"${mod}"`)));
}

describe.each([...APP_WIDE, ...STOREFRONT])('%s', (relativePath) => {
  it('imports no Supabase module at runtime', () => {
    const source = readFileSync(join(process.cwd(), relativePath), 'utf8');
    expect(runtimeSupabaseImports(source)).toEqual([]);
  });
});

describe('the pure half of the order split stays pure', () => {
  it('has no I/O in the order math', () => {
    const totals = readFileSync(join(process.cwd(), 'src/lib/orders/totals.ts'), 'utf8');
    // The split's whole point: the checkout imports this file for arithmetic
    // alone, so one `await fetch` here would put data access — and whatever
    // backend it reached for — back into three routes at once. Its functions are
    // synchronous for exactly this reason; if that changes, this fails.
    expect(totals).not.toMatch(/\bfetch\(|\basync\b/);
  });
});
