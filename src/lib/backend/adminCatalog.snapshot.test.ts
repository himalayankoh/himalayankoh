import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ published: vi.fn(), all: vi.fn() }));
vi.mock('./products', () => ({ readCatalogProducts: mocks.published }));
vi.mock('../woo/productWrite', () => ({ listWooProducts: mocks.all }));
import { readAdminCatalogWithStats } from './adminCatalog';
beforeEach(() => {
  vi.clearAllMocks();
  mocks.published.mockResolvedValue({ products: [{ id: 1, slug: 'pink-salt', name: 'Himalayan Pink Salt', price: '$12.00', priceMin: 12, category: 'Edible', inStock: true, stockStatus: 'in_stock', missing: [] }], warnings: [], degraded: false });
  mocks.all.mockResolvedValue([]);
});
describe('request-local admin catalogue snapshot', () => {
  it('reads each source once for rows and totals, then reads fresh on the next request', async () => {
    const result = await readAdminCatalogWithStats({ perPage: 100 });
    expect(result.page.count).toBe(1);
    expect(result.stats.total).toBe(1);
    expect(mocks.published).toHaveBeenCalledTimes(1);
    expect(mocks.all).toHaveBeenCalledTimes(1);
    await readAdminCatalogWithStats();
    expect(mocks.published).toHaveBeenCalledTimes(2);
    expect(mocks.all).toHaveBeenCalledTimes(2);
  });
  it('keeps global totals independent from a filtered product query', async () => {
    await readAdminCatalogWithStats({ search: 'lick' });
    expect(mocks.published).toHaveBeenCalledWith(expect.objectContaining({ search: 'lick' }));
    expect(mocks.published).toHaveBeenCalledWith({ perPage: 100 });
    expect(mocks.published).toHaveBeenCalledTimes(2);
  });
});
