/** Input checks run before an application can reach the privileged WordPress API. */
export function applicationPolicyProblem(body: Record<string, unknown>): string | null {
  if (body.country !== 'United States') return 'Wholesale applications currently require a United States business address.';
  if (body.privacyAccepted !== true) return 'Please acknowledge the Privacy Policy before submitting.';
  const declaration = body.declaration as Record<string, unknown> | null;
  if (!declaration || declaration.accepted !== true || typeof declaration.signedName !== 'string' || !declaration.signedName.trim()) {
    return 'Sign the authorised-applicant declaration before submitting.';
  }
  const signedAt = typeof declaration.signedAt === 'string' ? declaration.signedAt : '';
  const date = new Date(`${signedAt}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(signedAt) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== signedAt || date.getTime() > Date.now() + 86_400_000) {
    return 'A valid signature date is required.';
  }
  const shipping = body.shipping as Record<string, unknown> | null;
  if (shipping && Object.values(shipping).some(Boolean)) {
    if (!shipping.line1 || !shipping.city || !shipping.state || !/^\d{5}(-\d{4})?$/.test(String(shipping.zip || ''))) {
      return 'Complete the separate shipping street address, city, state and ZIP code.';
    }
  }
  return null;
}

export function approvalProblem(row: Record<string, unknown>): string | null {
  if (!row.email_verified_at) return 'Confirm the applicant’s business email before approving wholesale access.';
  if (!row.declaration_name || !row.declaration_at) return 'The signed applicant declaration is missing.';
  const expires = String(row.resale_expires || '');
  if (expires && new Date(`${expires}T23:59:59Z`).getTime() < Date.now()) return 'The resale certificate has expired. Request renewal before approving.';
  return null;
}
