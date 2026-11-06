import { describe, expect, it, beforeEach } from 'vitest';
import {
  getCachedAdminProducts,
  setCachedAdminProducts,
  invalidateCachedAdminProducts,
} from './adminProductsCache';

describe('adminProductsCache (server-side in-memory cache)', () => {
  beforeEach(() => {
    invalidateCachedAdminProducts();
  });

  it('starts empty', () => {
    expect(getCachedAdminProducts()).toBeNull();
  });

  it('stores and retrieves cached products', () => {
    const mockList = [{ id: 1, name: 'Himalayan Salt 5lb' }];
    setCachedAdminProducts(mockList);

    const cached = getCachedAdminProducts();
    expect(cached).toEqual(mockList);
  });

  it('invalidates cached products', () => {
    setCachedAdminProducts([{ id: 2, name: 'Salt Lamp' }]);
    expect(getCachedAdminProducts()).not.toBeNull();

    invalidateCachedAdminProducts();
    expect(getCachedAdminProducts()).toBeNull();
  });
});
