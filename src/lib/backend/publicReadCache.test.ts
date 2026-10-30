import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_FRESH_SECONDS,
  DEFAULT_STALE_SECONDS,
  publicReadKey,
  purgePublicReadCache,
  readThroughPublicCache,
  __resetPublicReadCache,
  type HeldReadEntry,
  type HeldReadStore,
} from './publicReadCache';

/** A store with a counter, so a test can see how often a read was written. */
class FakeStore implements HeldReadStore {
  readonly entries = new Map<string, HeldReadEntry>();
  puts = 0;
  failGet = false;

  async get(key: string): Promise<HeldReadEntry | null> {
    if (this.failGet) throw new Error('the store is unavailable');
    return this.entries.get(key) ?? null;
  }

  async put(key: string, entry: HeldReadEntry): Promise<void> {
    this.puts += 1;
    this.entries.set(key, entry);
  }
}

/** One shared clock, so a window can be crossed without waiting for it. */
let now = 1_700_000_000_000;
const clock = () => now;
const advance = (seconds: number) => {
  now += seconds * 1000;
};

beforeEach(() => {
  now = 1_700_000_000_000;
  __resetPublicReadCache();
});

describe('readThroughPublicCache', () => {
  it('answers a repeat read inside the fresh window without touching the origin', async () => {
    const store = new FakeStore();
    const load = vi.fn(async () => ({ products: ['salt'] }));

    const first = await readThroughPublicCache({ key: 'k', load, cacheable: () => true, store, now: clock });
    advance(DEFAULT_FRESH_SECONDS - 1);
    const second = await readThroughPublicCache({ key: 'k', load, cacheable: () => true, store, now: clock });

    expect(first).toEqual(second);
    expect(load).toHaveBeenCalledTimes(1);
    expect(store.puts).toBe(1);
  });

  it('serves a stale read immediately and refreshes it behind the response', async () => {
    const store = new FakeStore();
    let revision = 1;
    const load = vi.fn(async () => ({ revision }));

    await readThroughPublicCache({ key: 'k', load, cacheable: () => true, store, now: clock });
    revision = 2;
    advance(DEFAULT_FRESH_SECONDS + 1);

    const background: Promise<unknown>[] = [];
    const stale = await readThroughPublicCache({
      key: 'k',
      load,
      cacheable: () => true,
      store,
      now: clock,
      background: (work) => background.push(work),
    });

    // The stale copy is what the shopper gets, and the refresh runs behind it.
    expect(stale).toEqual({ revision: 1 });
    expect(background).toHaveLength(1);

    await background[0];
    expect(load).toHaveBeenCalledTimes(2);

    // The refreshed copy is what the next fresh read sees.
    advance(1);
    const refreshed = await readThroughPublicCache({ key: 'k', load, cacheable: () => true, store, now: clock });
    expect(refreshed).toEqual({ revision: 2 });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('reads synchronously once both windows have passed', async () => {
    const store = new FakeStore();
    let revision = 1;
    const load = vi.fn(async () => ({ revision }));

    await readThroughPublicCache({ key: 'k', load, cacheable: () => true, store, now: clock });
    revision = 2;
    advance(DEFAULT_FRESH_SECONDS + DEFAULT_STALE_SECONDS + 1);

    const background: Promise<unknown>[] = [];
    const value = await readThroughPublicCache({
      key: 'k',
      load,
      cacheable: () => true,
      store,
      now: clock,
      background: (work) => background.push(work),
    });

    expect(value).toEqual({ revision: 2 });
    expect(background).toHaveLength(0);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('never stores an answer the caller marked uncacheable', async () => {
    const store = new FakeStore();
    const load = vi.fn(async () => ({ degraded: true }));

    await readThroughPublicCache({ key: 'k', load, cacheable: (value) => !value.degraded, store, now: clock });
    await readThroughPublicCache({ key: 'k', load, cacheable: (value) => !value.degraded, store, now: clock });

    expect(store.puts).toBe(0);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('coalesces concurrent identical reads into one origin call', async () => {
    const store = new FakeStore();
    // The gate is created before either caller runs, so the read cannot be resolved
    // before the load it is standing in for has actually started.
    let openGate: (value: string) => void = () => {};
    const gate = new Promise<string>((resolve) => {
      openGate = resolve;
    });
    const load = vi.fn(() => gate);

    const first = readThroughPublicCache({ key: 'k', load, cacheable: () => true, store, now: clock });
    const second = readThroughPublicCache({ key: 'k', load, cacheable: () => true, store, now: clock });

    openGate('done');

    expect(await first).toBe('done');
    expect(await second).toBe('done');
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('keeps two different reads apart', async () => {
    const store = new FakeStore();
    const load = vi.fn(async (value: string) => ({ value }));

    const liveStock = await readThroughPublicCache({
      key: publicReadKey('catalog', { kind: 'list', category: 'live-stock' }),
      load: () => load('live-stock'),
      cacheable: () => true,
      store,
      now: clock,
    });
    const edible = await readThroughPublicCache({
      key: publicReadKey('catalog', { kind: 'list', category: 'edible-pink-salt' }),
      load: () => load('edible-pink-salt'),
      cacheable: () => true,
      store,
      now: clock,
    });

    expect(liveStock).toEqual({ value: 'live-stock' });
    expect(edible).toEqual({ value: 'edible-pink-salt' });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('still answers when the store itself is unavailable', async () => {
    const store = new FakeStore();
    store.failGet = true;
    const load = vi.fn(async () => 'value');

    await expect(
      readThroughPublicCache({ key: 'k', load, cacheable: () => true, store, now: clock })
    ).resolves.toBe('value');
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('treats an unreadable stored entry as a miss', async () => {
    const store = new FakeStore();
    store.entries.set('k', { storedAt: 0, value: undefined });
    const load = vi.fn(async () => 'fresh');

    // A stored read with no usable timestamp cannot be judged fresh or stale.
    store.entries.set('k', { storedAt: Number.NaN, value: 'corrupt' } as unknown as HeldReadEntry);

    await expect(
      readThroughPublicCache({ key: 'k', load, cacheable: () => true, store, now: clock })
    ).resolves.toBe('fresh');
    expect(load).toHaveBeenCalledTimes(1);
  });
});

describe('purgePublicReadCache', () => {
  it('makes the next read reach the origin again, so a saved price is not hidden', async () => {
    const store = new FakeStore();
    let revision = 'old';
    const load = vi.fn(async () => ({ revision }));

    await readThroughPublicCache({ key: 'k', load, cacheable: () => true, store, now: clock });

    revision = 'new';
    await purgePublicReadCache(store);

    const afterPurge = await readThroughPublicCache({ key: 'k', load, cacheable: () => true, store, now: clock });

    expect(afterPurge).toEqual({ revision: 'new' });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('leaves nothing behind that a later read could still be served from', async () => {
    const store = new FakeStore();
    let revision = 1;
    const load = vi.fn(async () => ({ revision }));

    await readThroughPublicCache({ key: 'k', load, cacheable: () => true, store, now: clock });
    await purgePublicReadCache(store);
    revision = 2;

    // Two reads after the purge both see the new value, not the pre-purge one.
    const first = await readThroughPublicCache({ key: 'k', load, cacheable: () => true, store, now: clock });
    const second = await readThroughPublicCache({ key: 'k', load, cacheable: () => true, store, now: clock });

    expect(first).toEqual({ revision: 2 });
    expect(second).toEqual({ revision: 2 });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('keeps two categories independent across a purge, rather than emptying both', async () => {
    const store = new FakeStore();
    const load = vi.fn(async (value: string) => ({ value }));

    await readThroughPublicCache({ key: 'live', load: () => load('live-stock'), cacheable: () => true, store, now: clock });
    await purgePublicReadCache(store);
    await readThroughPublicCache({ key: 'edible', load: () => load('edible-pink-salt'), cacheable: () => true, store, now: clock });
    await readThroughPublicCache({ key: 'edible', load: () => load('edible-pink-salt'), cacheable: () => true, store, now: clock });

    // One read each: the purged key was re-read, and the new key was cached.
    expect(load.mock.calls.map(([value]) => value)).toEqual(['live-stock', 'edible-pink-salt']);
  });
});

describe('publicReadKey', () => {
  it('names absent values so a key cannot shift when an argument is omitted', () => {
    expect(publicReadKey('catalog', { kind: 'list', category: undefined })).toBe('catalog?category=-&kind=list');
  });

  it('is insensitive to the order the caller names the facts in', () => {
    expect(publicReadKey('catalog', { page: 1, perPage: 24 })).toBe(publicReadKey('catalog', { perPage: 24, page: 1 }));
  });

  it('separates two categories', () => {
    expect(publicReadKey('catalog', { kind: 'list', category: 'live-stock' })).not.toBe(
      publicReadKey('catalog', { kind: 'list', category: 'licks-blocks' })
    );
  });
});
