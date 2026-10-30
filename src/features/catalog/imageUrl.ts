/** Normalize only URL presentation differences; never rewrite or fetch the asset. */
export function normalizeCatalogImageUrl(value: string): string {
  const raw = value.trim();
  try {
    const url = new URL(raw);
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return raw.replace(/\/$/, '');
  }
}

export function hasCatalogImageUrl(existing: string[], candidate: string): boolean {
  const normalized = normalizeCatalogImageUrl(candidate);
  return existing.some((value) => normalizeCatalogImageUrl(value) === normalized);
}
