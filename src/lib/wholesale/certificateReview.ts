/**
 * What the console needs to review a resale certificate.
 *
 * Three jobs, all server-side:
 *
 *   1. **A safe projection.** An application row carries the certificate file itself
 *      (`certificate_data`, base64). A list read must never ship that to the browser —
 *      thirteen applications would be tens of megabytes, and the file should only
 *      travel when a reviewer opens it. `adminCertificateRow` replaces it with a
 *      boolean and parses the stored check list.
 *   2. **Rechecking.** When an applicant re-submits, or the owner asks for a second
 *      look, the stored fields are run through the same pure engine the public form
 *      used. Nothing here can approve.
 *   3. **The write a review produces.** Only the columns the reviewer owns.
 */

import { verifyResaleCertificate, type ResaleCertificateInput, type VerificationResult } from './resaleCertificate/verify';
import { isCertificateType } from './resaleCertificate/states';

import type { WholesaleRow } from './store';

/** An application as the review screens receive it: metadata, never the file. */
export interface AdminCertificateRow {
  id: number;
  reference: string;
  company: string;
  dba: string;
  contactName: string;
  email: string;
  phone: string;
  businessType: string;
  website: string;
  address: {
    line1: string;
    line2: string;
    city: string;
    state: string;
    zip: string;
    country: string;
  };
  shippingAddress: Record<string, string> | null;
  destinationCountry: string;
  destinationPort: string;
  notes: string;
  status: string;
  createdAt: string;
  decidedAt: string | null;
  decidedBy: string;
  /** The certificate as submitted. `file` is metadata; the bytes are a separate read. */
  certificate: {
    state: string;
    number: string;
    type: string;
    holder: string;
    expires: string;
    fileName: string;
    fileType: string;
    fileSize: number;
    hasFile: boolean;
    status: string;
    officialUrl: string;
    notes: string;
    reviewedAt: string | null;
    reviewedBy: string;
    verification: VerificationResult | null;
  };
  /** The typed electronic signature the applicant gave, and when. */
  declaration: { name: string; at: string } | null;
  emailVerifiedAt: string | null;
}

function text(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return fallback;
}

/** A JSON column as an object, whether the plugin decoded it or returned a string. */
export function parseJsonColumn(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
  return null;
}

/** The stored verification result, if it is one this build understands. */
export function storedVerification(value: unknown): VerificationResult | null {
  const parsed = parseJsonColumn(value) as Partial<VerificationResult> | null;
  if (!parsed || typeof parsed !== 'object') return null;
  if (!Array.isArray(parsed.checks) || typeof parsed.status !== 'string') return null;
  return {
    status: parsed.status,
    checks: parsed.checks,
    missing: Array.isArray(parsed.missing) ? parsed.missing : [],
    official: parsed.official ?? null,
    requiresManualReview: true,
    officialAutomationAvailable: false,
    evaluatedAt: text(parsed.evaluatedAt),
    summary: text(parsed.summary),
  } as VerificationResult;
}

/** The application reference, derived from the row id exactly as the plugin derives it. */
export function applicationReference(id: number): string {
  return `HK-WS-A${String(Math.max(0, id)).padStart(5, '0')}`;
}

