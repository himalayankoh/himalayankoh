/**
 * The packaging fields the owner fills in, in the order the factory sheet lists them.
 *
 * This is the single source of truth for the form, the save/read-back loops and the
 * readiness worklist. It lives in a plain `.ts` module rather than beside the panel so
 * a unit test can import it (a vitest test that imports a `.tsx` module fails to parse).
 */

export interface PackagingField {
  key: string;
  label: string;
  hint?: string;
}

export const PACKAGING_FIELDS: readonly PackagingField[] = [
  { key: 'cartonQty', label: 'Units per carton' },
  { key: 'packagedUnitWeightKg', label: 'Packaged unit weight (kg)' },
  { key: 'cartonLengthCm', label: 'Carton length (cm)' },
  { key: 'cartonWidthCm', label: 'Carton width (cm)' },
  { key: 'cartonHeightCm', label: 'Carton height (cm)' },
  { key: 'cartonGrossWeightKg', label: 'Carton gross weight (kg)' },
  { key: 'palletLengthCm', label: 'Pallet length (cm)' },
  { key: 'palletWidthCm', label: 'Pallet width (cm)' },
  { key: 'maxStackHeightCm', label: 'Max stack height (cm)', hint: 'Including the pallet deck.' },
  { key: 'palletDeckHeightCm', label: 'Pallet deck height (cm)' },
  { key: 'palletTareKg', label: 'Pallet tare weight (kg)' },
  { key: 'maxPalletGrossWeightKg', label: 'Max pallet gross weight (kg)', hint: 'Optional. Leave empty when unknown — an empty box is not a ceiling of zero.' },
  { key: 'cartonsPerLayer', label: 'Cartons per layer', hint: 'Optional override; leave empty to derive from the footprint.' },
  { key: 'layers', label: 'Layers per pallet', hint: 'Optional override; leave empty to derive from the stack height.' },
  { key: 'unitLengthCm', label: 'Unit length (cm)', hint: 'Required for a Complete profile — the product’s own size before cartoning.' },
  { key: 'unitWidthCm', label: 'Unit width (cm)', hint: 'Required for a Complete profile.' },
  { key: 'unitHeightCm', label: 'Unit height (cm)', hint: 'Required for a Complete profile.' },
];

/** Field key -> the label the form shows, so the worklist and the form agree. */
export const PACKAGING_LABELS: Record<string, string> = Object.fromEntries(
  PACKAGING_FIELDS.map((field) => [field.key, field.label])
);

/** The only required fields with no documented default behind them, so they are named here. */
export const UNIT_DIMENSION_KEYS: readonly string[] = ['unitLengthCm', 'unitWidthCm', 'unitHeightCm'];
