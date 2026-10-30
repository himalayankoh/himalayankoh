// ============================================================================
// Customers toolbar — the phone layout guard
//
// What went wrong, measured in a real browser on the deployed console: the
// toolbar was one non-wrapping row holding a search field with a hard
// `min-w-[320px]`, the "Buyers only" checkbox and the record count. At a 320px
// viewport those three items need ~530px, so the console's content pane — the
// scroll container the whole screen lives in — grew a horizontal scrollbar of
// 208px (153px at 375px wide) to reach the count. The page itself still reported
// zero overflow, because the pane swallowed the extra width, which is exactly
// why a `documentElement.scrollWidth` check alone had passed.
//
// The fix is Tailwind wiring, invisible to a unit test of the render tree and
// unverifiable without a session, so it is asserted from the source here: the
// row wraps, and the search field only takes its 320px floor from `sm` up.
// Re-introducing an unconditional floor must fail this file, not the owner's
// phone.
// ============================================================================
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  fileURLToPath(new URL('./AdminCustomers.tsx', import.meta.url)),
  'utf8',
);

describe('Customers toolbar layout', () => {
  it('lets the toolbar wrap instead of overflowing the console pane', () => {
    expect(source).toContain(
      'className="flex flex-wrap items-center gap-3 border-b border-admin-line px-5 py-4"',
    );
  });

  it('keeps the search field full-width at mobile and flexible only from sm up', () => {
    expect(source).toContain('className="relative w-full min-w-0 sm:w-auto sm:min-w-[320px] sm:flex-1"');
  });

  it('has no unconditional 320px floor left in the toolbar', () => {
    // The old class list: a 320px minimum that a 320px phone cannot honour.
    expect(source).not.toContain('className="relative min-w-[320px] flex-1"');
    // The only 320px floor left is the one a `sm:` variant guards.
    expect(source.split('min-w-[320px]').length - 1).toBe(1);
    expect(source).toContain('sm:min-w-[320px]');
  });
});
