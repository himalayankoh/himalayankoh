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
 * The admin console's first paint must be the console.
 *
 * `/admin` is prerendered without a session, so the document the browser receives
 * is whatever the gate renders with no identity. That used to be a charcoal
 * full-screen panel reading "Loading admin panel..." — a screen that is neither
 * the console nor the storefront, and which the real dashboard then replaced. That
 * is the "old page first, then the dashboard" the owner reported.
 *
 * These are source assertions rather than a render test on purpose: the failure
 * mode is a *different component* being mounted on the server path, and this
 * catches exactly that while staying runnable without a DOM.
 */
describe('admin first paint', () => {
  it('renders the console shell while the session is unresolved, not a legacy loader', () => {
    const route = readCode('./AdminRoute.tsx');
    expect(route).toContain("import AdminShellSkeleton from '../admin/AdminShellSkeleton'");
    expect(route).toContain('<AdminShellSkeleton />');
    expect(route).not.toMatch(/Loading admin panel/i);

    // The pending state must come before any identity verdict, or the document
    // would render a redirect (or the console) that the browser then contradicts.
    const pendingIndex = route.indexOf('<AdminShellSkeleton />');
    const redirectIndex = route.indexOf('<Navigate to={`/login');
    expect(pendingIndex).toBeGreaterThan(-1);
    expect(redirectIndex).toBeGreaterThan(pendingIndex);
  });

  it('holds the first client render to the document it hydrates', () => {
    const route = readCode('./AdminRoute.tsx');
    // `mounted` is what makes the browser's first render agree with the
    // prerendered document, so the swap happens once instead of twice.
    expect(route).toMatch(/const \[mounted, setMounted\] = useState\(false\)/);
    expect(route).toContain('if (isAdmin && mounted)');
    expect(route).toContain('if (!mounted || loading');
  });

  it('gives the skeleton the console chrome rather than a blank page', () => {
    const skeleton = readCode('../admin/AdminShellSkeleton.tsx');
    expect(skeleton).toContain('Admin Console');
    expect(skeleton).toContain('aria-busy="true"');
    expect(skeleton).not.toMatch(/Loading admin panel/i);
  });
});
