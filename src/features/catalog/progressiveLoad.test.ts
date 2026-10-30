import { describe, expect, it, vi } from 'vitest';
import { loadCatalogProgressively } from './progressiveLoad';

describe('progressive catalog loading', () => {
  it('displays products while optional filters and offers are still pending', async () => {
    let finishCategories!: (value: string[]) => void;
    const categories = new Promise<string[]>(resolve => { finishCategories = resolve; });
    const onCategories = vi.fn();
    const onOffers = vi.fn();
    const result = await loadCatalogProgressively({ products: async () => ['product'],
      categories: () => categories, offers: () => new Promise<string[]>(() => {}), onCategories, onOffers });
    expect(result).toEqual(['product']);
    expect(onCategories).not.toHaveBeenCalled();
    expect(onOffers).not.toHaveBeenCalled();
    finishCategories(['category']);
    await Promise.resolve();
    expect(onCategories).toHaveBeenCalledWith(['category']);
  });
  it('handles optional failures without swallowing a genuine product failure', async () => {
    const onCategories = vi.fn();
    const onOffers = vi.fn();
    await expect(loadCatalogProgressively({ products: async () => { throw Error('origin unavailable'); },
      categories: async () => { throw Error('category timeout'); },
      offers: async () => { throw Error('offer timeout'); }, onCategories, onOffers }))
      .rejects.toThrow('origin unavailable');
    expect(onCategories).toHaveBeenCalledWith(null);
    expect(onOffers).toHaveBeenCalledWith(null);
  });
});