/** A row from the plugin, projected for review without its file bytes. */
export function adminCertificateRow(row: WholesaleRow): AdminCertificateRow {
  const id = Number(row.id ?? 0);
  const shipping = parseJsonColumn(row.shipping_address);
  const hasFile = Boolean(text(row.certificate_data));

  return {
    id,
    reference: applicationReference(id),
    company: text(row.company),
    dba: text(row.dba),
    contactName: text(row.contact_name),
    email: text(row.email),
    phone: text(row.phone),
    businessType: text(row.business_type),
    website: text(row.website),
    address: {
      line1: text(row.address_line1 || row.billing_address),
      line2: text(row.address_line2),
      city: text(row.city),
      state: text(row.state || row.resale_state),
      zip: text(row.zip),
      country: text(row.country) || 'United States',
    },
    shippingAddress: shipping
      ? Object.fromEntries(Object.entries(shipping).map(([key, value]) => [key, text(value)]))
      : null,
    destinationCountry: text(row.destination_country),
    destinationPort: text(row.destination_port),
    notes: text(row.notes),
    status: text(row.status, 'PENDING').toUpperCase(),
    createdAt: text(row.created_at),
    decidedAt: text(row.decided_at) || null,
    decidedBy: text(row.decided_by),
    certificate: {
      state: text(row.resale_state || row.state).toUpperCase(),
      number: text(row.resale_number),
      type: text(row.resale_type),
      holder: text(row.resale_holder),
      expires: text(row.resale_expires),
      fileName: text(row.certificate_file_name),
      fileType: text(row.certificate_file_type),
      fileSize: Number(row.certificate_file_size ?? 0) || 0,
      hasFile,
      status: text(row.certificate_status, 'PENDING_CERTIFICATE_REVIEW').toUpperCase(),
      officialUrl: text(row.certificate_official_url),
      notes: text(row.certificate_notes),
      reviewedAt: text(row.certificate_reviewed_at) || null,
      reviewedBy: text(row.certificate_reviewed_by),
      verification: storedVerification(row.certificate_checks),
    },
    declaration: text(row.declaration_name)
      ? { name: text(row.declaration_name), at: text(row.declaration_at) }
      : null,
    emailVerifiedAt: text(row.email_verified_at) || null,
  };
}

/** The columns a review may write. Nothing else on the row is the reviewer's to set. */
export interface CertificateReviewWrite {
  certificate_status: string;
  certificate_checks: string;
  certificate_official_url: string;
  certificate_reviewed_at: string;
  certificate_reviewed_by: string;
}

/**
 * Re-runs the automated checks over what is stored.
 *
 * The stored file is read only for its first bytes, which is all the document check
 * needs; the whole blob is never decoded here. Used when an applicant resubmits, when
 * the owner asks for a recheck, and after an approval so the evidence records what was
 * true at that moment.
 */
export function recheckStoredApplication(
  row: WholesaleRow,
  actor: string,
  now: Date = new Date()
): { verification: VerificationResult; write: CertificateReviewWrite } {
  const base64 = text(row.certificate_data).replace(/\s/g, '');
  let head: number[] = [];
  let size = 0;

  if (base64) {
    // The first eight bytes are four base64 groups: decode a short prefix only.
    try {
      const prefix = atob(base64.slice(0, 12));
      head = Array.from(prefix.slice(0, 8), (character) => character.charCodeAt(0));
      size = Number(row.certificate_file_size ?? 0) || Math.floor((base64.length * 3) / 4);
    } catch {
      head = [];
    }
  }

  const type = text(row.resale_type);
  const input: ResaleCertificateInput = {
    state: text(row.resale_state || row.state),
    number: text(row.resale_number),
    type: isCertificateType(type) ? type : 'STATE_RESALE_CERTIFICATE',
    holderName: text(row.resale_holder) || text(row.company),
    businessName: text(row.company),
    dba: text(row.dba),
    expiresOn: text(row.resale_expires),
    document: base64
      ? {
          fileName: text(row.certificate_file_name) || 'resale-certificate',
          mimeType: text(row.certificate_file_type),
          sizeBytes: size,
          head,
        }
      : null,
    // The declaration is the applicant's own signature, stored when they submitted.
    // A row from before the declaration existed has none, so it is absent here rather
    // than invented from the contact name.
    declaration: text(row.declaration_name)
      ? {
          signedName: text(row.declaration_name),
          signedAt: text(row.declaration_at),
          accepted: true,
        }
      : null,
    emailVerified: Boolean(text(row.email_verified_at)),
  };

  const verification = verifyResaleCertificate(input, now);

  return {
    verification,
    write: {
      certificate_status: verification.status,
      certificate_checks: JSON.stringify(verification),
      certificate_official_url: verification.official?.lookupUrl ?? '',
      certificate_reviewed_at: now.toISOString().slice(0, 19).replace('T', ' '),
      certificate_reviewed_by: actor,
    },
  };
}
