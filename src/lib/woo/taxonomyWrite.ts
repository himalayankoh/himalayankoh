/**
 * WooCommerce product-category reads and writes — server only.
 *
 * Categories are the store's own shelves, so the same rule as products applies:
 * WooCommerce is authoritative and there is no second copy. The console used to
 * say "Category editing is not connected" while the credentials that write
 * products sat in the same process, which was true only of the *screen* — the
 * write path already existed for products and works for terms too.
 *
 * Two rules are enforced here rather than in the screen, because they are about
 * the store's data and not about one form:
 *
 * 1. **A category with products is never deleted silently.** WooCommerce will
 *    happily move its products to `Uncategorized` (or to a `reassign` target) and
 *    report success. Both are data changes the owner did not ask for, so a
 *    delete is refused while anything is still filed under the term.
 * 2. **A slug is unique.** A collision is reported, never auto-suffixed: the slug
 *    is a public URL, and `-2` on the end of one is a second URL for the same
 *    shelf that nobody asked for.
 *
 * Names and slugs are trimmed and required; descriptions are optional because
 * most shelves in this store have none.
 */

import { wordpressRequest } from '../backend/wordpress';
import { requireWooCredentials } from '../backend/credentials';

const REST_V3 = '/wc/v3';

/** One product category as WooCommerce reports it. */
export interface WooCategoryRecord {
  id: number;
  name: string;
  slug: string;
  parent: number;
  description: string;
  /** Published products filed under this term and its children. */
  count: number;
}

export interface CategoryInput {
  name: string;
  slug?: string;
  description?: string;
  parent?: number;
}

/** A category write failed in a way the caller must surface, with its status. */
export class CategoryWriteError extends Error {
  readonly status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.name = 'CategoryWriteError';
    this.status = status;
  }
}

/** A slug that is already taken by another term. */
export class CategorySlugTakenError extends CategoryWriteError {
  constructor(slug: string) {
    super(`The slug "${slug}" is already used by another category.`, 409);
    this.name = 'CategorySlugTakenError';
  }
}

/** A delete that would orphan products. */
export class CategoryNotEmptyError extends CategoryWriteError {
  constructor(name: string, count: number) {
    super(
      `"${name}" still has ${count} product${count === 1 ? '' : 's'} filed under it. Move them to another category first — deleting the term would move them to Uncategorized.`,
      409
    );
    this.name = 'CategoryNotEmptyError';
  }
}

function normalizeSlug(slug: string): string {
  return slug.trim().toLowerCase();
}

/**
 * A public-facing slug for a name.
 *
 * WordPress generates one when none is given, but guessing its exact output here
 * would be a second implementation of its rules, so a missing slug is sent as an
 * empty string and WordPress decides — matching what the owner sees in wp-admin.
 */
function slugFrom(name: string): string {
  return normalizeSlug(
    name
      .normalize('NFKD')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
  );
}

/** Every product category, ordered by name — the admin list's read. */
export async function listWooCategories(): Promise<WooCategoryRecord[]> {
  requireWooCredentials();
  const rows = await wordpressRequest<WooCategoryRecord[]>(`${REST_V3}/products/categories`, {
    useCredentials: true,
    params: { per_page: 100, orderby: 'name', order: 'asc', hide_empty: false },
    timeoutMs: 20_000,
  });
  return rows.filter((row) => row && Number.isFinite(Number(row.id)));
}

/** The term that already holds a slug, if any (excluding one id when editing). */
async function findSlugOwner(slug: string, exceptId?: number): Promise<WooCategoryRecord | null> {
  const rows = await wordpressRequest<WooCategoryRecord[]>(`${REST_V3}/products/categories`, {
    useCredentials: true,
    params: { slug: normalizeSlug(slug), per_page: 20, hide_empty: false },
    timeoutMs: 20_000,
  });
  return rows.find((row) => Number(row.id) !== exceptId) ?? null;
}

function validate(input: CategoryInput): { name: string; slug: string } {
  const name = input.name?.trim();
  if (!name) throw new CategoryWriteError('A category needs a name.', 400);
  if (name.length > 120) throw new CategoryWriteError('Category names are limited to 120 characters.', 400);
  const slug = input.slug?.trim() ? normalizeSlug(input.slug) : slugFrom(name);
  if (slug && !/^[a-z0-9-]+$/.test(slug)) {
    throw new CategoryWriteError(
      'A slug may contain lowercase letters, numbers and hyphens only.',
      400
    );
  }
  return { name, slug };
}

/** Create a category. Slug collisions are rejected, not auto-renamed. */
export async function createWooCategory(input: CategoryInput): Promise<WooCategoryRecord> {
  requireWooCredentials();
  const { name, slug } = validate(input);

  if (slug && (await findSlugOwner(slug))) throw new CategorySlugTakenError(slug);

  return wordpressRequest<WooCategoryRecord>(`${REST_V3}/products/categories`, {
    method: 'POST',
    useCredentials: true,
    body: {
      name,
      slug,
      description: input.description?.trim() ?? '',
      parent: input.parent && input.parent > 0 ? input.parent : 0,
    },
    timeoutMs: 20_000,
  });
}

/**
 * Rename a category, or change its slug.
 *
 * A slug change is a public URL change for every product filed under the term,
 * so it is allowed but never invented: the caller passes what the owner typed.
 */
export async function updateWooCategory(
  id: number,
  input: Partial<CategoryInput>
): Promise<WooCategoryRecord> {
  requireWooCredentials();
  if (!Number.isFinite(id) || id <= 0) throw new CategoryWriteError('A category id is required.', 400);

  const body: Record<string, unknown> = {};
  if (input.name !== undefined) body.name = validate({ name: input.name }).name;
  if (input.description !== undefined) body.description = input.description.trim();
  if (input.parent !== undefined) body.parent = input.parent > 0 ? input.parent : 0;

  if (input.slug !== undefined && input.slug.trim()) {
    const slug = normalizeSlug(input.slug);
    if (!/^[a-z0-9-]+$/.test(slug)) {
      throw new CategoryWriteError('A slug may contain lowercase letters, numbers and hyphens only.', 400);
    }
    if (await findSlugOwner(slug, id)) throw new CategorySlugTakenError(slug);
    body.slug = slug;
  }

  if (Object.keys(body).length === 0) {
    throw new CategoryWriteError('Nothing to update.', 400);
  }

  return wordpressRequest<WooCategoryRecord>(`${REST_V3}/products/categories/${id}`, {
    method: 'PUT',
    useCredentials: true,
    body,
    timeoutMs: 20_000,
  });
}

/**
 * Delete a category that holds nothing.
 *
 * Refused while products are filed under it — see the module comment. WooCommerce
 * reports `count` on the term, which is the number this decision is made on, and
 * it is re-read here rather than trusted from the caller.
 */
export async function deleteWooCategory(id: number): Promise<WooCategoryRecord> {
  requireWooCredentials();
  if (!Number.isFinite(id) || id <= 0) throw new CategoryWriteError('A category id is required.', 400);

  const term = await wordpressRequest<WooCategoryRecord>(`${REST_V3}/products/categories/${id}`, {
    useCredentials: true,
    timeoutMs: 20_000,
  });

  if (Number(term.count) > 0) throw new CategoryNotEmptyError(term.name, Number(term.count));

  return wordpressRequest<WooCategoryRecord>(`${REST_V3}/products/categories/${id}`, {
    method: 'DELETE',
    useCredentials: true,
    params: { force: true },
    timeoutMs: 20_000,
  });
}
