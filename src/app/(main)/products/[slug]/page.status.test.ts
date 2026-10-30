import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The product detail route must not sit under a Suspense boundary.
 *
 * `notFound()` decides the response status only while nothing has been flushed. A
 * `loading.tsx` in **any** ancestor segment wraps the page in a Suspense boundary,
 * so Next streams the skeleton with `HTTP 200` first, and the 404 the page raises
 * afterwards can no longer change the status. That is how the five retired legacy
 * records and every invented slug answered `200` with a "Product not found" title
 * and no product in the body: a soft 404 that invites indexing of an empty URL.
 *
 * The regression is invisible in review — the page's own `notFound()` looks
 * correct, and what breaks it is adding a file *somewhere above it*. A root
 * `loading.tsx` was the actual cause here, introduced as a cold-load skeleton and
 * explained as load-bearing for `useSearchParams`; the production build passes
 * with it gone, which is the check that decides that question. `admin/loading.tsx`
 * stays, because the admin console has no 404 to report. These assertions are the
 * only thing that catches a new ancestor boundary, so they name the three segments
 * that would reintroduce one.
 *
 * If a future segment genuinely needs a skeleton above a page that calls
 * `notFound()`, the 404 has to be decided before that boundary instead — in
 * middleware, or by not streaming — rather than by deleting this test.
 */
const ANCESTOR_LOADING_BOUNDARIES = [
  ['app/loading.tsx', '../../../loading.tsx'],
  ['app/(main)/loading.tsx', '../../loading.tsx'],
  ['app/(main)/products/loading.tsx', '../loading.tsx'],
] as const;

describe('product detail route status', () => {
  it.each(ANCESTOR_LOADING_BOUNDARIES)(
    'has no Suspense boundary at %s, so notFound() can answer 404',
    (_label, relative) => {
      expect(existsSync(fileURLToPath(new URL(relative, import.meta.url)))).toBe(false);
    }
  );
});
