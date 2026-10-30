/**
 * Wholesale account applications — the public door, and the only unauthenticated
 * write in the wholesale subsystem.
 *
 * ## Why it is a route of its own rather than a generic record write
 *
 * A visitor must be able to apply without an account, and the plugin's record
 * endpoint requires an administrator credential. So this route is the only place a
 * member of the public can cause a wholesale row to exist, and it is therefore the
 * one place that has to be careful:
 *
 *   - it accepts a *fixed* set of business fields, so no other column (status,
 *     account_id, decided_by, email_verified_at) can be set by the applicant;
 *   - it rate-limits per client, because the alternative is an open write that a
 *     script can fill with junk;
 *   - it never returns another applicant's data. A re-submission for an email that
 *     is already pending returns that application's reference — which the applicant
 *     already knows, because they just supplied the email it belongs to.
 *
 * ## The resale certificate
 *
 * The certificate file is validated by its own bytes, verified by the pure engine in
 * `lib/wholesale/resaleCertificate`, and stored base64-encoded on the application row
 * so no web-accessible uploads directory ever holds it. The verification result
 * stored with it is a *routing* answer: it can say "the applicant must supply
 * something" or "a reviewer must look", never "approved". Approval is an admin action
 * (`/api/admin/wholesale/decide`) behind a console session.
 */

import { NextResponse } from 'next/server';
import { applicationPolicyProblem } from '@/lib/wholesale/applicationPolicy';
import { checkRateLimit } from '@/lib/rateLimit';
import { sendEmail, siteBaseUrl } from '@/lib/email/sendEmail';
import { wholesaleDisabled } from '@/lib/wholesale/gate';
import {
  readWholesalePluginSettings,
  submitWholesaleApplication,
  upsertWholesaleRecord,
} from '@/lib/wholesale/store';
import { stateAuthority } from '@/lib/wholesale/resaleCertificate/states';
import {
  MAX_CERTIFICATE_BYTES,
  routeAfterEmailCheck,
  verifyResaleCertificate,
  type CertificateDocument,
  type ResaleCertificateInput,
} from '@/lib/wholesale/resaleCertificate/verify';

export const dynamic = 'force-dynamic';

/** The fields an applicant may set. Anything else in the body is dropped. */
const APPLICANT_FIELDS = [
  'company',
  'dba',
  'contact_name',
  'email',
  'phone',
  'country',
  'website',
  'business_type',
  'monthly_volume',
  'annual_volume',
  'interested_products',
  'logistics_mode',
  'destination_country',
  'destination_port',
  'notes',
  'billing_address',
  'address_line1',
  'address_line2',
  'city',
  'state',
  'zip',
] as const;

/** Which of those the plugin treats as required. Mirrors the plugin's own check. */
const REQUIRED_FIELDS: ReadonlyArray<(typeof APPLICANT_FIELDS)[number]> = [
  'company',
  'contact_name',
  'email',
  'country',
  'business_type',
];

const BUSINESS_TYPES = new Set(['reseller', 'distributor', 'importer', 'business', 'other']);
const LOGISTICS_MODES = new Set(['pallet', 'container', 'either']);

/** Longest accepted value per field — an application is a form, not a file upload. */
const MAX_LENGTH = 500;

/**
 * The rate-limit key: the caller's address.
 *
 * `cf-connecting-ip` first, because on this deployment Cloudflare sets it at the edge
 * and a client cannot forge it — `x-forwarded-for` is a client-supplied header and is
 * only the fallback for a direct/local request. Keying on a header a caller controls
 * would make the limit advisory rather than real.
 */
function clientKey(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for') || '';
  const ip =
    request.headers.get('cf-connecting-ip') ||
    forwarded.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown';
  return `wholesale-apply:${ip}`;
}

/** A trimmed string, or '' — never an object smuggled into a text column. */
function field(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, MAX_LENGTH);
}

