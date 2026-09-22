/**
 * The admin console's settings store — WordPress options, read through the plugin.
 *
 * These values used to be rows in Supabase's `site_settings` (one row per category
 * and key). They are WordPress options now, one option per category, exposed by
 * `hk-storefront/v1/settings` and reached through `lib/wordpress/siteContent.ts`.
 *
 * ## Why the cache stayed
 *
 * Not because of the backend: because a storefront page render asks for the same
 * category several times (a header, a footer and a landing block all want the site
 * settings), and one HTTP round trip per ask is what the cache avoids. The TTL is
 * short on purpose — a setting the owner just changed should be live in a minute,
 * and every write invalidates its own keys immediately rather than waiting.
 *
 * A read failure returns the caller's fallback (null / an empty map) instead of
 * throwing: a page must not go blank because a settings endpoint is down, and a
 * blank value is already what "not configured" means to every caller.
 */

import { siteSettingsApi } from '@/lib/wordpress/siteContent';

interface CacheEntry {
  value: string | null;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const TTL_MS = 60_000;

function cacheKey(category: string, key: string) {
  return `${category}::${key}`;
}

export async function getSetting(category: string, key: string): Promise<string | null> {
  const k = cacheKey(category, key);
  const hit = cache.get(k);
  if (hit && hit.expiresAt > Date.now()) return hit.value;

  try {
    const values = await siteSettingsApi.read(category);
    const now = Date.now();
    for (const [name, value] of Object.entries(values)) {
      cache.set(cacheKey(category, name), { value: value ?? null, expiresAt: now + TTL_MS });
    }
    // A key the store does not hold is cached too: "not set" is an answer, and
    // re-asking on every render is how a missing setting becomes a slow page.
    if (!(key in values)) cache.set(k, { value: null, expiresAt: now + TTL_MS });
    return key in values ? values[key] ?? null : null;
  } catch {
    return null;
  }
}

export async function getSettingsForCategory(
  category: string,
): Promise<Record<string, string | null>> {
  try {
    const values = await siteSettingsApi.read(category);
    const now = Date.now();
    for (const [key, value] of Object.entries(values)) {
      cache.set(cacheKey(category, key), { value: value ?? null, expiresAt: now + TTL_MS });
    }
    return values;
  } catch {
    return {};
  }
}

export async function upsertSettings(
  category: string,
  settings: Record<string, string | null>,
): Promise<void> {
  const keys = Object.keys(settings);
  if (keys.length === 0) return;

  // A cleared field is stored as null rather than dropped: "the owner emptied this"
  // and "this was never set" are different states, and only the first should
  // overwrite an existing value.
  await siteSettingsApi.write(
    category,
    Object.fromEntries(Object.entries(settings).map(([key, value]) => [key, value || null])),
  );

  for (const key of keys) cache.delete(cacheKey(category, key));
}

/**
 * Removes one stored value.
 *
 * Needed by the stores that keep a *collection* in settings — campaign drafts are
 * one key per campaign — because clearing a field is not the same as deleting the
 * record: an empty string is still a campaign that exists.
 */
export async function deleteSetting(category: string, key: string): Promise<void> {
  await siteSettingsApi.remove(category, key);
  cache.delete(cacheKey(category, key));
}

export function invalidateCategory(category: string): void {
  for (const k of cache.keys()) {
    if (k.startsWith(`${category}::`)) cache.delete(k);
  }
}
