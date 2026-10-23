import Link from 'next/link';
import {
  ArrowRight,
  Boxes,
  Container,
  FileText,
  Globe2,
  Handshake,
  Layers,
  Package,
  Scale,
  ShieldCheck,
  Truck,
} from 'lucide-react';

/**
 * The wholesale front door.
 *
 * ## What this page may and may not claim
 *
 * It describes a real business — Himalayan pink salt bought by the pallet and the
 * container — so it states things the business can stand behind: the origin, the ways
 * you can buy (pallet, part-container, FCL), that pricing is per volume break, and
 * that freight is confirmed per quotation. It does not print a freight rate, a
 * delivery time to a port it has not quoted, or a "from $X" figure that no supplier
 * has given. A buyer landing here must not be able to read a number the business has
 * not actually offered.
 *
 * ## Why the auth path is stated twice
 *
 * Existing wholesale customers have a sign-in; new ones apply. Putting both in the
 * header and again before the process list is deliberate: the most common failure on
 * a B2B landing page is an existing customer filling in the application form because
 * that is the only button they found.
 */

const PILLARS = [
  {
    icon: Container,
    title: 'Full container loads',
    body: '20ft, 40ft and 40ft high cube, loaded to the weight or the volume limit — whichever binds first, stated on the quotation.',
  },
  {
    icon: Boxes,
    title: 'Mixed containers',
    body: 'Select available livestock and edible-salt products from the approved catalogue. The plan shows estimated cartons, pallets, kilos and CBM per product.',
  },
  {
    icon: Layers,
    title: 'Pallets and part loads',
    body: 'Request a pallet count rather than a full container. We confirm product packing measurements before committing to a load plan.',
  },
  {
    icon: Globe2,
    title: 'Origin to destination port',
    body: 'Priced on EXW, FOB, CFR or CIF basis, with the charges each basis includes written out line by line.',
  },
];

const PROCESS = [
  {
    step: '01',
    title: 'Apply for an account',
    body: 'Tell us who you are, where you sell, and roughly what volume you move. It takes a few minutes.',
  },
  {
    step: '02',
    title: 'We review it',
    body: 'A person at Himalayan Koh reads every application. We may ask one or two questions before we approve.',
  },
  {
    step: '03',
    title: 'Sign in to the portal',
    body: 'Approved buyers get tier pricing, the wholesale catalog, container planning and their own quotations.',
  },
  {
    step: '04',
    title: 'Build a quotation',
    body: 'Mix products, set quantities, pick a destination. We confirm freight and issue a firm quotation you can accept.',
  },
];

const TERMS = [
  'Volume price breaks are shown per product — the break applies to the quantity, not to the order history.',
  'Freight, insurance, port charges and duty are confirmed on each quotation. An estimate is always labelled as an estimate.',
  'Quotations carry a validity date. Once it passes, the quotation is marked expired rather than quietly re-priced.',
  'Packing is per the factory’s carton and pallet profile, and the loading plan states which figures were used.',
];