/** An object from the body, or an empty one. Arrays and scalars are refused. */
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/**
 * Decodes the uploaded certificate.
 *
 * The base64 length is checked *before* decoding, so an oversized body is rejected
 * without being expanded in memory. Returns the bytes, or the reason it was refused.
 */
function decodeCertificate(
  value: unknown
):
  | { ok: true; fileName: string; mimeType: string; bytes: Uint8Array; head: number[]; base64: string }
  | { ok: false; error: string } {
  const file = record(value);
  const fileName = field(file.fileName).replace(/[^\w.\- ()]/g, '').slice(0, 120);
  const mimeType = field(file.mimeType).slice(0, 80);
  const raw = typeof file.data === 'string' ? file.data.trim() : '';

  if (!raw) return { ok: false, error: 'Attach a scan or photo of your resale certificate.' };

  // A data URL prefix is stripped rather than trusted; the bytes decide the type.
  const base64 = raw.includes(',') ? raw.slice(raw.indexOf(',') + 1) : raw;
  if (!/^[A-Za-z0-9+/=\s]+$/.test(base64)) {
    return { ok: false, error: 'The certificate could not be read. Upload a PDF, JPG or PNG file.' };
  }

  // 4 base64 characters carry 3 bytes; allow the padding slack.
  const estimatedBytes = Math.floor((base64.replace(/\s/g, '').length * 3) / 4);
  if (estimatedBytes > MAX_CERTIFICATE_BYTES) {
    return { ok: false, error: 'That certificate is larger than 5 MB. Upload a smaller scan or photo.' };
  }

  const normalised = base64.replace(/\s/g, '');
  let bytes: Uint8Array;
  try {
    const binary = atob(normalised);
    bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  } catch {
    return { ok: false, error: 'The certificate could not be decoded. Upload the file again.' };
  }

  if (!bytes.length) return { ok: false, error: 'The certificate file is empty.' };
  if (bytes.length > MAX_CERTIFICATE_BYTES) {
    return { ok: false, error: 'That certificate is larger than 5 MB. Upload a smaller scan or photo.' };
  }

  return {
    ok: true,
    fileName: fileName || 'resale-certificate',
    mimeType,
    bytes,
    head: Array.from(bytes.slice(0, 8)),
    base64: normalised,
  };
}

/** 48 hex characters. Long enough that guessing one is not a strategy. */
function verificationToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** The verification email body. Plain, and it says what happens next. */
function verificationEmailHtml(reference: string, company: string, link: string): string {
  return [
    `<p>Hello ${company.replace(/[&<>"']/g, (char) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[char] || char))},</p>`,
    `<p>Thank you for applying for a Himalayan Koh wholesale account. Your reference is <strong>${reference}</strong>.</p>`,
    `<p>Please confirm this is your business email address by opening the link below. It can be used once.</p>`,
    `<p><a href="${link}">Confirm my business email</a></p>`,
    `<p>If you did not apply, no action is needed and the application will not be approved.</p>`,
    `<p>Himalayan Koh — Wholesale Department<br />ws@himalayankoh.com</p>`,
  ].join('');
}

/**
 * The schema this route writes to.
 *
 * The application row now carries the resale certificate, its verification evidence,
 * the U.S. address and the declaration. An older plugin silently drops columns it does
 * not know (`hk_wholesale_filter_payload` filters against its own schema), so writing
 * through it would create an application with no certificate while telling the buyer
 * it succeeded. The route therefore refuses to write until the store reports the
 * schema it needs.
 */
const REQUIRED_DB_VERSION = 9;

/** One schema probe a minute, however many applications arrive. */
let schemaProbe: { checkedAt: number; ready: boolean } | null = null;

async function wholesaleSchemaReady(): Promise<boolean> {
  if (schemaProbe && Date.now() - schemaProbe.checkedAt < 60_000) return schemaProbe.ready;

  const settings = await readWholesalePluginSettings({ timeoutMs: 20_000 }).catch(() => null);
  const installed = Number(settings?.installed_db_version ?? settings?.db_version ?? 0);
  const ready = Boolean(settings) && Number.isFinite(installed) && installed >= REQUIRED_DB_VERSION && !settings?.schema_error && !(settings?.missing_tables?.length);
  schemaProbe = { checkedAt: Date.now(), ready };
  return ready;
}

