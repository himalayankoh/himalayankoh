import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Nobody becomes an administrator because of their email address.
 *
 * The console used to decide its own role by comparing the session's address
 * against a hardcoded list — `admin@` prefix included — which meant the browser,
 * not the server, granted the console's UI. The role now comes from the signed
 * session and is confirmed by `GET /api/auth/session`; this test is the guard
 * against the allowlist quietly growing back.
 *
 * It is a source scan for the same reason `adminRoutes.guard.test.ts` is: the
 * regression is a single line in a page nobody re-reads, and it needs no session
 * or running server to catch.
 */

const SRC = join(process.cwd(), 'src');
const AUTH_CONTEXT = join(SRC, 'context', 'AuthContext.tsx');

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) found.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) found.push(full);
  }
  return found;
}

describe('admin role is server-authoritative', () => {
  const files = sourceFiles(SRC);

  it('scans a real source tree, so it cannot pass vacuously', () => {
    expect(files.length).toBeGreaterThan(200);
  });

  it('never grants admin from an `admin@` prefix', () => {
    const offenders = files.filter((file) =>
      /startsWith\(\s*['"]admin@/.test(readFileSync(file, 'utf8'))
    );
    expect(offenders.map((file) => relative(process.cwd(), file))).toEqual([]);
  });

  it('never grants admin from an email equality test', () => {
    // `if (user.email === 'someone@…') return 'admin'` — the shape the defect had.
    const pattern =
      /if\s*\([^)]*\.email\s*===\s*['"][^'"]+['"][^)]*\)\s*(?:\{[^}]*)?return\s*['"]admin['"]/;
    const offenders = files.filter((file) => pattern.test(readFileSync(file, 'utf8')));
    expect(offenders.map((file) => relative(process.cwd(), file))).toEqual([]);
  });

  it('keeps roleFromUser reading the signed claim and nothing else', () => {
    const source = readFileSync(AUTH_CONTEXT, 'utf8');
    const start = source.indexOf('function roleFromUser');
    expect(start).toBeGreaterThan(-1);
    const body = source.slice(start, source.indexOf('\n}', start));

    expect(body).toContain('user_metadata');
    expect(body).not.toContain('email');
  });

  it('confirms the stored session with the server before showing a role', () => {
    const source = readFileSync(AUTH_CONTEXT, 'utf8');

    // The client asks; it does not decide.
    expect(source).toContain("import { resolveServerIdentity } from '../lib/auth/sessionIdentity';");
    expect(source).toContain('await resolveServerIdentity()');
    // And the answer is what it presents — including the id, not the stored blob's.
    expect(source).toMatch(/identity\.role === 'admin'/);
    expect(source).toMatch(/if \(identity\.status === 'rejected'\)/);
  });

  it('names the two server-side verifiers in the session route, and no email rule', () => {
    const source = readFileSync(join(SRC, 'app', 'api', 'auth', 'session', 'route.ts'), 'utf8');

    expect(source).toContain('verifyAdminSessionToken');
    expect(source).toContain('verifyCustomerSessionToken');
    expect(source).not.toMatch(/\.email\s*===/);
  });
});