export default function WholesaleLandingPage() {
  return (
    <div className="min-h-screen bg-warm-white">
      <section className="relative overflow-hidden bg-gradient-to-br from-charcoal via-charcoal to-charcoal-light py-10 md:py-14">
        <div className="absolute inset-0 opacity-[0.06] bg-[radial-gradient(circle_at_20%_20%,white,transparent_45%)]" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6">
          <div className="grid lg:grid-cols-[1.15fr_0.85fr] gap-8 items-center">
            <div>
              <span className="inline-flex items-center gap-2 px-4 py-1.5 bg-himalayan/20 text-himalayan text-xs font-semibold tracking-widest uppercase rounded-full mb-3">
                <Handshake className="w-3.5 h-3.5" />
                Wholesale &amp; Trade
              </span>
              <h1 className="font-serif text-3xl sm:text-4xl md:text-5xl font-bold text-white leading-[1.08] mb-4">
                Himalayan pink salt, by the box.
              </h1>
              <p className="text-white/75 text-base md:text-lg leading-relaxed max-w-2xl mb-6">
                We supply retailers, distributors and importers from the salt range at Khewra. Wholesale starts at four
                full boxes per selected product for 30% wholesale pricing. 2 lb: 6 pieces per box. 6 lb: 4 pieces per box. 30 lb: 1 piece per box. Availability and freight are confirmed per SKU.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <Link
                  href="/wholesale/apply"
                  className="inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-himalayan text-white rounded-full font-semibold hover:bg-himalayan-dark transition-colors"
                >
                  Apply for a wholesale account
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <Link
                  href="/wholesale/login"
                  className="inline-flex items-center justify-center gap-2 px-7 py-3.5 border border-white/25 text-white rounded-full font-semibold hover:bg-white/10 transition-colors"
                >
                  Wholesale customer sign-in
                </Link>
              </div>
              <p className="text-white/45 text-sm mt-5">
                Already approved? Sign in for tier pricing and your own quotations.
              </p>
            </div>

            <div className="bg-white/[0.06] border border-white/12 rounded-3xl p-7 backdrop-blur">
              <h2 className="font-serif text-2xl font-semibold text-white mb-5">What you can plan on</h2>
              <ul className="space-y-4 text-white/80 text-sm leading-relaxed">
                <li className="flex gap-3">
                  <Scale className="w-5 h-5 text-himalayan flex-shrink-0 mt-0.5" />
                  <span>Carton, pallet and container estimates use the configured packing profile. Missing measurements are identified for review.</span>
                </li>
                <li className="flex gap-3">
                  <Truck className="w-5 h-5 text-himalayan flex-shrink-0 mt-0.5" />
                  <span>Ocean freight quoted per lane and container type, with the rate’s source and validity shown.</span>
                </li>
                <li className="flex gap-3">
                  <FileText className="w-5 h-5 text-himalayan flex-shrink-0 mt-0.5" />
                  <span>Every quotation is a snapshot: the prices, freight and exchange rate stay as they were quoted.</span>
                </li>
                <li className="flex gap-3">
                  <ShieldCheck className="w-5 h-5 text-himalayan flex-shrink-0 mt-0.5" />
                  <span>One account, your own quotations and orders — visible only to you and to us.</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-10 md:py-14">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {PILLARS.map((pillar) => (
            <div key={pillar.title} className="bg-white rounded-2xl border border-charcoal/8 p-6 shadow-sm">
              <div className="w-11 h-11 rounded-xl bg-himalayan/10 flex items-center justify-center mb-4">
                <pillar.icon className="w-5 h-5 text-himalayan" />
              </div>
              <h3 className="font-semibold text-charcoal mb-2">{pillar.title}</h3>
              <p className="text-sm text-charcoal-light leading-relaxed">{pillar.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-white border-y border-charcoal/8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 md:py-14">
          <h2 className="font-serif text-3xl md:text-4xl font-bold text-charcoal mb-3">How a wholesale order works</h2>
          <p className="text-charcoal-light mb-6 max-w-3xl">
            Four steps, and a person at Himalayan Koh on every one of them.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {PROCESS.map((entry) => (
              <div key={entry.step} className="relative pl-5 border-l-2 border-himalayan/25">
                <span className="font-serif text-3xl font-bold text-himalayan/30">{entry.step}</span>
                <h3 className="font-semibold text-charcoal mt-2 mb-2">{entry.title}</h3>
                <p className="text-sm text-charcoal-light leading-relaxed">{entry.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* What approval actually requires. Stated before the CTA so a buyer knows
          whether they can qualify before starting a form — and so nobody reads the
          catalog as an open checkout. */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 pt-10 md:pt-14">
        <div className="rounded-3xl border border-himalayan/20 bg-himalayan-lighter/40 p-6 md:p-8">
          <h2 className="font-serif text-2xl md:text-3xl font-bold text-charcoal mb-2">Approved trade accounts only</h2>
          <p className="text-charcoal-light mb-6 max-w-3xl">
            Himalayan Koh supplies verified retailers, distributors and resellers. Wholesale prices are not public:
            they are activated for a business after its application and resale certificate have been reviewed.
          </p>
          <div className="grid gap-5 md:grid-cols-3">
            <div className="flex gap-3">
              <ShieldCheck className="w-5 h-5 text-himalayan flex-shrink-0 mt-0.5" aria-hidden />
              <div>
                <h3 className="font-semibold text-charcoal mb-1">Business verification is mandatory</h3>
                <p className="text-sm text-charcoal-light leading-relaxed">
                  Every application includes a state resale certificate. We compare it with the business details and
                  confirm it with the issuing state&apos;s own records before an account is approved.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <FileText className="w-5 h-5 text-himalayan flex-shrink-0 mt-0.5" aria-hidden />
              <div>
                <h3 className="font-semibold text-charcoal mb-1">Orders begin as inquiries</h3>
                <p className="text-sm text-charcoal-light leading-relaxed">
                  You select products and quantities and send an inquiry. Nothing is charged online, and stock is not
                  reserved by submitting an inquiry.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <Handshake className="w-5 h-5 text-himalayan flex-shrink-0 mt-0.5" aria-hidden />
              <div>
                <h3 className="font-semibold text-charcoal mb-1">Invoice and payment terms follow approval</h3>
                <p className="text-sm text-charcoal-light leading-relaxed">
                  Our team confirms availability, shipping and taxes, then sends an invoice with payment instructions.
                  Payment is made against that invoice, never inside the portal.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-10 md:py-14">
        <div className="grid lg:grid-cols-2 gap-8">
          <div>
            <h2 className="font-serif text-3xl md:text-4xl font-bold text-charcoal mb-6">How we price</h2>
            <ul className="space-y-4">
              {TERMS.map((term) => (
                <li key={term} className="flex gap-3 text-charcoal-light leading-relaxed">
                  <Package className="w-5 h-5 text-himalayan flex-shrink-0 mt-0.5" />
                  <span>{term}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="bg-charcoal rounded-3xl p-8 md:p-10 text-white">
            <h2 className="font-serif text-2xl md:text-3xl font-bold mb-4">Open a wholesale account</h2>
            <p className="text-white/70 leading-relaxed mb-7">
              Apply with your business details, U.S. business address and state resale certificate. Applications and
              certificates are reviewed by hand — we approve buyers we can actually supply, so we will ask questions if
              something is unclear.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Link
                href="/wholesale/apply"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-himalayan text-white rounded-full font-semibold hover:bg-himalayan-dark transition-colors"
              >
                Apply for a wholesale account
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="/wholesale/login"
                className="inline-flex items-center justify-center px-6 py-3 border border-white/20 rounded-full font-semibold hover:bg-white/10 transition-colors"
              >
                Sign in
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
