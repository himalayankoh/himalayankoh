import { describe, expect, it, vi } from 'vitest';

import { singleFlight } from './singleFlight';

/** `run`s that resolve when this test says so, so overlap is explicit. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('singleFlight', () => {
  it('runs one call for concurrent callers and hands them the same result', async () => {
    const share = singleFlight<string>();
    const gate = deferred<string>();
    const run = vi.fn(() => gate.promise);

    const first = share(run);
    const second = share(run);

    expect(run).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);

    gate.resolve('catalog');
    await expect(first).resolves.toBe('catalog');
    await expect(second).resolves.toBe('catalog');
  });

  it('reads again once the previous call has settled', async () => {
    const share = singleFlight<number>();
    const run = vi.fn(async () => 1);

    await share(run);
    await share(run);

    // Not a cache: the second call is a second read, so a reload after a save
    // cannot render a list that predates the save.
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('clears the holder when the call fails, so a retry is not stuck with the failure', async () => {
    const share = singleFlight<string>();
    const failing = deferred<string>();
    const run = vi.fn(() => failing.promise);

    const first = share(run);
    failing.reject(new Error('catalog unavailable'));
    await expect(first).rejects.toThrow('catalog unavailable');

    const retry = vi.fn(async () => 'recovered');
    await expect(share(retry)).resolves.toBe('recovered');
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('shares a rejection between concurrent callers rather than rethrowing per caller', async () => {
    const share = singleFlight<string>();
    const gate = deferred<string>();
    const run = vi.fn(() => gate.promise);

    const first = share(run);
    const second = share(run);
    gate.reject(new Error('nope'));

    await expect(first).rejects.toThrow('nope');
    await expect(second).rejects.toThrow('nope');
    expect(run).toHaveBeenCalledTimes(1);
  });
});
