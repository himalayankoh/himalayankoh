import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Trash and restore, tested against a stubbed store.
 *
 * Two defects live here, both found against the live store, and both must not come
 * back:
 *
 * 1. **`status: 'trash'` is not a write.** WooCommerce answers
 *    `rest_invalid_param: Invalid parameter(s): status` — a trashed order is moved
 *    by a plain `DELETE` (no `force`), which is reversible. The old code sent the
 *    status and moved nothing, while reporting success.
 * 2. **A restore must never guess.** The old restore fell back to `pending` when it
 *    could not find the remembered state, and one delivered order came back pending
 *    in the live store. Now a missing bookmark is a refusal, not an invention.
 */

const request = vi.fn();

vi.mock('../backend/wordpress', () => ({
  WordPressApiError: class WordPressApiError extends Error {},
  wordpressRequest: (path: string, options?: unknown) => request(path, options),
  wordpressRequestWithMeta: vi.fn(),
}));

vi.mock('../backend/credentials', () => ({
  requireWooCredentials: () => undefined,
}));

import { HK_META, TRASH_STATUS_META, restoreWooOrders, trashWooOrders, type WooOrderLike } from './orders';

function order(overrides: Partial<WooOrderLike> = {}): WooOrderLike {
  return { id: 500, status: 'processing', meta_data: [], ...overrides };
}

beforeEach(() => {
  request.mockReset();
});

describe('trashWooOrders', () => {
  it('remembers the app state, then moves the order with a reversible delete', async () => {
    request
      .mockResolvedValueOnce(order({ status: 'completed' })) // read
      .mockResolvedValueOnce(order({ status: 'completed' })) // bookmark write
      .mockResolvedValueOnce(order({ status: 'completed' })); // delete

    const result = await trashWooOrders([500]);

    expect(result.changed).toEqual([500]);
    expect(result.failed).toEqual([]);
    // The bookmark carries the app status — 'delivered', not the store's 'completed'.
    expect(request.mock.calls[1][1]).toMatchObject({
      method: 'PUT',
      body: { meta_data: [{ key: TRASH_STATUS_META, value: 'delivered' }] },
    });
    // Moved, not destroyed: a DELETE without `force`.
    expect(request.mock.calls[2][1]).toMatchObject({
      method: 'DELETE',
      params: { force: 'false' },
    });
  });

  it('keeps the app status, not the native one, in the bookmark', async () => {
    request
      .mockResolvedValueOnce(order({ status: 'processing', meta_data: [{ key: HK_META.status, value: 'shipped' }] }))
      .mockResolvedValueOnce(order())
      .mockResolvedValueOnce(order());

    await trashWooOrders([500]);

    expect(request.mock.calls[1][1]).toMatchObject({
      body: { meta_data: [{ key: TRASH_STATUS_META, value: 'shipped' }] },
    });
  });

  it('refuses an order already in the trash instead of overwriting its bookmark', async () => {
    request.mockResolvedValueOnce(
      order({ status: 'trash', meta_data: [{ id: 9, key: TRASH_STATUS_META, value: 'delivered' }] })
    );

    const result = await trashWooOrders([500]);

    expect(result.changed).toEqual([]);
    expect(result.failed[0].error).toMatch(/already in the trash/i);
    // Nothing beyond the read: no write, no delete.
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('reports a failed read without touching the order', async () => {
    request.mockRejectedValueOnce(new Error('store unavailable'));

    const result = await trashWooOrders([500]);

    expect(result.changed).toEqual([]);
    expect(result.failed).toEqual([{ id: 500, error: 'store unavailable' }]);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('one order failing does not stop the rest', async () => {
    request
      .mockRejectedValueOnce(new Error('store unavailable')) // first read fails
      .mockResolvedValueOnce(order()) // second read
      .mockResolvedValueOnce(order()) // second bookmark
      .mockResolvedValueOnce(order()); // second delete

    const result = await trashWooOrders([1, 2]);

    expect(result.changed).toEqual([2]);
    expect(result.failed).toEqual([{ id: 1, error: 'store unavailable' }]);
  });
});

describe('restoreWooOrders', () => {
  it('puts a delivered order back to delivered — never pending', async () => {
    request
      .mockResolvedValueOnce(
        order({
          status: 'trash',
          meta_data: [
            { id: 77, key: TRASH_STATUS_META, value: 'delivered' },
            { id: 78, key: HK_META.status, value: '' },
          ],
        })
      )
      .mockResolvedValueOnce(order({ status: 'completed' }));

    const result = await restoreWooOrders([500]);

    expect(result.changed).toEqual([500]);
    expect(result.failed).toEqual([]);
    const put = request.mock.calls[1][1] as { method?: string; body: Record<string, unknown> };
    expect(put.method).toBe('PUT');
    expect(put.body.status).toBe('completed');
    // The app status is cleared (Woo's own 'completed' now means delivered) and the
    // bookmark row is removed by id, so no blank custom field is left behind.
    expect(put.body.meta_data).toEqual([
      { key: HK_META.status, value: '' },
      { id: 77, key: TRASH_STATUS_META, value: null },
    ]);
  });

  it('restores a meta-only state as the store status plus its meta', async () => {
    request
      .mockResolvedValueOnce(
        order({ status: 'trash', meta_data: [{ id: 55, key: TRASH_STATUS_META, value: 'shipped' }] })
      )
      .mockResolvedValueOnce(order());

    await restoreWooOrders([500]);

    const put = request.mock.calls[1][1] as { body: Record<string, unknown> };
    expect(put.body.status).toBe('processing');
    expect(put.body.meta_data).toEqual([
      { key: HK_META.status, value: 'shipped' },
      { id: 55, key: TRASH_STATUS_META, value: null },
    ]);
  });

  it('refuses when there is no bookmark, rather than guessing a status', async () => {
    request.mockResolvedValueOnce(order({ status: 'trash', meta_data: [] }));

    const result = await restoreWooOrders([500]);

    expect(result.changed).toEqual([]);
    expect(result.failed[0].error).toMatch(/no remembered status/i);
    // No PUT was sent: the order was left exactly as it was.
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('refuses when the bookmark is blank or unrecognised', async () => {
    request
      .mockResolvedValueOnce(order({ status: 'trash', meta_data: [{ id: 1, key: TRASH_STATUS_META, value: '' }] }))
      .mockResolvedValueOnce(order({ status: 'trash', meta_data: [{ id: 2, key: TRASH_STATUS_META, value: 'wat' }] }));

    const blank = await restoreWooOrders([500]);
    const unknown = await restoreWooOrders([500]);

    expect(blank.failed[0].error).toMatch(/no remembered status/i);
    expect(unknown.failed[0].error).toMatch(/no remembered status/i);
    expect(request).toHaveBeenCalledTimes(2);
  });
});
