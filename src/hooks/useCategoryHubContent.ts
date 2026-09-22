import { useEffect, useMemo, useState } from 'react';
import { getCategoryContent } from '../lib/categoryContent/resolve';
import { applyCategoryHubOverride } from '../lib/categoryContent/cmsMerge';
import type { CategoryHubOverrideRow } from '../lib/categoryContent/cmsTypes';
import type { CategoryContentBundle } from '../lib/categoryContent';
import type { CategoryContentKey } from '../lib/categoryContent';

/**
 * Static registry content for a category hub, plus the published CMS override
 * when there is one.
 *
 * The override is read from `/api/category-hub` rather than from Supabase here.
 * A hub with no override is the normal case and the registry content is already
 * correct for it, so there is nothing to wait for: the shelf renders immediately
 * and the override is applied if and when it arrives. That is also why there is
 * no "is the CMS configured" test any more — it used to gate this read, and it
 * was the reason a Supabase import sat in the catalog's client graph.
 */
export function useCategoryHubContent(categoryKey: CategoryContentKey | null) {
  const staticContent = useMemo(() => getCategoryContent(categoryKey), [categoryKey]);
  const [override, setOverride] = useState<CategoryHubOverrideRow | null>(null);

  /** Show the new shelf's registry content immediately when switching categories (no stale shelf content). */
  useEffect(() => {
    setOverride(null);
  }, [categoryKey]);

  useEffect(() => {
    if (!categoryKey) return;

    let cancelled = false;

    void fetch(`/api/category-hub?key=${encodeURIComponent(categoryKey)}`)
      .then(async (response) => {
        if (!response.ok) return null;
        const body = (await response.json()) as { override?: CategoryHubOverrideRow | null };
        return body.override ?? null;
      })
      .catch((error) => {
        console.warn('Category hub CMS load failed, using registry defaults:', error);
        return null;
      })
      .then((loaded) => {
        if (!cancelled) setOverride(loaded);
      });

    return () => {
      cancelled = true;
    };
  }, [categoryKey]);

  const content = useMemo<CategoryContentBundle | null>(
    () => (staticContent ? applyCategoryHubOverride(staticContent, override) : staticContent),
    [staticContent, override]
  );

  // No `loading`: the registry content is the shelf's content, and the override
  // only refines it, so there is never a moment when the hub has nothing to show.
  return { content, staticContent };
}
