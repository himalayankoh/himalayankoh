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

  it('correctly calculates total boxes and line total for standard wholesale inquiry', () => {
    const units = 24;
    const unitsPerCase = 6;
    const unitPrice = 9.07;

    const boxes = boxCount(units, unitsPerCase);
    const boxPrice = pricePerBox(unitPrice, unitsPerCase);
    const lineTotal = boxes * boxPrice;

    expect(boxes).toBe(4);
    expect(boxPrice).toBe(54.42);
    expect(lineTotal).toBe(217.68);
  });

  it('correctly resolves packaging from wholesale product definition when line packaging is missing', () => {
    const productPackaging = {
      wholesaleCases: {
        unitsPerCase: 6,
        minimumCases: 4,
        minimumPieces: 0,
      },
    };

    const policy = readCasePolicy(productPackaging);
    expect(policy).not.toBeNull();
    expect(policy?.unitsPerCase).toBe(6);
    expect(policy?.minimumCases).toBe(4);
    expect(policy?.minimumUnits).toBe(24);
  });

  it('handles 30 lb rock salt single-piece case packaging', () => {
    const unitPrice = 34.97;
    const unitsPerCase = 1;
    const boxesOrdered = 4;

    const boxPrice = pricePerBox(unitPrice, unitsPerCase);
    expect(boxPrice).toBe(34.97);

    const total = boxesOrdered * boxPrice;
    expect(total).toBe(139.88);
  });
});
