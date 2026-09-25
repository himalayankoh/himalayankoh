'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AlertCircle, CheckCircle2, Loader2, Send } from 'lucide-react';

/**
 * The wholesale application form.
 *
 * ## What it collects, and why nothing more
 *
 * A trade account needs to know what the business is, who the buyer is, how to reach
 * them, what they sell into and roughly how much they move. It deliberately does not
 * ask for a tax number, a bank reference or a credit check: those are things to ask
 * for *after* a person has read the application and decided to trade, and collecting
 * them here would make an unauthenticated public form a place where financial data is
 * stored.
 *
 * ## The fields the server requires are marked, and the rest are genuinely optional
 *
 * The submit button is not disabled on an incomplete form — that leaves a visitor
 * hunting for which field is missing. Instead the whole form submits and the server's
 * message names what is missing, which is one place to keep the rule.
 *
 * ## The confirmation is a reference, not a promise
 *
 * A successful submission returns a reference the applicant can quote in an email. It
 * does **not** claim the account was opened: the status the response carries is
 * `PENDING`, and the copy says a person will reply.
 */

interface FormState {
  company: string;
  contact_name: string;
  email: string;
  phone: string;
  country: string;
  website: string;
  business_type: string;
  monthly_volume: string;
  annual_volume: string;
  interested_products: string;
  logistics_mode: string;
  destination_country: string;
  destination_port: string;
  notes: string;
}

const EMPTY: FormState = {
  company: '',
  contact_name: '',
  email: '',
  phone: '',
  country: '',
  website: '',
  business_type: 'distributor',
  monthly_volume: '',
  annual_volume: '',
  interested_products: '',
  logistics_mode: 'either',
  destination_country: '',
  destination_port: '',
  notes: '',
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

const label = 'block text-sm font-medium text-charcoal mb-1.5';
const input =
  'w-full px-4 py-2.5 rounded-xl border border-charcoal/15 bg-white text-charcoal placeholder:text-charcoal-light/50 focus:outline-none focus:ring-2 focus:ring-himalayan/40 focus:border-himalayan';

export default function WholesaleApplyPage() {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [reference, setReference] = useState('');
  const [message, setMessage] = useState('');

  function update<K extends keyof FormState>(key: K, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      const response = await fetch('/api/wholesale/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = (await response.json().catch(() => ({}))) as {
        reference?: string;
        message?: string;
        error?: string;
      };

      if (!response.ok) {
        setError(data.error || `The application could not be submitted (HTTP ${response.status}).`);
        return;
      }

      setReference(data.reference || '');
      setMessage(data.message || 'Your application is with our wholesale team.');
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (reference) {
    return (
      <div className="min-h-screen bg-warm-white flex items-center justify-center px-4 py-20">
        <div className="max-w-xl w-full bg-white rounded-3xl border border-charcoal/8 shadow-sm p-8 md:p-10 text-center">
          <div className="w-14 h-14 rounded-2xl bg-green-50 flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-7 h-7 text-green-600" />
          </div>
          <h1 className="font-serif text-3xl font-bold text-charcoal mb-3">Application received</h1>
          <p className="text-charcoal-light leading-relaxed mb-6">{message}</p>
          <div className="bg-warm-white rounded-2xl p-5 mb-7">
            <p className="text-xs uppercase tracking-widest text-charcoal-light mb-1">Your reference</p>
            <p className="font-mono text-lg font-semibold text-charcoal">{reference}</p>
          </div>
          <p className="text-sm text-charcoal-light leading-relaxed mb-7">
            Quote this reference if you email us. Applications are answered by a person, usually within a few working
            days.
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
      <div className="bg-gradient-to-r from-charcoal to-charcoal-light py-14 md:py-20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <h1 className="font-serif text-4xl md:text-5xl font-bold text-white mb-4">Wholesale account application</h1>
          <p className="text-white/70 text-lg leading-relaxed">
            Tell us about your business. Fields marked with an asterisk are required; everything else helps us answer
            you faster.
          </p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 md:py-16">
        <form onSubmit={submit} className="bg-white rounded-3xl border border-charcoal/8 shadow-sm p-6 md:p-9">
          <h2 className="font-serif text-xl font-semibold text-charcoal mb-5">Business</h2>
          <div className="grid sm:grid-cols-2 gap-5 mb-8">
            <div className="sm:col-span-2">
              <label className={label} htmlFor="company">
                Business / company name *
              </label>
              <input
                id="company"
                className={input}
                value={form.company}
                onChange={(event) => update('company', event.target.value)}
                placeholder="Himalayan Foods LLC"
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

            <div>
              <label className={label} htmlFor="country">
                Country *
              </label>
              <input
                id="country"
                className={input}
                value={form.country}
                onChange={(event) => update('country', event.target.value)}
                placeholder="United States"
              />
            </div>

            <div className="sm:col-span-2">
              <label className={label} htmlFor="website">
                Company website
              </label>
              <input
                id="website"
                className={input}
                value={form.website}
                onChange={(event) => update('website', event.target.value)}
                placeholder="https://"
              />
            </div>
          </div>

          <h2 className="font-serif text-xl font-semibold text-charcoal mb-5">Contact</h2>
          <div className="grid sm:grid-cols-2 gap-5 mb-8">
            <div>
              <label className={label} htmlFor="contact_name">
                Buyer / contact name *
              </label>
              <input
                id="contact_name"
                className={input}
                value={form.contact_name}
                onChange={(event) => update('contact_name', event.target.value)}
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
              />
            </div>
            <div className="sm:col-span-2">
              <label className={label} htmlFor="phone">
                Phone
              </label>
              <input
                id="phone"
                className={input}
                value={form.phone}
                onChange={(event) => update('phone', event.target.value)}
              />
            </div>
          </div>

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
              <label className={label} htmlFor="destination_country">
                Destination country
              </label>
              <input
                id="destination_country"
                className={input}
                value={form.destination_country}
                onChange={(event) => update('destination_country', event.target.value)}
              />
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
