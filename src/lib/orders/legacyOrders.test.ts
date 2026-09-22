import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * The legacy adapter's promises now that it reads a file instead of a database:
 *
 *   1. It never writes and never opens a network connection. A static archive is
 *      the whole point — the application no longer depends on Supabase to show
 *      fourteen historical orders.
 *   2. It never shows one shopper another shopper's order.
 *   3. A deployment with no archive answers "nothing here", not an error.
 *
 * The old version of this file asserted that a non-UUID id never reached Postgres.
 * That concern is gone with Postgres: a lookup is an array scan, so no id can be
 * "invalid" — which is why the guard it pinned no longer exists.
 */

const ORDER_ID = '5f0c2f8e-1a2b-4c3d-8e4f-5a6b7c8d9e0f';

let dir = '';

function installArchive(orders: Record<string, unknown>[]): void {
  dir = mkdtempSync(join(tmpdir(), 'hk-legacy-'));
  const path = join(dir, 'legacy-orders.archive.json');
  writeFileSync(path, JSON.stringify({ exportedAt: '2026-09-22T00:00:00.000Z', orders }));
  process.env.HK_LEGACY_ORDERS_ARCHIVE = path;
}

async function loadModule() {
  const mod = await import('./legacyOrders');
  mod.__resetLegacyArchiveForTests();
  return mod;
}

beforeEach(() => {
  delete process.env.HK_LEGACY_ORDERS_ARCHIVE;
});

afterEach(() => {
  delete process.env.HK_LEGACY_ORDERS_ARCHIVE;
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = '';
});

describe('an archive-free deployment', () => {
  it('reports no legacy store rather than reaching for one', async () => {
    process.env.HK_LEGACY_ORDERS_ARCHIVE = join(tmpdir(), 'hk-legacy-absent', 'nope.json');
    const { isLegacyOrderStoreAvailable, getLegacyOrderForViewer } = await loadModule();

    expect(isLegacyOrderStoreAvailable()).toBe(false);
    await expect(getLegacyOrderForViewer(ORDER_ID, null)).resolves.toBeNull();
  });
});

describe('getLegacyOrderForViewer', () => {
  it('answers an unknown id without inventing an order', async () => {
    installArchive([{ id: ORDER_ID, user_id: null, email: 'a@b.com', order_number: 'HK-1' }]);
    const { getLegacyOrderForViewer } = await loadModule();

    await expect(getLegacyOrderForViewer('999999', null)).resolves.toBeNull();
  });

  it('shows a guest only an ownerless legacy order', async () => {
    installArchive([{ id: ORDER_ID, user_id: 'some-user', email: 'a@b.com', order_number: 'HK-1' }]);
    const { getLegacyOrderForViewer } = await loadModule();

    await expect(getLegacyOrderForViewer(ORDER_ID, null)).resolves.toBeNull();
  });

  it('matches a signed-in shopper by the email the legacy row recorded', async () => {
    installArchive([
      { id: ORDER_ID, user_id: 'old-supabase-id', email: 'Shopper@Example.com', order_number: 'HK-1', order_items: [] },
    ]);
    const { getLegacyOrderForViewer } = await loadModule();

    const result = await getLegacyOrderForViewer(ORDER_ID, 'shopper@example.com');

    expect(result).not.toBeNull();
    expect(result?.order_items).toEqual([]);
  });

  it('does not show a signed-in shopper somebody else’s legacy order', async () => {
    installArchive([
      { id: ORDER_ID, user_id: 'old-supabase-id', email: 'other@example.com', order_number: 'HK-1' },
    ]);
    const { getLegacyOrderForViewer } = await loadModule();

    await expect(getLegacyOrderForViewer(ORDER_ID, 'shopper@example.com')).resolves.toBeNull();
  });

  it('finds an order by its human order number as well as its id', async () => {
    installArchive([{ id: ORDER_ID, user_id: null, email: 'a@b.com', order_number: 'HK-1042' }]);
    const { getLegacyOrderByNumberForViewer } = await loadModule();

    const result = await getLegacyOrderByNumberForViewer('HK-1042', null);

    expect(result?.id).toBe(ORDER_ID);
  });
});

describe('listLegacyOrders', () => {
  it('filters by status and searches number and email, newest first', async () => {
    installArchive([
      { id: 'a', order_number: 'HK-1', email: 'one@example.com', status: 'pending', created_at: '2026-07-01T00:00:00Z' },
      { id: 'b', order_number: 'HK-2', email: 'two@example.com', status: 'shipped', created_at: '2026-08-01T00:00:00Z' },
    ]);
    const { listLegacyOrders } = await loadModule();

    const shipped = await listLegacyOrders({ status: 'shipped' });
    expect(shipped.count).toBe(1);
    expect(shipped.orders[0].order_number).toBe('HK-2');

    const byEmail = await listLegacyOrders({ search: 'one@' });
    expect(byEmail.orders.map((o) => o.order_number)).toEqual(['HK-1']);

    const all = await listLegacyOrders();
    expect(all.orders.map((o) => o.order_number)).toEqual(['HK-2', 'HK-1']);
  });

  it('pages, and never reports fewer pages than one', async () => {
    installArchive([
      { id: 'a', order_number: 'HK-1', created_at: '2026-07-01T00:00:00Z' },
      { id: 'b', order_number: 'HK-2', created_at: '2026-07-02T00:00:00Z' },
      { id: 'c', order_number: 'HK-3', created_at: '2026-07-03T00:00:00Z' },
    ]);
    const { listLegacyOrders } = await loadModule();

    const first = await listLegacyOrders({ page: 1, limit: 2 });
    expect(first.orders.map((o) => o.order_number)).toEqual(['HK-3', 'HK-2']);
    expect(first.count).toBe(3);
    expect(first.totalPages).toBe(2);

    const beyond = await listLegacyOrders({ page: 9, limit: 2 });
    expect(beyond.orders).toEqual([]);
    expect(beyond.totalPages).toBe(2);
  });
});
