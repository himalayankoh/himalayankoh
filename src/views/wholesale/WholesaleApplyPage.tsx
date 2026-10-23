'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, CheckCircle2, ExternalLink, FileText, Loader2, Send, ShieldCheck, Upload, X } from 'lucide-react';
import {
  CERTIFICATE_TYPES,
  STATE_AUTHORITIES,
  US_STATE_CODES,
  stateAuthority,
} from '@/lib/wholesale/resaleCertificate/states';

/**
 * The wholesale application form.
 *
 * ## What it collects, and why
 *
 * A U.S. trade account needs the business, the person behind it, a reachable business
 * address, and the resale certificate that lets the buyer purchase tax-exempt for
 * resale. The certificate is the one document collected up front: without it a
 * wholesale price would be a discount, and a discount is not what a trade account is.
 *
 * ## What it deliberately does not collect
 *
 * No bank details, no credit references, no EIN, no date of birth. Those are things to
 * ask for after a person has read the application and decided to trade, and collecting
 * them here would make an unauthenticated public form a store of financial data.
 *
 * ## The happy path, said plainly
 *
 * The certificate is checked automatically for the things a machine can check — that
 * the number is plausible, the file is really a PDF/JPG/PNG, the names resemble each
 * other, the declaration is signed. Nothing is approved by that: the page tells the
 * applicant a person reviews the certificate, and the owner approves the account.
 */

interface FormState {
  company: string;
  dba: string;
  contact_name: string;
  email: string;
  phone: string;
  website: string;
  business_type: string;
  address_line1: string;
  address_line2: string;
  city: string;
  state: string;
  zip: string;
  monthly_volume: string;
  annual_volume: string;
  interested_products: string;
  logistics_mode: string;
  destination_country: string;
  destination_port: string;
  notes: string;
}

interface ResaleState {
  state: string;
  number: string;
  type: string;
  holderName: string;
  expiresOn: string;
}

const EMPTY: FormState = {
  company: '',
  dba: '',
  contact_name: '',
  email: '',
  phone: '',
  website: '',
  business_type: 'reseller',
  address_line1: '',
  address_line2: '',
  city: '',
  state: '',
  zip: '',
  monthly_volume: '',
  annual_volume: '',
  interested_products: '',
  logistics_mode: 'either',
  destination_country: 'United States',
  destination_port: '',
  notes: '',
};

const EMPTY_RESALE: ResaleState = {
  state: '',
  number: '',
  type: 'STATE_RESALE_CERTIFICATE',
  holderName: '',
  expiresOn: '',
};

const BUSINESS_TYPES = [
  { value: 'reseller', label: 'Retailer / reseller' },
  { value: 'distributor', label: 'Distributor' },
  { value: 'importer', label: 'Importer' },
  { value: 'business', label: 'Business (own use)' },
  { value: 'other', label: 'Other' },
];

const LOGISTICS_MODES = [
  { value: 'pallet', label: 'Pallets / part loads' },
  { value: 'container', label: 'Full containers' },
  { value: 'either', label: 'Either — depending on the order' },
];

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPTED = ['application/pdf', 'image/jpeg', 'image/png'];

const label = 'block text-sm font-medium text-charcoal mb-1.5';
const input =
  'w-full px-4 py-2.5 rounded-xl border border-charcoal/15 bg-white text-charcoal placeholder:text-charcoal-light/50 focus:outline-none focus:ring-2 focus:ring-himalayan/40 focus:border-himalayan';
const hint = 'mt-1.5 text-xs text-charcoal-light leading-relaxed';

function StateSelect({
  id,
  value,
  onChange,
  required,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <select id={id} className={input} value={value} onChange={(event) => onChange(event.target.value)} required={required}>
      <option value="">Select a state</option>
      {US_STATE_CODES.map((code) => (
        <option key={code} value={code}>
          {STATE_AUTHORITIES[code].name}
        </option>
      ))}
    </select>
  );
}

