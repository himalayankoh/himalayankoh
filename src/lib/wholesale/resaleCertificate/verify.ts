/**
 * The resale-certificate verification engine.
 *
 * ## The one rule that shapes everything here
 *
 * **This module cannot approve anybody.** It produces evidence for a human and a
 * routing status — never `APPROVED`. There is no official U.S. resale-certificate
 * verification API: the states publish certificate *requirements*, not a queryable
 * validity endpoint, and several lookup tools are captcha-gated or licensed in ways
 * that forbid automated use. So a run can only ever say "the deterministic checks are
 * done, a person must still look" or "the applicant must supply something first".
 *
 * That is also why a wrong format rule is harmless: a format check can route an
 * application to a reviewer with a note, but there is no path by which passing one
 * grants a wholesale price. The owner's decision in the console is the only approval.
 *
 * ## What is actually checked
 *
 * | Check | Kind | Can it fail the application? |
 * | --- | --- | --- |
 * | supported state, and whether the state issues a certificate at all | registry | no — routes to review |
 * | certificate number present and structurally plausible | deterministic | yes, applicant-fixable |
 * | number matches a *documented* state format (Texas only) | advisory | no — a note |
 * | a document is attached, and its bytes are a real PDF/JPEG/PNG | deterministic | yes, applicant-fixable |
 * | document is within the upload ceiling | deterministic | yes |
 * | the certificate holder's name resembles the business name | heuristic | no — a note |
 * | expiry date is not in the past | deterministic | yes |
 * | the authorised-applicant declaration is signed | deterministic | yes |
 * | the email was verified | state | no — a note |
 * | an official authority check exists to call | none | never run |
 *
 * Server-only. Pure: no clock, no I/O, no environment. `now` is passed in so a test
 * can pin the date.
 */

import {
  CERTIFICATE_TYPES,
  isCertificateType,
  stateAuthority,
  type CertificateType,
  type StateAuthority,
} from './states';

/** What a check found. `not_run` is a first-class outcome, not a failure. */
export type CheckOutcome = 'pass' | 'warn' | 'fail' | 'not_run';

export interface CertificateCheck {
  id: string;
  label: string;
  outcome: CheckOutcome;
  detail: string;
}

/**
 * The review status an application carries.
 *
 * `APPROVED`, `REJECTED` and `SUSPENDED` are the owner's decisions and are never
 * produced here; they appear in this union because the same column stores them.
 */
export type CertificateStatus =
  | 'PENDING_EMAIL_VERIFICATION'
  | 'PENDING_CERTIFICATE_REVIEW'
  | 'AUTOMATED_CHECKS_COMPLETED'
  | 'ADDITIONAL_INFO_REQUIRED'
  | 'APPROVED'
  | 'REJECTED'
  | 'SUSPENDED'
  | 'REVERIFICATION_REQUIRED';

export const CERTIFICATE_STATUS_LABELS: Record<CertificateStatus, string> = {
  PENDING_EMAIL_VERIFICATION: 'Pending email verification',
  PENDING_CERTIFICATE_REVIEW: 'Pending certificate review',
  AUTOMATED_CHECKS_COMPLETED: 'Automated checks completed',
  ADDITIONAL_INFO_REQUIRED: 'Additional information required',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  SUSPENDED: 'Suspended',
  REVERIFICATION_REQUIRED: 'Expired / reverification required',
};

/** Longest certificate file accepted. Kept under the JSON body limit the app enforces. */
export const MAX_CERTIFICATE_BYTES = 5 * 1024 * 1024;

/** Shortest believable document: a real certificate is never a handful of bytes. */
export const MIN_CERTIFICATE_BYTES = 512;

/** The document as the verifier sees it: metadata plus the first bytes, not the blob. */
export interface CertificateDocument {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  /** First eight bytes of the file, enough to identify PDF/JPEG/PNG. */
  head: number[];
}

export interface ResaleCertificateInput {
  /** USPS code or full state name as the applicant typed it. */
  state: string;
  number: string;
  type: string;
  /** The legal name printed on the certificate. */
  holderName: string;
  /** The legal business name from the application. */
  businessName: string;
  dba?: string;
  /** ISO date (YYYY-MM-DD) the certificate expires, when the state issues one with an expiry. */
  expiresOn?: string;
  document: CertificateDocument | null;
  declaration: { signedName: string; signedAt: string; accepted: boolean } | null;
  emailVerified: boolean;
}