export async function POST(request: Request) {
  const disabled = wholesaleDisabled();
  if (disabled) return disabled;

  const limit = checkRateLimit(clientKey(request), { limit: 5, windowMs: 60 * 60 * 1000 });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many applications from this connection. Try again later.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((limit.resetAt - Date.now()) / 1000)) } }
    );
  }

  if (!(await wholesaleSchemaReady())) {
    return NextResponse.json(
      {
        error:
          'Wholesale applications are temporarily unavailable while the trade store is upgraded. No details were saved. Email ws@himalayankoh.com and our team will take your application directly.',
        code: 'wholesale_store_not_ready',
      },
      { status: 503 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'An application object is required.' }, { status: 400 });
  const policyProblem = applicationPolicyProblem(body);
  if (policyProblem) return NextResponse.json({ error: policyProblem }, { status: 400 });

  const payload: Record<string, string> = {};
  for (const name of APPLICANT_FIELDS) {
    const value = field(body[name]);
    if (value) payload[name] = value;
  }

  const missing = REQUIRED_FIELDS.filter((name) => !payload[name]);
  if (missing.length) {
    return NextResponse.json(
      { error: `Please complete: ${missing.map((name) => name.replace(/_/g, ' ')).join(', ')}.` },
      { status: 400 }
    );
  }

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(payload.email)) {
    return NextResponse.json({ error: 'Enter a valid business email address.' }, { status: 400 });
  }
  if (payload.business_type && !BUSINESS_TYPES.has(payload.business_type)) {
    return NextResponse.json({ error: 'Choose one of the listed business types.' }, { status: 400 });
  }
  if (payload.logistics_mode && !LOGISTICS_MODES.has(payload.logistics_mode)) {
    return NextResponse.json({ error: 'Choose a pallet, container or either preference.' }, { status: 400 });
  }

  /* ------------------------- resale certificate ------------------------- */

  const resale = record(body.resale);
  const declaration = record(body.declaration);
  const state = stateAuthority(resale.state ?? payload.state);

  if (!state) {
    return NextResponse.json(
      {
        error:
          'Choose the U.S. state that issued your resale certificate. Wholesale accounts are currently reviewed for U.S. businesses and the District of Columbia.',
      },
      { status: 400 }
    );
  }

  const shipping = record(body.shipping);
  const shippingAddress = {
    line1: field(shipping.line1),
    line2: field(shipping.line2),
    city: field(shipping.city),
    state: field(shipping.state),
    zip: field(shipping.zip),
    country: field(shipping.country) || 'United States',
  };

  // The buyer's business address: required for a U.S. trade application, because the
  // certificate review compares it with what the state has on file.
  if (!payload.address_line1 || !payload.city || !payload.state || !payload.zip) {
    return NextResponse.json(
      { error: 'Please complete the business street address, city, state and ZIP code.' },
      { status: 400 }
    );
  }
  if (!stateAuthority(payload.state)) {
    return NextResponse.json(
      { error: 'Choose a valid U.S. business address state.' },
      { status: 400 }
    );
  }
  if (!/^\d{5}(-\d{4})?$/.test(payload.zip)) {
    return NextResponse.json({ error: 'Enter a valid U.S. ZIP code (12345 or 12345-6789).' }, { status: 400 });
  }
  if (!/^[0-9()+\-.\s]{7,25}$/.test(payload.phone || '')) {
    return NextResponse.json({ error: 'Enter a valid phone number.' }, { status: 400 });
  }

  const decoded = decodeCertificate(resale.certificate);
  const document: CertificateDocument | null = decoded.ok
    ? {
        fileName: decoded.fileName,
        mimeType: decoded.mimeType,
        sizeBytes: decoded.bytes.length,
        head: decoded.head,
      }
    : null;

  if (!decoded.ok && state.stateSalesTax) {
    // Only a state that issues a certificate needs one. A no-sales-tax state routes to
    // manual review instead (see the engine), so its applicant is not blocked here.
    return NextResponse.json({ error: decoded.error }, { status: 400 });
  }

  const declarationInput = {
    signedName: field(declaration.signedName),
    signedAt: field(declaration.signedAt),
    accepted: declaration.accepted === true,
  };

  const certificateInput: ResaleCertificateInput = {
    state: state.code,
    number: field(resale.number),
    type: field(resale.type) || 'STATE_RESALE_CERTIFICATE',
    holderName: field(resale.holderName) || payload.company,
    businessName: payload.company,
    dba: payload.dba,
    expiresOn: field(resale.expiresOn),
    document,
    declaration: declarationInput.accepted ? declarationInput : null,
    emailVerified: false,
  };

  const verification = verifyResaleCertificate(certificateInput);
  const certificateStatus = routeAfterEmailCheck(verification.status, false);
  const token = verificationToken();

  try {
    const result = await submitWholesaleApplication({
      ...payload,
      state: payload.state.toUpperCase(),
      resale_state: state.code,
      resale_number: certificateInput.number,
      resale_type: certificateInput.type,
      resale_holder: certificateInput.holderName,
      resale_expires: certificateInput.expiresOn,
      certificate_file_name: document?.fileName ?? '',
      certificate_file_type: document?.mimeType ?? '',
      certificate_file_size: document?.sizeBytes ?? 0,
      certificate_data: decoded.ok ? decoded.base64 : '',
      certificate_status: certificateStatus,
      certificate_checks: JSON.stringify(verification),
      certificate_official_url: verification.official?.lookupUrl ?? '',
      declaration_name: declarationInput.signedName,
      declaration_at: declarationInput.signedAt,
      shipping_address: JSON.stringify(shippingAddress),
      email_verification_token: token,
    });

    const reference = result.reference;
    const link = `${siteBaseUrl()}/wholesale/verify?token=${encodeURIComponent(token)}`;

    // Best effort: the application is already stored, and a mail outage must not lose
    // it. A failure is recorded in the audit trail so the team can re-verify by hand.
    const sent = await sendEmail({
      to: payload.email,
      subject: `Confirm your Himalayan Koh wholesale application (${reference})`,
      html: verificationEmailHtml(reference, payload.company, link),
      text: `Confirm your business email for Himalayan Koh wholesale application ${reference}: ${link}`,
      from: 'Himalayan Koh Wholesale <ws@himalayankoh.com>',
      fromName: 'Himalayan Koh Wholesale',
    }).catch(() => false);

    if (!sent) {
      await upsertWholesaleRecord(
        'audit',
        {
          at: new Date().toISOString().slice(0, 19).replace('T', ' '),
          actor: 'wholesale-apply',
          action: 'application_verification_email_failed',
          entity: 'applications',
          entity_id: Number(result.record.id ?? 0),
          detail: { email: payload.email, reference },
        },
        { actor: 'wholesale-apply' }
      ).catch(() => undefined);
    }

    return NextResponse.json(
      {
        submitted: true,
        reference,
        status: String(result.record.status ?? 'PENDING'),
        certificateStatus,
        emailSent: sent,
        verification: {
          status: verification.status,
          summary: verification.summary,
          missing: verification.missing,
        },
        message: sent
          ? 'Your application is with our wholesale team. Check the business email you supplied for a confirmation link.'
          : 'Your application is with our wholesale team. We could not send the confirmation email — reply to ws@himalayankoh.com and our team will confirm your address.',
      },
      { status: 201 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The application could not be submitted.';
    // The plugin's own refusal (an email that already holds an approved account)
    // is a real answer for the applicant, so it is passed on rather than flattened.
    const status = /already holds an approved wholesale account|application already exists/i.test(message) ? 409 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