export default function WholesaleApplyPage() {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [resale, setResale] = useState<ResaleState>(EMPTY_RESALE);
  const [file, setFile] = useState<File | null>(null);
  const [signedName, setSignedName] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [shippingDifferent, setShippingDifferent] = useState(false);
  const [shipping, setShipping] = useState({ line1: '', line2: '', city: '', state: '', zip: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{
    reference: string;
    message: string;
    emailSent: boolean;
    missing: string[];
  } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const state = useMemo(() => stateAuthority(resale.state), [resale.state]);
  const certificateRequired = state ? state.stateSalesTax : true;

  function update<K extends keyof FormState>(key: K, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updateResale<K extends keyof ResaleState>(key: K, value: string) {
    setResale((current) => ({ ...current, [key]: value }));
  }

  function chooseFile(chosen: File | null) {
    setError('');
    if (!chosen) {
      setFile(null);
      return;
    }
    if (!ACCEPTED.includes(chosen.type)) {
      setError('The certificate must be a PDF, JPG or PNG file.');
      return;
    }
    if (chosen.size > MAX_BYTES) {
      setError('That file is larger than 5 MB. Photograph the certificate at a lower resolution, or scan it as a PDF.');
      return;
    }
    if (chosen.size < 512) {
      setError('That file is empty or truncated. Choose the certificate again.');
      return;
    }
    setFile(chosen);
  }

  async function fileToBase64(chosen: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const value = String(reader.result || '');
        resolve(value.slice(value.indexOf(',') + 1));
      };
      reader.onerror = () => reject(new Error('read-failed'));
      reader.readAsDataURL(chosen);
    });
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError('');

    if (!resale.state) {
      setError('Choose the state that issued your resale certificate.');
      return;
    }
    if (certificateRequired && !resale.number.trim()) {
      setError('Enter the resale-certificate or permit number.');
      return;
    }
    if (certificateRequired && !file) {
      setError('Attach a scan or photo of your resale certificate.');
      return;
    }
    if (!accepted || !signedName.trim()) {
      setError('Sign the authorised-applicant declaration before submitting.');
      return;
    }

    setSubmitting(true);
    try {
      const certificate = file
        ? await fileToBase64(file).then((data) => ({ fileName: file.name, mimeType: file.type, data }))
        : null;

      const response = await fetch('/api/wholesale/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          /*
           * The form is a U.S. business application: the address, the state select and
           * the certificate are all U.S.-shaped, so the country is not a field a person
           * can get wrong — it is stated here. Without this line the route refused every
           * browser submission with "Please complete: country", which the HTTP trial did
           * not catch because it posted the field directly.
           */
          country: 'United States',
          privacyAccepted,
          state: form.state,
          resale: {
            ...resale,
            certificate,
          },
          declaration: {
            signedName: signedName.trim(),
            signedAt: new Date().toISOString().slice(0, 10),
            accepted: true,
          },
          shipping: shippingDifferent ? shipping : {},
        }),
      });

      const data = (await response.json().catch(() => ({}))) as {
        reference?: string;
        message?: string;
        error?: string;
        emailSent?: boolean;
        verification?: { missing?: string[] };
      };

      if (!response.ok) {
        setError(data.error || `The application could not be submitted (HTTP ${response.status}).`);
        return;
      }

      setResult({
        reference: data.reference || '',
        message: data.message || 'Your application is with our wholesale team.',
        emailSent: data.emailSent !== false,
        missing: data.verification?.missing ?? [],
      });
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <div className="min-h-screen bg-warm-white flex items-center justify-center px-4 py-20">
        <div className="max-w-xl w-full bg-white rounded-3xl border border-charcoal/8 shadow-sm p-8 md:p-10 text-center">
          <div className="w-14 h-14 rounded-2xl bg-green-50 flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-7 h-7 text-green-600" />
          </div>
          <h1 className="font-serif text-3xl font-bold text-charcoal mb-3">Application received</h1>
          <p className="text-charcoal-light leading-relaxed mb-6">{result.message}</p>
          <div className="bg-warm-white rounded-2xl p-5 mb-6">
            <p className="text-xs uppercase tracking-widest text-charcoal-light mb-1">Your reference</p>
            <p className="font-mono text-lg font-semibold text-charcoal">{result.reference}</p>
          </div>

          {result.missing.length ? (
            <div className="text-left rounded-2xl border border-amber-200 bg-amber-50 p-5 mb-6">
              <p className="text-sm font-semibold text-amber-900 mb-2">Our team will ask for these:</p>
              <ul className="text-sm text-amber-900/90 space-y-1 list-disc pl-5">
                {result.missing.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <p className="text-sm text-charcoal-light leading-relaxed mb-7">
            {result.emailSent
              ? 'Open the confirmation link we sent to your business email. Resale certificates are reviewed by hand, and we reply by email — usually within a few working days.'
              : 'We could not send the confirmation email. Reply to ws@himalayankoh.com with your reference and our team will confirm your address.'}
          </p>
          <Link href="/wholesale" className="text-himalayan font-semibold hover:underline">
            Back to wholesale
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-warm-white">
      <div className="bg-gradient-to-r from-charcoal to-charcoal-light py-10 md:py-14">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <h1 className="font-serif text-4xl md:text-5xl font-bold text-white mb-4">Wholesale account application</h1>
          <p className="text-white/70 text-lg leading-relaxed">
            U.S. retailers, distributors and importers only. Fields marked with an asterisk are required. Resale
            certificates are reviewed by a person — nothing is approved automatically.
          </p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 md:py-12">
        <form onSubmit={submit} noValidate className="bg-white rounded-3xl border border-charcoal/8 shadow-sm p-6 md:p-9">
          {/* ------------------------------ business ------------------------------ */}
          <h2 className="font-serif text-xl font-semibold text-charcoal mb-1">Business</h2>
          <p className="text-sm text-charcoal-light mb-5">
            Use the legal name that appears on your resale certificate and tax filings.
          </p>

          <div className="grid sm:grid-cols-2 gap-5 mb-8">
            <div className="sm:col-span-2">
              <label className={label} htmlFor="company">
                Legal business name *
              </label>
              <input
                id="company"
                className={input}
                value={form.company}
                onChange={(event) => update('company', event.target.value)}
                placeholder="Himalayan Foods LLC"
                autoComplete="organization"
                required
              />
            </div>

            <div>
              <label className={label} htmlFor="dba">
                DBA / trading name
              </label>
              <input
                id="dba"
                className={input}
                value={form.dba}
                onChange={(event) => update('dba', event.target.value)}
                placeholder="Optional"
              />
            </div>

            <div>
              <label className={label} htmlFor="business_type">
                Business type *
              </label>
              <select
                id="business_type"
                className={input}
                value={form.business_type}
                onChange={(event) => update('business_type', event.target.value)}
              >
                {BUSINESS_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className={label} htmlFor="website">
                Business website
              </label>
              <input
                id="website"
                className={input}
                value={form.website}
                onChange={(event) => update('website', event.target.value)}
                placeholder="https://"
                autoComplete="url"
              />
            </div>
          </div>

          {/* ------------------------------- address ------------------------------ */}
          <h2 className="font-serif text-xl font-semibold text-charcoal mb-5">Business address</h2>
          <div className="grid sm:grid-cols-6 gap-5 mb-8">
            <div className="sm:col-span-6">
              <label className={label} htmlFor="address_line1">
                Street address *
              </label>
              <input
                id="address_line1"
                className={input}
                value={form.address_line1}
                onChange={(event) => update('address_line1', event.target.value)}
                autoComplete="address-line1"
                required
              />
            </div>
            <div className="sm:col-span-6">
              <label className={label} htmlFor="address_line2">
                Suite / unit
              </label>
              <input
                id="address_line2"
                className={input}
                value={form.address_line2}
                onChange={(event) => update('address_line2', event.target.value)}
                autoComplete="address-line2"
              />
            </div>
            <div className="sm:col-span-3">
              <label className={label} htmlFor="city">
                City *
              </label>
              <input
                id="city"
                className={input}
                value={form.city}
                onChange={(event) => update('city', event.target.value)}
                autoComplete="address-level2"
                required
              />
            </div>
            <div className="sm:col-span-2">
              <label className={label} htmlFor="state">
                State *
              </label>
              <StateSelect
                id="state"
                value={form.state}
                onChange={(value) => {
                  update('state', value);
                  // The certificate is issued by the state the business is registered
                  // in; carrying the address choice across saves a second selection.
                  if (!resale.state) updateResale('state', value);
                }}
                required
              />
            </div>
            <div className="sm:col-span-1">
              <label className={label} htmlFor="zip">
                ZIP *
              </label>
              <input
                id="zip"
                className={input}
                value={form.zip}
                onChange={(event) => update('zip', event.target.value)}
                placeholder="77065"
                autoComplete="postal-code"
                inputMode="numeric"
                required
              />
            </div>
            <div className="sm:col-span-6">
              <p className={hint}>Country: United States. Wholesale accounts are currently reviewed for U.S. businesses.</p>
            </div>
          </div>

          <div className="mb-8">
            <label className="flex items-start gap-3 text-sm text-charcoal cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded border-charcoal/30 text-himalayan focus:ring-himalayan/40"
                checked={shippingDifferent}
                onChange={(event) => setShippingDifferent(event.target.checked)}
              />
              <span>Deliveries arrive at a different address (warehouse, fulfilment centre, freight forwarder)</span>
            </label>

            {shippingDifferent ? (
              <div className="mt-4 grid sm:grid-cols-6 gap-4 rounded-2xl bg-warm-white p-5">
                <div className="sm:col-span-6">
                  <label className={label} htmlFor="ship_line1">
                    Shipping street address
                  </label>
                  <input
                    id="ship_line1"
                    className={input}
                    value={shipping.line1}
                    onChange={(event) => setShipping({ ...shipping, line1: event.target.value })}
                  />
                </div>
                <div className="sm:col-span-3">
                  <label className={label} htmlFor="ship_city">
                    City
                  </label>
                  <input
                    id="ship_city"
                    className={input}
                    value={shipping.city}
                    onChange={(event) => setShipping({ ...shipping, city: event.target.value })}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className={label} htmlFor="ship_state">
                    State
                  </label>
                  <StateSelect
                    id="ship_state"
                    value={shipping.state}
                    onChange={(value) => setShipping({ ...shipping, state: value })}
                  />
                </div>
                <div className="sm:col-span-1">
                  <label className={label} htmlFor="ship_zip">
                    ZIP
                  </label>
                  <input
                    id="ship_zip"
                    className={input}
                    value={shipping.zip}
                    onChange={(event) => setShipping({ ...shipping, zip: event.target.value })}
                    inputMode="numeric"
                  />
                </div>
              </div>
            ) : null}
          </div>

          {/* ------------------------------- contact ------------------------------ */}
          <h2 className="font-serif text-xl font-semibold text-charcoal mb-5">Contact</h2>
          <div className="grid sm:grid-cols-2 gap-5 mb-8">
            <div>
              <label className={label} htmlFor="contact_name">
                Contact person&apos;s full name *
              </label>
              <input
                id="contact_name"
                className={input}
                value={form.contact_name}
                onChange={(event) => update('contact_name', event.target.value)}
                autoComplete="name"
                required
              />
            </div>
            <div>
              <label className={label} htmlFor="email">
                Business email *
              </label>
              <input
                id="email"
                type="email"
                className={input}
                value={form.email}
                onChange={(event) => update('email', event.target.value)}
                autoComplete="email"
                required
              />
              <p className={hint}>We send a confirmation link here. Use the address on the business, not a personal one.</p>
            </div>
            <div className="sm:col-span-2">
              <label className={label} htmlFor="phone">
                Phone *
              </label>
              <input
                id="phone"
                className={input}
                value={form.phone}
                onChange={(event) => update('phone', event.target.value)}
                autoComplete="tel"
                placeholder="(832) 224-6466"
                required
              />
            </div>
          </div>

          {/* --------------------------- resale certificate ------------------------ */}
          <h2 className="font-serif text-xl font-semibold text-charcoal mb-1">Resale certificate</h2>
          <p className="text-sm text-charcoal-light mb-5">
            Wholesale pricing is for resale only. Attach the certificate or permit issued by the state where your
            business is registered, and type the number exactly as it is printed.
          </p>

          <div className="grid sm:grid-cols-2 gap-5 mb-5">
            <div>
              <label className={label} htmlFor="resale_state">
                State issuing the certificate *
              </label>
              <StateSelect id="resale_state" value={resale.state} onChange={(value) => updateResale('state', value)} required />
            </div>
            <div>
              <label className={label} htmlFor="resale_type">
                Certificate type *
              </label>
              <select
                id="resale_type"
                className={input}
                value={resale.type}
                onChange={(event) => updateResale('type', event.target.value)}
              >
                {CERTIFICATE_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={label} htmlFor="resale_number">
                Resale certificate / permit number {certificateRequired ? '*' : ''}
              </label>
              <input
                id="resale_number"
                className={input}
                value={resale.number}
                onChange={(event) => updateResale('number', event.target.value)}
                placeholder={state?.numberPattern?.includes('\\d{11}') ? '32012345678' : 'As printed on the certificate'}
                required={certificateRequired}
              />
              <p className={hint}>{state?.numberHint ?? 'This is the registration number the state issued to your business.'}</p>
            </div>

            <div>
              <label className={label} htmlFor="resale_expires">
                Expiry date, if the certificate has one
              </label>
              <input
                id="resale_expires"
                type="date"
                className={input}
                value={resale.expiresOn}
                onChange={(event) => updateResale('expiresOn', event.target.value)}
              />
            </div>

            <div className="sm:col-span-2">
              <label className={label} htmlFor="resale_holder">
                Legal name printed on the certificate
              </label>
              <input
                id="resale_holder"
                className={input}
                value={resale.holderName}
                onChange={(event) => updateResale('holderName', event.target.value)}
                placeholder={form.company || 'Exactly as printed'}
              />
              <p className={hint}>
                Leave this blank if the certificate is in your legal business name above. If it is in a trading or
                parent-company name, type that name so the reviewer can compare them.
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-charcoal/10 bg-warm-white p-5 mb-8">
            <div className="flex items-start justify-between gap-4 mb-3">
              <div>
                <p className="text-sm font-semibold text-charcoal">Certificate file {certificateRequired ? '*' : ''}</p>
                <p className={hint}>PDF, JPG or PNG. Up to 5 MB. A clear phone photo is fine.</p>
              </div>
              <ShieldCheck className="w-5 h-5 text-himalayan flex-shrink-0" aria-hidden />
            </div>

            <input
              ref={fileInput}
              id="certificate"
              type="file"
              accept="application/pdf,image/jpeg,image/png"
              className="sr-only"
              onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}
            />

            {file ? (
              <div className="flex items-center justify-between gap-3 rounded-xl bg-white border border-charcoal/10 px-4 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <FileText className="w-5 h-5 text-himalayan flex-shrink-0" aria-hidden />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-charcoal truncate">{file.name}</p>
                    <p className="text-xs text-charcoal-light">{(file.size / 1024).toFixed(0)} KB</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setFile(null);
                    if (fileInput.current) fileInput.current.value = '';
                  }}
                  className="p-2 rounded-lg hover:bg-charcoal/5 text-charcoal-light"
                  aria-label="Remove certificate file"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-charcoal/15 text-sm font-medium text-charcoal hover:border-himalayan transition-colors"
              >
                <Upload className="w-4 h-4" /> Choose certificate file
              </button>
            )}

            {!certificateRequired ? (
              <p className="mt-3 text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-xl p-3 leading-relaxed">
                {STATE_AUTHORITIES[resale.state]?.name} issues no state resale certificate. Continue with a signed
                exemption statement, or attach any business registration you hold — our team reviews it by hand.
              </p>
            ) : null}

            <p className="mt-3 text-xs text-charcoal-light leading-relaxed">
              Your file is stored privately and is only opened by the wholesale review team.
            </p>

            {state ? (
              <a
                href={state.lookupUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-himalayan hover:underline"
              >
                {state.authority} — certificate requirements
                <ExternalLink className="w-3.5 h-3.5" aria-hidden />
              </a>
            ) : null}
          </div>

          {/* --------------------------- declaration ----------------------------- */}
          <h2 className="font-serif text-xl font-semibold text-charcoal mb-4">Authorised applicant declaration</h2>
          <div className="rounded-2xl border border-charcoal/10 p-5 mb-5">
            <label className="flex items-start gap-3 text-sm text-charcoal cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded border-charcoal/30 text-himalayan focus:ring-himalayan/40"
                checked={accepted}
                onChange={(event) => setAccepted(event.target.checked)}
                required
              />
              <span className="leading-relaxed">
                I am authorised to act for this business and to claim resale on its behalf. The information and the
                certificate I have supplied are accurate, and I will tell Himalayan Koh if the certificate expires or is
                withdrawn. I understand wholesale pricing is for resale and is activated only after Himalayan Koh
                approves the account.
              </span>
            </label>

            <div className="mt-4">
              <label className={label} htmlFor="signed_name">
                Type your full name to sign
              </label>
              <input
                id="signed_name"
                className={input}
                value={signedName}
                onChange={(event) => setSignedName(event.target.value)}
                placeholder={form.contact_name || 'Your full name'}
                autoComplete="name"
              />
              <p className={hint}>
                Signed electronically on {new Date().toISOString().slice(0, 10)}. Your typed name is recorded with the
                application.
              </p>
            </div>
          </div>

          <label className="flex items-start gap-3 mb-8 text-sm text-charcoal">
            <input type="checkbox" required checked={privacyAccepted} onChange={(event) => setPrivacyAccepted(event.target.checked)} className="mt-1 h-4 w-4" />
            <span>I acknowledge the <Link href="/privacy" target="_blank" className="underline text-himalayan">Privacy Policy</Link> and the private storage of my application and certificate for review.</span>
          </label>
          <p className="text-sm text-charcoal-light mb-6">Wholesale requires at least four full cases of each selected product. Case quantities and availability are confirmed per SKU. After approval, new buyers receive a secure WordPress link to set their password. Existing customers keep their current password.</p>

          {/* ------------------------------- buying ------------------------------ */}
          <h2 className="font-serif text-xl font-semibold text-charcoal mb-5">What you buy</h2>
          <div className="grid sm:grid-cols-2 gap-5 mb-8">
            <div>
              <label className={label} htmlFor="monthly_volume">
                Expected monthly volume
              </label>
              <input
                id="monthly_volume"
                className={input}
                value={form.monthly_volume}
                onChange={(event) => update('monthly_volume', event.target.value)}
                placeholder="e.g. 2 pallets, or 4 containers"
              />
            </div>
            <div>
              <label className={label} htmlFor="annual_volume">
                Expected annual volume
              </label>
              <input
                id="annual_volume"
                className={input}
                value={form.annual_volume}
                onChange={(event) => update('annual_volume', event.target.value)}
                placeholder="e.g. 20 containers"
              />
            </div>
            <div>
              <label className={label} htmlFor="logistics_mode">
                Usual shipment size
              </label>
              <select
                id="logistics_mode"
                className={input}
                value={form.logistics_mode}
                onChange={(event) => update('logistics_mode', event.target.value)}
              >
                {LOGISTICS_MODES.map((mode) => (
                  <option key={mode.value} value={mode.value}>
                    {mode.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={label} htmlFor="destination_port">
                Preferred destination port
              </label>
              <input
                id="destination_port"
                className={input}
                value={form.destination_port}
                onChange={(event) => update('destination_port', event.target.value)}
                placeholder="e.g. Houston, or USHOU"
              />
            </div>
            <div className="sm:col-span-2">
              <label className={label} htmlFor="interested_products">
                Products you are interested in
              </label>
              <textarea
                id="interested_products"
                rows={3}
                className={input}
                value={form.interested_products}
                onChange={(event) => update('interested_products', event.target.value)}
                placeholder="Fine grain 25 kg bags, salt licks, bath salt, private label…"
              />
            </div>
            <div className="sm:col-span-2">
              <label className={label} htmlFor="notes">
                Anything else we should know
              </label>
              <textarea
                id="notes"
                rows={3}
                className={input}
                value={form.notes}
                onChange={(event) => update('notes', event.target.value)}
              />
            </div>
          </div>

          {error ? (
            <div
              role="alert"
              className="flex items-start gap-3 p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 mb-5"
            >
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <p className="text-sm leading-relaxed">{error}</p>
            </div>
          ) : null}

          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-7 py-3.5 bg-himalayan text-white rounded-full font-semibold hover:bg-himalayan-dark transition-colors disabled:opacity-60"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {submitting ? 'Submitting…' : 'Submit application'}
          </button>

          <p className="text-sm text-charcoal-light mt-5">
            Already have an account?{' '}
            <Link href="/wholesale/login" className="text-himalayan font-semibold hover:underline">
              Sign in instead
            </Link>
            .
          </p>
        </form>
      </div>
    </div>
  );
}
