import { describe, expect, it } from 'vitest';
import { readCasePolicy } from '@/lib/wholesale/casePolicy';
import { boxCount, pricePerBox } from '@/lib/wholesale/boxes';

describe('Wholesale Inquiry Case Pack & Box Calculations', () => {
  it('correctly calculates box price from unit price and unitsPerCase', () => {
    const unitPrice = 9.07;
    const unitsPerCase = 6;
    const boxPrice = pricePerBox(unitPrice, unitsPerCase);
    expect(boxPrice).toBe(54.42);
  });

  it('correctly calculates 2 lb lick salt box (6 pcs @ $9.07 = $54.42 / box, 12 lbs)', () => {
    const unitsPerCase = 6;
    const unitPrice = 9.07;
    const unitWeight = 2;

    const boxPrice = pricePerBox(unitPrice, unitsPerCase);
    const boxWeight = unitsPerCase * unitWeight;

    expect(boxPrice).toBe(54.42);
    expect(boxWeight).toBe(12);
  });

  it('correctly calculates 6 lb lick salt box (4 pcs @ $13.97 = $55.88 / box, 24 lbs)', () => {
    const unitsPerCase = 4;
    const unitPrice = 13.97;
    const unitWeight = 6;

    const boxPrice = pricePerBox(unitPrice, unitsPerCase);
    const boxWeight = unitsPerCase * unitWeight;

    expect(boxPrice).toBe(55.88);
    expect(boxWeight).toBe(24);
  });

  it('correctly calculates 30 lb cattle block (1 pc @ $34.97 = $34.97 / box, 30 lbs)', () => {
    const unitsPerCase = 1;
    const unitPrice = 34.97;
    const unitWeight = 30;

    const boxPrice = pricePerBox(unitPrice, unitsPerCase);
    const boxWeight = unitsPerCase * unitWeight;

    expect(boxPrice).toBe(34.97);
    expect(boxWeight).toBe(30);
  });

  it('disambiguates 2 lb and 6 lb variations under the same WooCommerce product #2543', () => {
    const products = [
      {
        id: 31,
        name: 'Himalayan Pink Salt Licks for Horses 2 lbs - Himalayan Koh - 2 lb',
        wholesale_sku: 'HK-LFH-2lbs',
        woo_product_id: 2543,
        woo_variation_id: 2560,
        packaging: { wholesaleCases: { unitsPerCase: 6, minimumCases: 4, minimumPieces: 0 } },
      },
      {
        id: 30,
        name: 'Himalayan Pink Salt Licks for Horses 2 lbs - Himalayan Koh - 6 lb',
        wholesale_sku: 'HK-LFH-6lbs',
        woo_product_id: 2543,
        woo_variation_id: 2561,
        packaging: { wholesaleCases: { unitsPerCase: 4, minimumCases: 4, minimumPieces: 0 } },
      },
    ];

    const matchProduct = (line: { productId?: string; wholesaleSku?: string; wooVariationId?: number; wooProductId?: number }) => {
      const lineProdId = Number(line.productId || 0);
      const lineSku = String(line.wholesaleSku || '').trim().toLowerCase();
      const lineVarId = Number(line.wooVariationId || 0);
      const lineWooId = Number(line.wooProductId || 0);

      let found = lineProdId > 0 ? products.find((p) => Number(p.id) === lineProdId) : null;
      if (!found && lineSku) found = products.find((p) => p.wholesale_sku.toLowerCase() === lineSku) || null;
      if (!found && lineVarId > 0) found = products.find((p) => p.woo_variation_id === lineVarId) || null;
      if (!found && lineWooId > 0) found = products.find((p) => p.woo_product_id === lineWooId && !p.woo_variation_id) || null;
      return found;
    };

    const match2lb = matchProduct({ productId: '31', wholesaleSku: 'HK-LFH-2lbs', wooVariationId: 2560, wooProductId: 2543 });
    const match6lb = matchProduct({ productId: '30', wholesaleSku: 'HK-LFH-6lbs', wooVariationId: 2561, wooProductId: 2543 });

    expect(match2lb?.id).toBe(31);
    expect(readCasePolicy(match2lb?.packaging)?.unitsPerCase).toBe(6);

    expect(match6lb?.id).toBe(30);
    expect(readCasePolicy(match6lb?.packaging)?.unitsPerCase).toBe(4);
  });
});
