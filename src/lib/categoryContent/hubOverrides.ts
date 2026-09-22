/**
 * Category hub CMS overrides — WordPress options, read and written through the plugin.
 *
 * An override used to be a row in Supabase's `category_hub_overrides`, read from the
 * browser by the storefront and from the admin console. It is a WordPress option
 * now (`hk_category_hub_<key>`, see the `hk-storefront` plugin), and both callers go
 * through `hk-storefront/v1/category-hubs`.
 *
 * The merge itself is unchanged: `applyCategoryHubOverride` still layers an override
 * over the registry content, and a hub with no override still renders the registry.
 * Only the storage moved.
 *
 * The public storefront route filters on `is_published` **here**, in the app, because
 * the plugin's namespace is administrator-only and therefore has no reason to hide
 * anything: it answers with the stored override and the caller decides what a
 * visitor may see. Keeping that decision in the app is also what keeps a draft
 * override from becoming a published one by asking a different endpoint.
 */

import { applyCategoryHubOverride } from './cmsMerge';
import { getCategoryContent } from './resolve';
import type { CategoryHubOverrideForm, CategoryHubOverrideRow } from './cmsTypes';
import type { CategoryContentKey } from './keys';
import { CATEGORY_FILTER_TABS } from './keys';
import type { CategoryContentBundle } from './types';
import { categoryHubOverridesApi } from '@/lib/wordpress/siteContent';

/** The stored override, in the shape the merge and the editor already expect. */
function toOverrideRow(stored: {
  category_key: string;
  hero: unknown;
  seo: unknown;
  trust_points: unknown;
  is_published: boolean;
  updated_at: string;
}): CategoryHubOverrideRow {
  return {
    category_key: stored.category_key,
    hero: (stored.hero ?? {}) as CategoryHubOverrideRow['hero'],
    seo: (stored.seo ?? {}) as CategoryHubOverrideRow['seo'],
    trust_points: stored.trust_points ?? [],
    is_published: stored.is_published === true,
    updated_at: stored.updated_at,
  };
}

export const categoryHubApi = {
  async getOverride(
    categoryKey: CategoryContentKey,
    options: { includeUnpublished?: boolean } = {}
  ): Promise<CategoryHubOverrideRow | null> {
    const stored = await categoryHubOverridesApi.get(categoryKey);
    if (!stored) return null;

    const override = toOverrideRow(stored);
    if (!options.includeUnpublished && !override.is_published) return null;
    return override;
  },

  async listOverrides(): Promise<CategoryHubOverrideRow[]> {
    const stored = await categoryHubOverridesApi.list();
    return stored.map(toOverrideRow);
  },

  async upsertOverride(form: CategoryHubOverrideForm): Promise<CategoryHubOverrideRow> {
    const saved = await categoryHubOverridesApi.save({
      category_key: form.category_key,
      hero: form.hero,
      seo: form.seo,
      trust_points: form.trust_points,
      is_published: form.is_published,
    });
    return toOverrideRow(saved);
  },

  async getMergedCategoryContent(
    categoryKey: CategoryContentKey
  ): Promise<CategoryContentBundle | null> {
    const base = getCategoryContent(categoryKey);
    if (!base) return null;

    const override = await this.getOverride(categoryKey);
    return applyCategoryHubOverride(base, override);
  },

  listEditableKeys(): CategoryContentKey[] {
    return CATEGORY_FILTER_TABS
      .map((tab) => tab.key)
      .filter((key): key is CategoryContentKey => Boolean(key));
  },
};
