import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The category write rules, tested against a stubbed store.
 *
 * These are the two refusals the console must never delegate to WooCommerce:
 *
 * 1. **A populated term is not deleted.** WooCommerce moves a deleted term's
 *    products to Uncategorized (or to a `reassign` target) and reports success,
 *    so the store cannot be the check — by the time it answers, the products have
 *    already moved. The store was measured doing nothing else: a delete was sent
 *    to a term holding four products and it returned `200`, leaving those four
 *    uncategorised.
 * 2. **A taken slug is not accepted.** WooCommerce does not refuse a duplicate
 *    slug, it silently appends `-2` — measured, `HTTP 201` for a second term with
 *    the same slug. That invents a second public URL for the same shelf, so the
 *    collision is caught here before the request is made.
 */

const request = vi.fn();

vi.mock('../backend/wordpress', () => ({
  wordpressRequest: (path: string, options?: unknown) => request(path, options),
}));

vi.mock('../backend/credentials', () => ({
  requireWooCredentials: () => undefined,
}));

import {
  CategoryNotEmptyError,
  CategorySlugTakenError,
  CategoryWriteError,
  createWooCategory,
  deleteWooCategory,
  updateWooCategory,
} from './taxonomyWrite';

beforeEach(() => {
  request.mockReset();
});

describe('deleteWooCategory', () => {
  it('refuses to delete a term that still holds products, without deleting it', async () => {
    request.mockResolvedValueOnce({
      id: 121,
      name: 'Edible Pink Salt',
      slug: 'edible-pink-salt',
      count: 4,
    });

    await expect(deleteWooCategory(121)).rejects.toBeInstanceOf(CategoryNotEmptyError);
    // Only the read happened: no DELETE was ever sent.
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][1]).toMatchObject({ useCredentials: true });
    expect((request.mock.calls[0][1] as { method?: string }).method).toBeUndefined();
  });

  it('deletes an empty term, and says which one it removed', async () => {
    request
      .mockResolvedValueOnce({ id: 199, name: 'Empty Shelf', slug: 'empty-shelf', count: 0 })
      .mockResolvedValueOnce({ id: 199, name: 'Empty Shelf', slug: 'empty-shelf', count: 0 });

    await deleteWooCategory(199);
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[1][1]).toMatchObject({ method: 'DELETE', params: { force: true } });
  });
});

describe('createWooCategory', () => {
  it('refuses a slug another category already holds, without creating anything', async () => {
    request.mockResolvedValueOnce([{ id: 123, name: 'Salt Licks', slug: 'salt-licks', count: 4 }]);

    await expect(createWooCategory({ name: 'Salt Licks', slug: 'salt-licks' })).rejects.toBeInstanceOf(
      CategorySlugTakenError
    );
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][1]).toMatchObject({ useCredentials: true });
  });

  it('creates a category when the slug is free', async () => {
    request
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce({ id: 200, name: 'Salt Blocks', slug: 'salt-blocks', count: 0 });

    const created = await createWooCategory({ name: 'Salt Blocks' });
    expect(created.id).toBe(200);
    expect(request.mock.calls[1][1]).toMatchObject({ method: 'POST' });
  });

  it('rejects an empty name and a malformed slug before any request', async () => {
    await expect(createWooCategory({ name: '   ' })).rejects.toBeInstanceOf(CategoryWriteError);
    await expect(createWooCategory({ name: 'Fine Salt', slug: 'Fine Salt!' })).rejects.toBeInstanceOf(
      CategoryWriteError
    );
    expect(request).not.toHaveBeenCalled();
  });
});

describe('updateWooCategory', () => {
  it('refuses a slug owned by a different term', async () => {
    request.mockResolvedValueOnce([{ id: 121, name: 'Edible Pink Salt', slug: 'edible-pink-salt', count: 4 }]);

    await expect(updateWooCategory(200, { slug: 'edible-pink-salt' })).rejects.toBeInstanceOf(
      CategorySlugTakenError
    );
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('allows a term to keep its own slug', async () => {
    request
      .mockResolvedValueOnce([{ id: 200, name: 'Salt Blocks', slug: 'salt-blocks', count: 2 }])
      .mockResolvedValueOnce({ id: 200, name: 'Salt Blocks and Plates', slug: 'salt-blocks', count: 2 });

    const updated = await updateWooCategory(200, { name: 'Salt Blocks and Plates', slug: 'salt-blocks' });
    expect(updated.name).toBe('Salt Blocks and Plates');
    expect(request.mock.calls[1][1]).toMatchObject({ method: 'PUT' });
  });

  it('reports an empty patch instead of sending one', async () => {
    await expect(updateWooCategory(200, {})).rejects.toBeInstanceOf(CategoryWriteError);
    expect(request).not.toHaveBeenCalled();
  });
});
