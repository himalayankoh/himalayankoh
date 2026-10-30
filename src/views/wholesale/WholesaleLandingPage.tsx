import Link from 'next/link';
import {
  ArrowRight,
  Boxes,
  CheckCircle2,
  FileText,
  Handshake,
  Package,
  ShieldCheck,
} from 'lucide-react';

/**
 * The wholesale front door (simplified).
 * Focuses on case-pack / box wholesale ordering for retailers and distributors.
 */
export default function WholesaleLandingPage() {
  return (
    <div className="min-h-screen bg-warm-white">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-charcoal via-charcoal to-charcoal-light py-12 md:py-16">
        <div className="absolute inset-0 opacity-[0.06] bg-[radial-gradient(circle_at_20%_20%,white,transparent_45%)]" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6">
          <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-8 lg:gap-12 items-center">
            <div>
              <span className="inline-flex items-center gap-2 px-4 py-1.5 bg-himalayan/20 text-himalayan text-xs font-semibold tracking-widest uppercase rounded-full mb-3">
                <Handshake className="w-3.5 h-3.5" />
                Wholesale &amp; Trade
              </span>
              <h1 className="font-serif text-3xl sm:text-4xl md:text-5xl font-bold text-white leading-[1.1] mb-4">
                Himalayan pink salt, by the box.
              </h1>
              <p className="text-white/80 text-base md:text-lg leading-relaxed max-w-xl mb-6">
                Direct wholesale supply for verified retailers, grocery stores, and distributors. 
                Enjoy 30% wholesale pricing with a 4-box minimum per SKU.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <Link
                  href="/wholesale/apply"
                  className="inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-himalayan text-white rounded-full font-semibold hover:bg-himalayan-dark transition-colors shadow-md"
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
              <p className="text-white/50 text-sm mt-4">
                Already approved? Sign in to view pricing and submit inquiries.
              </p>
            </div>

            {/* Visual Box Specifications Card */}
            <div className="bg-white/[0.07] border border-white/12 rounded-3xl p-6 sm:p-8 backdrop-blur">
              <div className="flex items-center gap-2 mb-4 text-himalayan font-semibold text-sm uppercase tracking-wider">
                <Boxes className="w-4 h-4" />
                <span>Standard Case Packs</span>
              </div>
              <h2 className="font-serif text-2xl font-bold text-white mb-4">
                Wholesale Pack Sizes
              </h2>
              <div className="space-y-3">
                <div className="bg-white/[0.05] border border-white/10 rounded-2xl p-4 flex items-center justify-between">
                  <div>
                    <h3 className="text-white font-semibold text-base">2 lb Lick Salt</h3>
                    <p className="text-white/60 text-xs mt-0.5">Animal Salt Lick with Rope</p>
                  </div>
                  <div className="text-right">
                    <span className="text-himalayan font-bold text-sm block">6 pieces / box</span>
                    <span className="text-white/40 text-xs">Min. 4 boxes (24 pcs)</span>
                  </div>
                </div>

                <div className="bg-white/[0.05] border border-white/10 rounded-2xl p-4 flex items-center justify-between">
                  <div>
                    <h3 className="text-white font-semibold text-base">6 lb Lick Salt</h3>
                    <p className="text-white/60 text-xs mt-0.5">Animal Salt Lick with Rope</p>
                  </div>
                  <div className="text-right">
                    <span className="text-himalayan font-bold text-sm block">4 pieces / box</span>
                    <span className="text-white/40 text-xs">Min. 4 boxes (16 pcs)</span>
                  </div>
                </div>

                <div className="bg-white/[0.05] border border-white/10 rounded-2xl p-4 flex items-center justify-between">
                  <div>
                    <h3 className="text-white font-semibold text-base">3 lb Salt Pouch</h3>
                    <p className="text-white/60 text-xs mt-0.5">Fine Grain Livestock Salt (10x10x6 in box)</p>
                  </div>
                  <div className="text-right">
                    <span className="text-himalayan font-bold text-sm block">6 pieces / box</span>
                    <span className="text-white/40 text-xs">Min. 4 boxes (24 pcs)</span>
                  </div>
                </div>

                <div className="bg-white/[0.05] border border-white/10 rounded-2xl p-4 flex items-center justify-between">
                  <div>
                    <h3 className="text-white font-semibold text-base">6 lb Salt Pouch</h3>
                    <p className="text-white/60 text-xs mt-0.5">Fine / Coarse Grain (10x10x6 in box)</p>
                  </div>
                  <div className="text-right">
                    <span className="text-himalayan font-bold text-sm block">3 pieces / box</span>
                    <span className="text-white/40 text-xs">Min. 4 boxes (12 pcs)</span>
                  </div>
                </div>

                <div className="bg-white/[0.05] border border-white/10 rounded-2xl p-4 flex items-center justify-between">
                  <div>
                    <h3 className="text-white font-semibold text-base">30 lb Rock Salt</h3>
                    <p className="text-white/60 text-xs mt-0.5">Commercial Bag / Cattle Block</p>
                  </div>
                  <div className="text-right">
                    <span className="text-himalayan font-bold text-sm block">1 piece / box</span>
                    <span className="text-white/40 text-xs">Min. 4 boxes (4 pcs)</span>
                  </div>
                </div>
              </div>
              <p className="text-white/60 text-xs mt-4 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-himalayan shrink-0" />
                30% wholesale discount automatically calculated on portal.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 3 Simple Steps */}
      <section className="py-12 md:py-16 max-w-7xl mx-auto px-4 sm:px-6">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <h2 className="font-serif text-3xl font-bold text-charcoal mb-2">How wholesale ordering works</h2>
          <p className="text-charcoal-light text-sm md:text-base">
            Simple, streamlined ordering for verified retailers in three easy steps.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          <div className="bg-white rounded-2xl border border-charcoal/8 p-6 shadow-sm">
            <span className="font-serif text-3xl font-bold text-himalayan/40">01</span>
            <h3 className="font-semibold text-charcoal text-lg mt-2 mb-2">Apply for an account</h3>
            <p className="text-sm text-charcoal-light leading-relaxed">
              Submit your U.S. business details and state resale certificate in a few minutes.
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-charcoal/8 p-6 shadow-sm">
            <span className="font-serif text-3xl font-bold text-himalayan/40">02</span>
            <h3 className="font-semibold text-charcoal text-lg mt-2 mb-2">Quick review</h3>
            <p className="text-sm text-charcoal-light leading-relaxed">
              Our trade team verifies your resale certificate and activates your wholesale portal access.
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-charcoal/8 p-6 shadow-sm">
            <span className="font-serif text-3xl font-bold text-himalayan/40">03</span>
            <h3 className="font-semibold text-charcoal text-lg mt-2 mb-2">Order by the box</h3>
            <p className="text-sm text-charcoal-light leading-relaxed">
              Sign in to view wholesale rates, select full boxes, and submit your order inquiries directly.
            </p>
          </div>
        </div>
      </section>

      {/* Trade Requirements / Rules */}
      <section className="bg-white border-y border-charcoal/8 py-10 md:py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="rounded-2xl border border-himalayan/20 bg-himalayan-lighter/30 p-6 md:p-8">
            <h2 className="font-serif text-2xl font-bold text-charcoal mb-2">Approved trade accounts only</h2>
            <p className="text-charcoal-light text-sm mb-6 max-w-3xl">
              Himalayan Koh supplies verified businesses and resellers. Wholesale prices are confidential and visible once approved.
            </p>
            <div className="grid gap-6 md:grid-cols-3">
              <div className="flex gap-3">
                <ShieldCheck className="w-5 h-5 text-himalayan flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-charcoal text-sm mb-1">Business verification is mandatory</h3>
                  <p className="text-xs text-charcoal-light leading-relaxed">
                    Every account requires a state resale certificate, reviewed and verified before activation.
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <FileText className="w-5 h-5 text-himalayan flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-charcoal text-sm mb-1">Orders begin as inquiries</h3>
                  <p className="text-xs text-charcoal-light leading-relaxed">
                    Select your products and box counts. Nothing is charged online when submitting an inquiry.
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <Package className="w-5 h-5 text-himalayan flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-charcoal text-sm mb-1">Invoice and payment terms</h3>
                  <p className="text-xs text-charcoal-light leading-relaxed">
                    We confirm stock and freight, then issue an invoice for payment outside the portal.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="py-12 md:py-16 max-w-7xl mx-auto px-4 sm:px-6">
        <div className="bg-charcoal rounded-3xl p-8 md:p-10 text-white text-center max-w-3xl mx-auto">
          <h2 className="font-serif text-2xl md:text-3xl font-bold mb-3">Open a wholesale account</h2>
          <p className="text-white/70 text-sm md:text-base leading-relaxed mb-6 max-w-xl mx-auto">
            Ready to stock Himalayan Koh salt? Apply with your business information and resale certificate today.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
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
              Wholesale customer sign-in
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
