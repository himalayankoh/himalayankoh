import { describe, expect, it } from 'vitest';
import { readCasePolicy, quantityProblem, casePolicyProblem } from './casePolicy';

describe('wholesale full-case minimums', () => {
  const product = (pack: number, floor = 0) => ({ name: 'Salt', moq: 0, casePolicy: readCasePolicy({ wholesaleCases: { unitsPerCase: pack, minimumCases: 4, minimumPieces: floor } }) });
  it('requires 24 pieces for four 2 lb cases and 16 for four 6 lb cases', () => {
    expect(product(6).casePolicy?.minimumUnits).toBe(24);
    expect(product(4).casePolicy?.minimumUnits).toBe(16);
    expect(quantityProblem(product(6), 18)).toMatch(/24 pieces/);
    expect(quantityProblem(product(4), 12)).toMatch(/16 pieces/);
    expect(quantityProblem(product(6), 24)).toBeNull();
    expect(quantityProblem(product(4), 16)).toBeNull();
  });
  it('rejects partial cases even above the minimum', () => {
    expect(quantityProblem(product(6), 25)).toMatch(/full cases of 6/);
    expect(quantityProblem(product(4), 17)).toMatch(/full cases of 4/);
  });
  it('can also require a piece floor, rounded up to complete cases', () => {
    expect(product(4, 20).casePolicy?.minimumUnits).toBe(20);
    expect(product(3, 20).casePolicy?.minimumUnits).toBe(21);
    expect(quantityProblem(product(4, 20), 16)).toMatch(/20 pieces/);
  });
  it('never derives a verified trade case from a generic shipping default', () => {
    expect(readCasePolicy({ cartonQty: 12 })).toBeNull();
    expect(quantityProblem(product(0), 100)).toMatch(/needs confirmation/);
  });
  it('validates the saved policy without inventing a case size', () => {
    expect(casePolicyProblem({ wholesaleCases: { unitsPerCase: null, minimumCases: 4, minimumPieces: 0 } })).toBeNull();
    expect(casePolicyProblem({ wholesaleCases: { unitsPerCase: 6, minimumCases: 3, minimumPieces: 0 } })).toMatch(/four/);
    expect(casePolicyProblem({ wholesaleCases: { unitsPerCase: 1.5, minimumCases: 4, minimumPieces: 0 } })).toMatch(/whole/);
  });
  it('retains stricter owner MOQs and cannot reduce the four-case floor', () => {
    expect(readCasePolicy({ wholesaleCases: { unitsPerCase: 6, minimumCases: 1 } })?.minimumUnits).toBe(24);
    expect(quantityProblem({ ...product(6), moq: 30 }, 24)).toMatch(/30 pieces/);
  });
});
