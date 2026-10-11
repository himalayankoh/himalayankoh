import { wordpressRequest } from '../backend/wordpress';
import type { AdminProductPatch, AdminProductRecord } from './productPayload';

export interface StoreMeasurements { weight: string; dimension: string }
const poundsPerUnit: Record<string, number> = { kg: 1 / 0.45359237, g: 1 / 453.59237, lbs: 1, lb: 1, oz: 1 / 16 };
const inchesPerUnit: Record<string, number> = { cm: 1 / 2.54, mm: 1 / 25.4, m: 1 / 0.0254, in: 1, yd: 36 };
let cached: { units: StoreMeasurements; expires: number } | undefined;
let pending: Promise<StoreMeasurements> | undefined;

/** Admin DTOs use lb/in; raw Woo products use the store's configured units. */
export async function readStoreMeasurements(): Promise<StoreMeasurements> {
  if (cached && cached.expires > Date.now()) return cached.units;
  if (pending) return pending;
  pending = wordpressRequest<Array<{ id: string; value: unknown }>>('/wc/v3/settings/products', {
    useCredentials: true, timeoutMs: 15000,
  }).then(settings => {
    const units = {
      weight: String(settings.find(s => s.id === 'woocommerce_weight_unit')?.value ?? '').toLowerCase(),
      dimension: String(settings.find(s => s.id === 'woocommerce_dimension_unit')?.value ?? '').toLowerCase(),
    };
    if (!poundsPerUnit[units.weight] || !inchesPerUnit[units.dimension]) {
      throw new Error('WooCommerce measurement units could not be verified. Product measurements were not saved.');
    }
    cached = { units, expires: Date.now() + 300000 };
    return units;
  }).finally(() => { pending = undefined; });
  return pending;
}

function convert(value: number | null | undefined, factor: number, precision = 1000000): number | null | undefined {
  return typeof value === 'number' ? Math.round(value * factor * precision) / precision : value;
}

export function measurementsForAdmin(record: AdminProductRecord, units: StoreMeasurements): AdminProductRecord {
  return {
    ...record,
    weight: convert(record.weight, poundsPerUnit[units.weight], 10000) ?? null,
    dimensions: {
      length: convert(record.dimensions.length, inchesPerUnit[units.dimension], 10000) ?? null,
      width: convert(record.dimensions.width, inchesPerUnit[units.dimension], 10000) ?? null,
      height: convert(record.dimensions.height, inchesPerUnit[units.dimension], 10000) ?? null,
    },
  };
}

export function measurementsForWoo(patch: AdminProductPatch, units: StoreMeasurements): AdminProductPatch {
  return {
    ...patch,
    ...(patch.weight !== undefined ? { weight: convert(patch.weight, 1 / poundsPerUnit[units.weight]) } : {}),
    ...(patch.dimensions !== undefined ? { dimensions: Object.fromEntries(
      Object.entries(patch.dimensions).map(([key, value]) => [key, convert(value, 1 / inchesPerUnit[units.dimension])]),
    ) } : {}),
  };
}
