import { describe, expect, it, vi } from 'vitest';
import {
  CATALOG_TTL_MS,
  invalidateSharedReads,
  readShared,
  sharedReadKeys,
} from './readCache';

describe('shared catalog read cache', () => {
  it('shares one in-flight read between concurrent callers', async () => {
    invalidateSharedReads();
    let calls = 0;
    const read = () => {
      calls += 1;
      return new Promise<string>((resolve) => setTimeout(() => resolve('catalog'), 5));
    };

    const [a, b] = await Promise.all([readShared('k', read), readShared('k', read)]);

    expect(calls).toBe(1);
    expect(a).toBe('catalog');
    expect(b).toBe('catalog');
  });

  it('reuses a completed read inside the TTL window and reads again after it', async () => {
    invalidateSharedReads();
    let calls = 0;
    const read = () => Promise.resolve(++calls);
    const now = vi.spyOn(Date, 'now');

    now.mockReturnValue(1_000);
    expect(await readShared('k', read)).toBe(1);
    now.mockReturnValue(1_000 + CATALOG_TTL_MS - 1);
    expect(await readShared('k', read)).toBe(1);

    now.mockReturnValue(1_000 + CATALOG_TTL_MS);
    expect(await readShared('k', read)).toBe(2);

    now.mockRestore();
  });

  it('keys reads separately per query', async () => {
    invalidateSharedReads();
    let calls = 0;
    const read = () => Promise.resolve(++calls);

    await readShared('a', read);
    await readShared('b', read);

    expect(calls).toBe(2);
    expect(sharedReadKeys().sort()).toEqual(['a', 'b']);
  });

  it('evicts a rejected read so a transient failure is not cached', async () => {
    invalidateSharedReads();
    let calls = 0;
    const read = () => {
      calls += 1;
      if (calls === 1) return Promise.reject(new Error('upstream down'));
      return Promise.resolve('recovered');
    };

    await expect(readShared('k', read)).rejects.toThrow('upstream down');
    expect(await readShared('k', read)).toBe('recovered');
    expect(calls).toBe(2);
  });

  it('never caches a read the caller can abort', async () => {
    invalidateSharedReads();
    let calls = 0;
    const read = () => Promise.resolve(++calls);

    await readShared('k', read, { noStore: true });
    await readShared('k', read, { noStore: true });

    expect(calls).toBe(2);
    expect(sharedReadKeys()).toEqual([]);
  });

  it('drops everything on invalidation', async () => {
    invalidateSharedReads();
    let calls = 0;
    const read = () => Promise.resolve(++calls);

    expect(await readShared('k', read)).toBe(1);
    invalidateSharedReads();
    expect(await readShared('k', read)).toBe(2);
  });
});
