/** Explicit trade cases. Shipping defaults never establish a wholesale case pack. */
export interface WholesaleCasePolicy {
  unitsPerCase: number | null;
  minimumCases: number;
  minimumPieces: number;
  minimumUnits: number | null;
}

export function packagingObject(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') {
    try { return packagingObject(JSON.parse(value)); } catch { return {}; }
  }
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function whole(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 0 ? n : fallback;
}

export function readCasePolicy(packaging: unknown): WholesaleCasePolicy | null {
  const raw = packagingObject(packaging).wholesaleCases;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const pack = whole(row.unitsPerCase, 0);
  const minimumCases = Math.max(4, whole(row.minimumCases, 4));
  const minimumPieces = whole(row.minimumPieces, 0);
  return {
    unitsPerCase: pack > 0 ? pack : null,
    minimumCases,
    minimumPieces,
    minimumUnits: pack > 0 ? Math.ceil(Math.max(minimumCases * pack, minimumPieces) / pack) * pack : null,
  };
}

export function casePolicyProblem(packaging: unknown): string | null {
  const raw = packagingObject(packaging).wholesaleCases;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return 'Configure the wholesale case policy.';
  const row = raw as Record<string, unknown>;
  if (row.unitsPerCase !== null && (!Number.isSafeInteger(row.unitsPerCase) || Number(row.unitsPerCase) <= 0)) return 'Pieces per case must be a positive whole number, or empty while unconfirmed.';
  if (!Number.isSafeInteger(row.minimumCases) || Number(row.minimumCases) < 4) return 'Wholesale requires at least four full cases.';
  if (!Number.isSafeInteger(row.minimumPieces) || Number(row.minimumPieces) < 0) return 'The optional piece minimum must be a whole number of zero or more.';
  const policy = readCasePolicy(packaging);
  if (policy?.minimumUnits !== null && !Number.isSafeInteger(policy?.minimumUnits)) return 'The resulting minimum is too large.';
  return null;
}

export function quantityProblem(product: { name: string; moq: number; casePolicy?: WholesaleCasePolicy | null }, units: number): string | null {
  const policy = product.casePolicy;
  if (policy && !policy.unitsPerCase) return `${product.name}: the wholesale case pack needs confirmation before ordering.`;
  const minimum = Math.max(product.moq || 0, policy?.minimumUnits || 0);
  if (units < minimum) return `${product.name}: wholesale requires at least ${policy ? `${policy.minimumCases} full cases / ${minimum} pieces` : `${minimum} pieces`}.`;
  if (policy?.unitsPerCase && units % policy.unitsPerCase !== 0) return `${product.name}: order full cases of ${policy.unitsPerCase} pieces.`;
  return null;
}
