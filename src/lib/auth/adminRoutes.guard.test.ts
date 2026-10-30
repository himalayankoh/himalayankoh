import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Every `/api/admin/*` route must authorize before it does anything.
 *
 * Authorization that lives only in the UI is not authorization: the routes are
 * public URLs, and hiding a button changes nothing about who can call them. This
 * test is a source scan rather than a request test on purpose — it does not need a
 * session, a running server or a mocked Supabase, and it fails the moment a new
 * admin route is added without the guard, which is exactly the regression that is
 * easy to make and hard to notice.
 *
 * A route that legitimately needs a different guard (a customer-session route, say)
 * does not live under `/api/admin`, which is why the rule is absolute here.
 */

const ADMIN_API_DIR = join(process.cwd(), 'src', 'app', 'api', 'admin');

function routeFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) found.push(...routeFiles(full));
    else if (entry === 'route.ts') found.push(full);
  }
  return found;
}

describe('admin API routes', () => {
  const files = routeFiles(ADMIN_API_DIR);

  it('exist at all, so this test cannot pass vacuously', () => {
    expect(files.length).toBeGreaterThan(8);
  });

  it.each(routeFiles(ADMIN_API_DIR).map((file) => [relative(process.cwd(), file), file]))(
    '%s verifies the admin session',
    (_name, file) => {
      const source = readFileSync(file, 'utf8');
      expect(source).toMatch(/verifyAdminRequest/);
    }
  );

  it('never trusts a client-supplied role or token claim', () => {
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      // A route that read `role` from the request body would be authorizing on the
      // caller's own word. `verifyAdminRequest` reads the session instead, and this
      // pins that no route has grown a shortcut.
      expect(source).not.toMatch(/record\.role|body\.role.*===.*['"]admin['"]/);
    }
  });
});
