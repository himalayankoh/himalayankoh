import { describe, expect, it } from 'vitest';
import {
  CERTIFICATE_STATUS_LABELS,
  MAX_CERTIFICATE_BYTES,
  identifyDocumentType,
  namesLikelyMatch,
  parseIsoDate,
  verifyResaleCertificate,
  type CertificateDocument,
  type ResaleCertificateInput,
} from './verify';
import { STATE_AUTHORITIES, US_STATE_CODES, isCertificateType, stateAuthority } from './states';

const NOW = new Date('2026-10-22T12:00:00.000Z');

const PDF_HEAD = [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]; // %PDF-1.7
const PNG_HEAD = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_HEAD = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46];

function pdf(overrides: Partial<CertificateDocument> = {}): CertificateDocument {
  return {
    fileName: 'resale-certificate.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 180_000,
    head: PDF_HEAD,
    ...overrides,
  };
}

function input(overrides: Partial<ResaleCertificateInput> = {}): ResaleCertificateInput {
  return {
    state: 'TX',
    number: '32012345678',
    type: 'STATE_RESALE_CERTIFICATE',
    holderName: 'Gulf Coast Grocers LLC',
    businessName: 'Gulf Coast Grocers, LLC',
    expiresOn: '2028-01-31',
    document: pdf(),
    declaration: { signedName: 'Maria Alvarez', signedAt: '2026-10-22', accepted: true },
    emailVerified: true,
    ...overrides,
  };
}

function check(result: ReturnType<typeof verifyResaleCertificate>, id: string) {
  const found = result.checks.find((entry) => entry.id === id);
  if (!found) throw new Error(`no check called ${id}`);
  return found;
}

describe('state registry', () => {
  it('covers all fifty states and DC', () => {
    expect(US_STATE_CODES).toHaveLength(51);
    expect(US_STATE_CODES).toContain('DC');
    expect(US_STATE_CODES).toContain('TX');
    expect(US_STATE_CODES).not.toContain('PR');
  });

  it('gives every state an authority and a place to look', () => {
    for (const code of US_STATE_CODES) {
      const state = STATE_AUTHORITIES[code];
      expect(state.authority.length).toBeGreaterThan(5);
      expect(state.lookupUrl.startsWith('https://')).toBe(true);
      expect(state.url.startsWith('https://')).toBe(true);
      expect(state.notes.length).toBeGreaterThan(10);
      expect(state.accepted.length).toBeGreaterThan(0);
    }
  });

  it('marks the five no-state-sales-tax states as such', () => {
    const noTax = US_STATE_CODES.filter((code) => !STATE_AUTHORITIES[code].stateSalesTax);
    expect(noTax.sort()).toEqual(['AK', 'DE', 'MT', 'NH', 'OR']);
  });

  it('resolves a code case-insensitively and refuses nonsense', () => {
    expect(stateAuthority('tx')?.name).toBe('Texas');
    expect(stateAuthority('ZZ')).toBeNull();
    expect(stateAuthority(42)).toBeNull();
  });

  it('only publishes a number pattern where the state documents one', () => {
    const withPattern = US_STATE_CODES.filter((code) => STATE_AUTHORITIES[code].numberPattern);
    expect(withPattern).toEqual(['TX']);
    expect(new RegExp(STATE_AUTHORITIES.TX.numberPattern as string).test('32012345678')).toBe(true);
    expect(new RegExp(STATE_AUTHORITIES.TX.numberPattern as string).test('3201234')).toBe(false);
  });

  it('knows the certificate types it will accept', () => {
    expect(isCertificateType('STATE_RESALE_CERTIFICATE')).toBe(true);
    expect(isCertificateType('A_NOTE_FROM_A_FRIEND')).toBe(false);
  });
});

describe('document identification', () => {
  it('identifies by bytes, not by the declared type', () => {
    expect(identifyDocumentType(PDF_HEAD, 'text/plain')).toBe('pdf');
    expect(identifyDocumentType(PNG_HEAD, 'application/pdf')).toBe('png');
    expect(identifyDocumentType(JPEG_HEAD, 'image/jpeg')).toBe('jpeg');
  });

  it('refuses a file whose bytes are none of the three', () => {
    expect(identifyDocumentType([0x3c, 0x68, 0x74, 0x6d, 0x6c, 0x3e, 0, 0], 'application/pdf')).toBeNull();
    expect(identifyDocumentType([], 'application/pdf')).toBeNull();
  });
});