export interface VerificationResult {
  status: CertificateStatus;
  checks: CertificateCheck[];
  /** What the applicant must supply before a reviewer can decide. */
  missing: string[];
  /** The authority, and where a reviewer opens its own lookup. */
  official: {
    authority: string;
    url: string;
    lookupUrl: string;
    note: string;
  } | null;
  /**
   * Always true. Stated in the payload rather than implied, because a screen that
   * forgot to say so would be the one place this system claimed to be automatic.
   */
  requiresManualReview: true;
  /** Whether any official machine-readable check ran. Always false, by fact. */
  officialAutomationAvailable: false;
  /** When the checks ran, ISO string. */
  evaluatedAt: string;
  /** A one-line summary for an admin list. */
  summary: string;
}

/** Characters that may not appear in a certificate number, whatever the state. */
const CLEAN_NUMBER = /^[A-Z0-9][A-Z0-9\-./ ]{2,24}$/i;

/** Legal-form words that are noise when comparing two business names. */
const LEGAL_SUFFIXES = new Set([
  'llc',
  'lllp',
  'llp',
  'lp',
  'inc',
  'incorporated',
  'corp',
  'corporation',
  'co',
  'company',
  'ltd',
  'limited',
  'plc',
  'pllc',
  'pc',
  'the',
  'dba',
  'usa',
  'us',
  'group',
  'holdings',
  'enterprises',
  'enterprise',
  'trading',
]);

/** Lowercase, punctuation-free words, legal forms removed. */
export function nameTokens(value: string): string[] {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => !LEGAL_SUFFIXES.has(token));
}

export interface NameMatch {
  matched: boolean;
  score: number;
  reason: string;
}

/**
 * Whether the name on the certificate plausibly belongs to the applicant.
 *
 * Deliberately generous: subsidiaries, DBA names and shortened trading names are
 * ordinary, so a mismatch is a note for the reviewer — never a rejection. The score is
 * the share of the smaller name's distinctive words that appear in the other.
 */
export function namesLikelyMatch(a: string, b: string): NameMatch {
  const left = nameTokens(a);
  const right = nameTokens(b);

  if (!left.length || !right.length) {
    return { matched: false, score: 0, reason: 'One of the two names is empty, so no comparison was possible.' };
  }

  const leftJoined = left.join(' ');
  const rightJoined = right.join(' ');
  if (leftJoined === rightJoined) {
    return { matched: true, score: 1, reason: 'The certificate holder and the business name are identical after normalisation.' };
  }
  if (leftJoined.includes(rightJoined) || rightJoined.includes(leftJoined)) {
    return {
      matched: true,
      score: 0.9,
      reason: `One name contains the other ("${a.trim()}" vs "${b.trim()}").`,
    };
  }

  const rightSet = new Set(right);
  const shared = left.filter((token) => rightSet.has(token)).length;
  const smaller = Math.min(left.length, right.length);
  const score = shared / smaller;

  if (shared >= 2 && score >= 0.5) {
    return {
      matched: true,
      score: Number(score.toFixed(2)),
      reason: `${shared} of ${smaller} distinctive words match between the two names.`,
    };
  }

  return {
    matched: false,
    score: Number(score.toFixed(2)),
    reason: `Only ${shared} of ${smaller} distinctive words match, which is not enough to confirm the certificate belongs to this business.`,
  };
}

/** The document file types this system accepts, identified by their magic bytes. */
export function identifyDocumentType(head: number[], mimeType: string): 'pdf' | 'jpeg' | 'png' | null {
  const bytes = head.slice(0, 8).map((value) => Number(value) & 0xff);
  const isPdf = bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
  if (isPdf) return 'pdf';
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (isJpeg) return 'jpeg';
  const isPng =
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a;
  if (isPng) return 'png';

  // The declared MIME type alone is never enough: it is client-supplied. Recognise it
  // only to describe the file in the failure message, not to accept the upload.
  void mimeType;
  return null;
}

/** A certificate type that the registry lists for this state, or a warning. */
function typeAccepted(state: StateAuthority, type: string): boolean {
  return state.accepted.includes(type as CertificateType);
}

/** Parse a date the applicant typed, returning a UTC calendar date or null. */
export function parseIsoDate(value: string | undefined): Date | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (Number.isNaN(date.getTime())) return null;
  // Reject 2026-02-31, which Date would silently roll into March.
  if (date.getUTCMonth() !== Number(match[2]) - 1 || date.getUTCDate() !== Number(match[3])) return null;
  return date;
}

