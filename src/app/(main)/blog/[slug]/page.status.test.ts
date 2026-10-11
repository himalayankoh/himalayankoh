import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The article route answers 404 for a slug WordPress says does not exist, and
 * `notFound()` only decides the status while nothing has been flushed.
 *
 * A `loading.tsx` in any ancestor segment wraps the page in a Suspense boundary,
 * so Next streams a skeleton with HTTP 200 first and the 404 raised afterwards
 * cannot change the status — the same soft 404 that the product route documents
 * in `products/[slug]/page.status.test.ts`, where a root `loading.tsx` was the
 * actual cause. Nothing catches it in review, because the page's own `notFound()`
 * still looks right; the file that breaks it is somewhere above.
 */
const ANCESTOR_LOADING_BOUNDARIES = [
  ['app/loading.tsx', '../../../loading.tsx'],
  ['app/(main)/loading.tsx', '../../loading.tsx'],
  ['app/(main)/blog/loading.tsx', '../loading.tsx'],
  ['app/(main)/blog/[slug]/loading.tsx', 'loading.tsx'],
] as const;

describe('blog article route status', () => {
  it.each(ANCESTOR_LOADING_BOUNDARIES)(
    'has no Suspense boundary at %s, so notFound() can answer 404',
    (_label, relative) => {
      expect(existsSync(fileURLToPath(new URL(relative, import.meta.url)))).toBe(false);
    }
  );

  it('decides the 404 from the missing state before rendering', () => {
    // The page must ask the lookup, not a nullable read: a null from a failed read
    // and a null from a missing slug are different answers with different statuses.
    const source = readFileSync(fileURLToPath(new URL('./page.tsx', import.meta.url)), 'utf8');

    expect(source).toContain("if (lookup.state === 'missing') notFound();");
    expect(source).toContain("lookup.state === 'unavailable'");
    expect(source).not.toContain('fetchSeoBlogPostFull');
  });
});