describe('name comparison', () => {
  it('treats legal forms and punctuation as noise', () => {
    expect(namesLikelyMatch('Gulf Coast Grocers LLC', 'Gulf Coast Grocers, Inc.').matched).toBe(true);
    expect(namesLikelyMatch('The Himalayan Koh Company', 'Himalayan Koh').matched).toBe(true);
  });

  it('accepts a containing name', () => {
    expect(namesLikelyMatch('Himalayan Koh Trading', 'Himalayan Koh').matched).toBe(true);
  });

  it('does not accept two unrelated businesses that share one word', () => {
    const match = namesLikelyMatch('Salt Lake Mining Corp', 'Gulf Coast Grocers LLC');
    expect(match.matched).toBe(false);
    expect(match.score).toBeLessThan(0.5);
  });

  it('separates a two-word overlap from nothing', () => {
    expect(namesLikelyMatch('Houston Salt Distributors', 'Houston Salt Supply').matched).toBe(true);
    expect(namesLikelyMatch('Houston Salt', 'Dallas Pepper').matched).toBe(false);
  });

  it('refuses to compare against an empty name', () => {
    expect(namesLikelyMatch('', 'Gulf Coast Grocers').matched).toBe(false);
    expect(namesLikelyMatch('Gulf Coast Grocers', '').matched).toBe(false);
  });
});

describe('date parsing', () => {
  it('accepts a plain ISO date', () => {
    expect(parseIsoDate('2027-03-01')?.toISOString()).toBe('2027-03-01T00:00:00.000Z');
  });

  it('rejects impossible calendar dates instead of rolling them forward', () => {
    expect(parseIsoDate('2026-02-31')).toBeNull();
    expect(parseIsoDate('2026-13-01')).toBeNull();
    expect(parseIsoDate('31/01/2026')).toBeNull();
    expect(parseIsoDate('')).toBeNull();
  });
});