/**
 * Runs the automated checks.
 *
 * The returned `status` is a *routing* answer, not a decision:
 *
 *   - `ADDITIONAL_INFO_REQUIRED` — the applicant can fix something (a missing or
 *     unreadable document, a missing number, an expired certificate, an unsigned
 *     declaration).
 *   - `PENDING_CERTIFICATE_REVIEW` — nothing the applicant did is wrong, but the
 *     state is one where no automated check is possible (no state sales tax), or no
 *     certificate was supplied at all.
 *   - `AUTOMATED_CHECKS_COMPLETED` — every check that can run has run without a
 *     blocking failure. A reviewer still has to confirm with the authority.
 */
export function verifyResaleCertificate(input: ResaleCertificateInput, now: Date = new Date()): VerificationResult {
  const checks: CertificateCheck[] = [];
  const missing: string[] = [];
  const state = stateAuthority(input.state);
  const evaluatedAt = now.toISOString();

  if (!state) {
    checks.push({
      id: 'state_supported',
      label: 'Issuing state recognised',
      outcome: 'fail',
      detail: input.state
        ? `"${input.state}" is not a U.S. state or the District of Columbia.`
        : 'No issuing state was supplied.',
    });
    missing.push('The state that issued the resale certificate');
    return finish(
      'ADDITIONAL_INFO_REQUIRED',
      checks,
      missing,
      null,
      evaluatedAt,
      'The issuing state is missing or not recognised.'
    );
  }

  checks.push({
    id: 'state_supported',
    label: 'Issuing state recognised',
    outcome: 'pass',
    detail: `${state.name} — ${state.authority}.`,
  });

  // The four no-sales-tax states (and Alaska's local system) issue no state resale
  // certificate. Nothing about that is the applicant's mistake, so it routes to a
  // reviewer rather than back to them.
  checks.push({
    id: 'state_requires_certificate',
    label: 'State issues a resale certificate',
    outcome: state.stateSalesTax ? 'pass' : 'not_run',
    detail: state.stateSalesTax
      ? `${state.name} administers a state sales and use tax, so a resale certificate applies.`
      : state.notes,
  });

  if (!state.stateSalesTax) {
    checks.push(officialAutomationCheck());
    checks.push({
      id: 'certificate_evidence',
      label: 'Certificate evidence',
      outcome: input.document ? 'warn' : 'not_run',
      detail: input.document
        ? `${state.name} issues no state resale certificate; the document supplied (${input.document.fileName}) was kept for the reviewer.`
        : `${state.name} issues no state resale certificate, so no document was required. A signed exemption statement still needs review.`,
    });
    return finish(
      'PENDING_CERTIFICATE_REVIEW',
      checks,
      missing,
      state,
      evaluatedAt,
      `${state.name} has no state resale certificate; a reviewer must confirm the buyer's basis for resale.`
    );
  }

  /* ------------------------------ the number ------------------------------ */

  const number = String(input.number || '').trim();
  if (!number) {
    checks.push({
      id: 'number_present',
      label: 'Certificate number supplied',
      outcome: 'fail',
      detail: 'No resale-certificate or permit number was supplied.',
    });
    missing.push('The resale-certificate / permit number');
  } else if (!CLEAN_NUMBER.test(number)) {
    checks.push({
      id: 'number_present',
      label: 'Certificate number supplied',
      outcome: 'fail',
      detail: 'The number contains characters a certificate number never carries. Check for a pasted label or stray text.',
    });
    missing.push('A correctly typed resale-certificate / permit number');
  } else if (number.replace(/[^0-9]/g, '').length < 3) {
    checks.push({
      id: 'number_present',
      label: 'Certificate number supplied',
      outcome: 'fail',
      detail: 'The number contains fewer than three digits, which no state permit number does.',
    });
    missing.push('A correctly typed resale-certificate / permit number');
  } else {
    checks.push({
      id: 'number_present',
      label: 'Certificate number supplied',
      outcome: 'pass',
      detail: `${number} — ${state.numberHint}`,
    });
  }

  if (state.numberPattern) {
    const pattern = new RegExp(state.numberPattern);
    checks.push({
      id: 'number_format',
      label: `${state.code} number format (advisory)`,
      outcome: pattern.test(number) ? 'pass' : 'warn',
      detail: pattern.test(number)
        ? `${state.code} publishes this format and the number matches it.`
        : `${state.code} publishes this format and the number does not match it. Out-of-state numbers are legitimate on some certificates, so a reviewer decides — this is a note, not a rejection.`,
    });
  } else {
    checks.push({
      id: 'number_format',
      label: 'Number format (advisory)',
      outcome: 'not_run',
      detail: `${state.name} publishes no machine-readable number format this system can rely on, so the number is reviewed by eye.`,
    });
  }

  /* ----------------------------- the document ----------------------------- */

  const doc = input.document;
  if (!doc) {
    checks.push({
      id: 'document_present',
      label: 'Certificate document attached',
      outcome: 'fail',
      detail: 'No certificate file was attached.',
    });
    missing.push('A scan or photo of the resale certificate (PDF, JPG or PNG)');
  } else if (doc.sizeBytes < MIN_CERTIFICATE_BYTES) {
    checks.push({
      id: 'document_present',
      label: 'Certificate document attached',
      outcome: 'fail',
      detail: `"${doc.fileName}" is only ${doc.sizeBytes} bytes, which is too small to be a readable certificate.`,
    });
    missing.push('A complete, readable certificate file');
  } else if (doc.sizeBytes > MAX_CERTIFICATE_BYTES) {
    checks.push({
      id: 'document_present',
      label: 'Certificate document attached',
      outcome: 'fail',
      detail: `"${doc.fileName}" is ${(doc.sizeBytes / (1024 * 1024)).toFixed(1)} MB; the limit is 5 MB.`,
    });
    missing.push('A certificate file smaller than 5 MB');
  } else {
    checks.push({
      id: 'document_present',
      label: 'Certificate document attached',
      outcome: 'pass',
      detail: `"${doc.fileName}" — ${(doc.sizeBytes / 1024).toFixed(0)} KB.`,
    });
  }

  if (doc) {
    const kind = identifyDocumentType(doc.head, doc.mimeType);
    checks.push({
      id: 'document_type',
      label: 'Document is a readable PDF, JPG or PNG',
      outcome: kind ? 'pass' : 'fail',
      detail: kind
        ? `The file's own bytes identify it as ${kind.toUpperCase()}.`
        : 'The file is not a PDF, JPEG or PNG: its own header bytes do not match any of them, whatever its name says.',
    });
    if (!kind) missing.push('A PDF, JPG or PNG copy of the certificate');

    // The registry entry for each state and the type the applicant chose: a mismatch
    // is not an error (states accept more than this table lists), but the reviewer
    // should know they are looking at a document the state may not accept.
    checks.push({
      id: 'certificate_type',
      label: 'Certificate type accepted in this state',
      outcome: isCertificateType(input.type) && typeAccepted(state, input.type) ? 'pass' : 'warn',
      detail: isCertificateType(input.type)
        ? typeAccepted(state, input.type)
          ? `${CERTIFICATE_TYPES.find((entry) => entry.value === input.type)?.label} is listed for ${state.name}.`
          : `${CERTIFICATE_TYPES.find((entry) => entry.value === input.type)?.label} is not in this registry's list for ${state.name}; a reviewer confirms whether ${state.name} accepts it.`
        : 'The certificate type supplied is not one of the listed documents.',
    });
  }

  /* ------------------------------- the names ------------------------------ */

  if (!input.holderName || !input.holderName.trim()) {
    checks.push({
      id: 'holder_matches_business',
      label: 'Certificate holder matches the business',
      outcome: 'warn',
      detail: 'The legal name printed on the certificate was not supplied, so the reviewer must compare it by eye.',
    });
    missing.push('The legal name printed on the certificate');
  } else {
    const match = namesLikelyMatch(input.holderName, input.businessName);
    const dbaMatch = input.dba ? namesLikelyMatch(input.holderName, input.dba) : null;
    const matched = match.matched || Boolean(dbaMatch?.matched);
    checks.push({
      id: 'holder_matches_business',
      label: 'Certificate holder matches the business',
      outcome: matched ? 'pass' : 'warn',
      detail: matched
        ? dbaMatch?.matched && !match.matched
          ? `The certificate names the trading name: ${dbaMatch.reason}`
          : match.reason
        : `${match.reason} A reviewer confirms this against the authority before approving.`,
    });
  }

  /* ------------------------------- the expiry ----------------------------- */

  const expiry = parseIsoDate(input.expiresOn);
  if (input.expiresOn && !expiry) {
    checks.push({
      id: 'expiry',
      label: 'Certificate expiry',
      outcome: 'warn',
      detail: `"${input.expiresOn}" is not a valid date, so the expiry was not checked.`,
    });
  } else if (expiry) {
    const days = Math.floor((expiry.getTime() - now.getTime()) / 86_400_000);
    if (days < 0) {
      checks.push({
        id: 'expiry',
        label: 'Certificate expiry',
        outcome: 'fail',
        detail: `The certificate expired on ${input.expiresOn}. The buyer must supply a current one.`,
      });
      missing.push('A current, unexpired resale certificate');
    } else if (days <= 30) {
      checks.push({
        id: 'expiry',
        label: 'Certificate expiry',
        outcome: 'warn',
        detail: `The certificate expires in ${days} day${days === 1 ? '' : 's'} (${input.expiresOn}).`,
      });
    } else {
      checks.push({
        id: 'expiry',
        label: 'Certificate expiry',
        outcome: 'pass',
        detail: `Valid until ${input.expiresOn}.`,
      });
    }
  } else {
    checks.push({
      id: 'expiry',
      label: 'Certificate expiry',
      outcome: 'warn',
      detail: `${state.name} does not require an expiry on this document, or none was supplied. A reviewer checks its current validity.`,
    });
  }

  /* ----------------------------- the declaration -------------------------- */

  const declaration = input.declaration;
  if (!declaration || !declaration.accepted || !declaration.signedName.trim()) {
    checks.push({
      id: 'declaration',
      label: 'Authorised applicant declaration',
      outcome: 'fail',
      detail: 'The applicant has not signed the declaration that they are authorised to claim resale for this business.',
    });
    missing.push('The signed authorised-applicant declaration');
  } else {
    checks.push({
      id: 'declaration',
      label: 'Authorised applicant declaration',
      outcome: 'pass',
      detail: `Signed electronically by ${declaration.signedName.trim()} on ${declaration.signedAt}.`,
    });
  }

  checks.push(
    input.emailVerified
      ? {
          id: 'email_verified',
          label: 'Business email verified',
          outcome: 'pass',
          detail: 'The applicant followed the verification link sent to the business email.',
        }
      : {
          id: 'email_verified',
          label: 'Business email verified',
          outcome: 'warn',
          detail: 'The business email has not been confirmed yet. A reviewer may still decide the application, but the address was not proven.',
        }
  );

  checks.push(officialAutomationCheck());

  const blocking = checks.some((check) => check.outcome === 'fail');
  const status: CertificateStatus = blocking ? 'ADDITIONAL_INFO_REQUIRED' : 'AUTOMATED_CHECKS_COMPLETED';

  return finish(
    status,
    checks,
    missing,
    state,
    evaluatedAt,
    blocking
      ? `${missing.length} item${missing.length === 1 ? '' : 's'} need the applicant before review: ${missing.join('; ')}.`
      : `Automated checks completed for ${state.name}. A reviewer must still confirm the certificate with ${state.authority}.`
  );
}

