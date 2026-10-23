import { describe, expect, it } from 'vitest';
import type { AdminProductRecord } from '@/lib/woo/productPayload';
import { wholesaleStockTarget } from './stockTarget';
const parent = { id: 2543, sku: 'PARENT', manageStock: true, stockQuantity: 10 } as AdminProductRecord;
describe('wholesale stock editor addresses genuine inventory', () => {
  it('writes a stock-managed variation without changing the parent pool', () => {
    expect(wholesaleStockTarget(parent, [{ id: 2561, sku: 'SIX', manage_stock: true, stock_quantity: 8 }], 2561, 'SIX')).toEqual({ parentId: 2543, variationId: 2561, quantity: 8, sku: 'SIX' });
  });
  it('keeps parent-managed stock on the parent instead of creating independent child stock', () => {
    expect(wholesaleStockTarget(parent, [{ id: 2561, sku: 'SIX', manage_stock: false }], 2561, 'SIX').variationId).toBe(0);
  });
  it('refuses a missing variation or mismatched SKU', () => {
    expect(() => wholesaleStockTarget(parent, [], 2561, 'SIX')).toThrow(/variation/);
    expect(() => wholesaleStockTarget(parent, [{ id: 2561, sku: 'TWO' }], 2561, 'SIX')).toThrow(/SKU/);
  });
  it('does not guess stock when tracking or a real count is unavailable', () => {
    expect(() => wholesaleStockTarget({ ...parent, manageStock: false }, [], 0, 'PARENT')).toThrow(/not configured/);
    expect(() => wholesaleStockTarget({ ...parent, stockQuantity: null }, [], 0, 'PARENT')).toThrow(/not configured/);
  });
});