describe('verifyResaleCertificate', () => {
  it('completes the automated checks for a clean Texas application', () => {
    const result = verifyResaleCertificate(input(), NOW);
    expect(result.status).toBe('AUTOMATED_CHECKS_COMPLETED');
    expect(result.checks.filter((entry) => entry.outcome === 'fail')).toEqual([]);
    expect(check(result, 'number_format').outcome).toBe('pass');
    expect(result.official?.authority).toContain('Texas Comptroller');
  });

  it('never returns an approval, and says so in the payload', () => {
    const result = verifyResaleCertificate(input(), NOW);
    expect(result.status).not.toBe('APPROVED');
    expect(result.status).not.toBe('REJECTED');
    expect(result.requiresManualReview).toBe(true);
    expect(result.officialAutomationAvailable).toBe(false);
    expect(check(result, 'official_automation').outcome).toBe('not_run');
    expect(CERTIFICATE_STATUS_LABELS[result.status]).toBe('Automated checks completed');
  });

  it('treats a wrong Texas number shape as a note, not a rejection', () => {
    const result = verifyResaleCertificate(input({ number: 'TX-123' }), NOW);
    expect(check(result, 'number_format').outcome).toBe('warn');
    expect(result.checks.filter((entry) => entry.outcome === 'fail')).toEqual([]);
    expect(result.status).toBe('AUTOMATED_CHECKS_COMPLETED');
  });

  it('asks for the certificate when nothing was attached', () => {
    const result = verifyResaleCertificate(input({ document: null }), NOW);
    expect(result.status).toBe('ADDITIONAL_INFO_REQUIRED');
    expect(check(result, 'document_present').outcome).toBe('fail');
    expect(result.missing.join(' ')).toMatch(/scan or photo/i);
  });

  it('refuses a file whose declared type is a lie', () => {
    const result = verifyResaleCertificate(
      input({ document: { ...pdf(), fileName: 'certificate.pdf', head: [0x3c, 0x68, 0x74, 0x6d, 0x6c, 0x3e] } }),
      NOW
    );
    expect(check(result, 'document_type').outcome).toBe('fail');
    expect(result.status).toBe('ADDITIONAL_INFO_REQUIRED');
  });

  it('accepts a phone photo of a certificate', () => {
    const result = verifyResaleCertificate(
      input({ document: { fileName: 'permit.jpg', mimeType: 'image/jpeg', sizeBytes: 900_000, head: JPEG_HEAD } }),
      NOW
    );
    expect(check(result, 'document_type').outcome).toBe('pass');
    expect(result.status).toBe('AUTOMATED_CHECKS_COMPLETED');
  });

  it('refuses an oversized upload and a stub file', () => {
    const oversized = verifyResaleCertificate(
      input({ document: pdf({ sizeBytes: MAX_CERTIFICATE_BYTES + 1 }) }),
      NOW
    );
    expect(check(oversized, 'document_present').outcome).toBe('fail');

    const stub = verifyResaleCertificate(input({ document: pdf({ sizeBytes: 12 }) }), NOW);
    expect(check(stub, 'document_present').outcome).toBe('fail');
  });

  it('flags an expired certificate as the applicant’s to replace', () => {
    const result = verifyResaleCertificate(input({ expiresOn: '2026-01-01' }), NOW);
    expect(check(result, 'expiry').outcome).toBe('fail');
    expect(result.status).toBe('ADDITIONAL_INFO_REQUIRED');
    expect(result.missing.join(' ')).toMatch(/unexpired/i);
  });

  it('warns about an expiry that is nearly due, without blocking', () => {
    const result = verifyResaleCertificate(input({ expiresOn: '2026-11-05' }), NOW);
    expect(check(result, 'expiry').outcome).toBe('warn');
    expect(result.status).toBe('AUTOMATED_CHECKS_COMPLETED');
  });

  it('notes a name that does not resemble the business but does not reject it', () => {
    const result = verifyResaleCertificate(input({ holderName: 'Red Mesa Trading LLC' }), NOW);
    expect(check(result, 'holder_matches_business').outcome).toBe('warn');
    expect(result.status).toBe('AUTOMATED_CHECKS_COMPLETED');
  });

  it('accepts a certificate issued in the trading name', () => {
    const result = verifyResaleCertificate(
      input({ holderName: 'Salt Corner Market', dba: 'Salt Corner Market' }),
      NOW
    );
    expect(check(result, 'holder_matches_business').outcome).toBe('pass');
  });

  it('requires the authorised-applicant declaration', () => {
    const result = verifyResaleCertificate(
      input({ declaration: { signedName: '', signedAt: '2026-10-22', accepted: true } }),
      NOW
    );
    expect(check(result, 'declaration').outcome).toBe('fail');
    expect(result.status).toBe('ADDITIONAL_INFO_REQUIRED');
  });

  it('requires an explicit acceptance of the declaration', () => {
    const result = verifyResaleCertificate(
      input({ declaration: { signedName: 'Maria Alvarez', signedAt: '2026-10-22', accepted: false } }),
      NOW
    );
    expect(check(result, 'declaration').outcome).toBe('fail');
  });

  it('warns rather than blocks when the email is not verified yet', () => {
    const result = verifyResaleCertificate(input({ emailVerified: false }), NOW);
    expect(check(result, 'email_verified').outcome).toBe('warn');
    expect(result.status).toBe('AUTOMATED_CHECKS_COMPLETED');
  });

  it('refuses a certificate number with no digits', () => {
    const result = verifyResaleCertificate(input({ number: 'PENDING' }), NOW);
    expect(check(result, 'number_present').outcome).toBe('fail');
    expect(result.status).toBe('ADDITIONAL_INFO_REQUIRED');
  });

  it('rejects a number full of stray characters', () => {
    const result = verifyResaleCertificate(input({ number: '32012345678<script>' }), NOW);
    expect(check(result, 'number_present').outcome).toBe('fail');
  });

  it('routes a no-sales-tax state to a reviewer without demanding a certificate', () => {
    const result = verifyResaleCertificate(
      input({ state: 'OR', number: '', document: null, type: 'SIGNED_EXEMPTION_STATEMENT' }),
      NOW
    );
    expect(result.status).toBe('PENDING_CERTIFICATE_REVIEW');
    expect(check(result, 'state_requires_certificate').outcome).toBe('not_run');
    expect(result.official?.authority).toContain('Oregon');
  });

  it('still keeps an uploaded document for a no-sales-tax state', () => {
    const result = verifyResaleCertificate(
      input({ state: 'MT', number: '', type: 'SIGNED_EXEMPTION_STATEMENT' }),
      NOW
    );
    expect(check(result, 'certificate_evidence').outcome).toBe('warn');
    expect(check(result, 'certificate_evidence').detail).toContain('resale-certificate.pdf');
  });

  it('asks for the state when it is missing or not American', () => {
    const missingState = verifyResaleCertificate(input({ state: '' }), NOW);
    expect(missingState.status).toBe('ADDITIONAL_INFO_REQUIRED');
    expect(missingState.official).toBeNull();

    const foreign = verifyResaleCertificate(input({ state: 'Ontario' }), NOW);
    expect(foreign.status).toBe('ADDITIONAL_INFO_REQUIRED');
    expect(check(foreign, 'state_supported').detail).toContain('Ontario');
  });

  it('does not run a format check for a state with no published format', () => {
    const result = verifyResaleCertificate(input({ state: 'CA', number: 'SR KH 123-456789' }), NOW);
    expect(check(result, 'number_format').outcome).toBe('not_run');
    expect(result.checks.filter((entry) => entry.outcome === 'fail')).toEqual([]);
  });

  it('notes a certificate type the state is not listed as accepting', () => {
    const result = verifyResaleCertificate(input({ state: 'LA', type: 'STREAMLINED_EXEMPTION_CERTIFICATE' }), NOW);
    expect(check(result, 'certificate_type').outcome).toBe('warn');
  });

  it('produces a summary a reviewer can read at a glance', () => {
    const clean = verifyResaleCertificate(input(), NOW);
    expect(clean.summary).toContain('Texas');
    expect(clean.summary).toContain('must still confirm');

    const blocked = verifyResaleCertificate(input({ document: null }), NOW);
    expect(blocked.summary).toMatch(/need the applicant/i);
  });

  it('is deterministic for the same input and clock', () => {
    const first = verifyResaleCertificate(input(), NOW);
    const second = verifyResaleCertificate(input(), NOW);
    expect(second).toEqual(first);
    expect(first.evaluatedAt).toBe(NOW.toISOString());
  });
});