/**
 * The status a run is stored under once email verification is taken into account.
 *
 * A clean set of certificate checks is not "ready for approval" while the business
 * email is still unproven — it is "waiting on the applicant to click the link". The
 * console shows those two facts side by side, and keeping them separate means a
 * reviewer can see *why* the application is where it is.
 */
export function routeAfterEmailCheck(
  status: CertificateStatus,
  emailVerified: boolean
): CertificateStatus {
  if (!emailVerified && status === 'AUTOMATED_CHECKS_COMPLETED') return 'PENDING_EMAIL_VERIFICATION';
  return status;
}

/** The check that states, every time, that no official check could be made. */
function officialAutomationCheck(): CertificateCheck {
  return {
    id: 'official_automation',
    label: 'Official authority check',
    outcome: 'not_run',
    detail:
      'No U.S. state offers a public machine-readable resale-certificate verification API. The reviewer opens the authority’s own lookup from this screen and records the result.',
  };
}

function finish(
  status: CertificateStatus,
  checks: CertificateCheck[],
  missing: string[],
  state: StateAuthority | null,
  evaluatedAt: string,
  summary: string
): VerificationResult {
  return {
    status,
    checks,
    missing,
    official: state
      ? {
          authority: state.authority,
          url: state.url,
          lookupUrl: state.lookupUrl,
          note: state.notes,
        }
      : null,
    requiresManualReview: true,
    officialAutomationAvailable: false,
    evaluatedAt,
    summary,
  };
}
