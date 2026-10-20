import Link from 'next/link';
import { motion } from 'framer-motion';
import { Check, Gem, Heart, Droplets, Leaf, Timer, Utensils, ShieldCheck, MapPin, Phone, Mail, UserCheck, AlertTriangle } from 'lucide-react';
import { legacyImage } from '@/lib/images/legacyAssets';

/**
 * AboutPage tells the verified story of Himalayan Koh:
 * - Direct geological sourcing from the Salt Range / Khewra region in Pakistan.
 * - Processing, quality inspection, and dispatch from our Houston, Texas facility.
 * - Factual, non-inflated nutritional and mineral disclosures.
 * - Transparent business identity and leadership placeholders.
 */

const bulletPoints = [
  'Naturally occurring trace minerals including iron, potassium, and magnesium',
  'Unrefined — no anti-caking chemicals, artificial bleaches, or synthetic additives',
  'A fine-grain edible jar, horse licks and livestock bags in the sizes listed',
  'Moisture-protective packaging dispatched directly from Houston, Texas',
];

const benefits = [
  {
    title: 'Natural Trace Elements',
    description: 'Ancient geological seams preserve natural trace minerals, giving each crystal its authentic rose-pink hue.',
    icon: Gem,
  },
  {
    title: 'Characteristic Iron Minerals',
    description: 'Natural mineral veins produce tones from light peach to deep ruby. No artificial dyes or bleaching agents.',
    icon: Heart,
  },
  {
    title: 'Listed Grain Sizes',
    description: 'Choose the grain stated on each product; ask us for a specification when exact sizing matters.',
    icon: Droplets,
  },
  {
    title: 'Ingredient Information',
    description: 'Read the individual product label for ingredients, intended use and iodization information.',
    icon: Leaf,
  },
  {
    title: 'Durable & Non-Perishable',
    description: 'Naturally resistant to spoilage when stored in dry conditions, providing lasting stability for kitchens and ranches.',
    icon: Timer,
  },
  {
    title: 'Kitchen & Pasture Uses',
    description: 'Food-grade crystals for the kitchen, and dense mineral blocks for livestock herds.',
    icon: Utensils,
  },
];

/**
 * Customer testimonials carried over from the live HimalayanKoh.com About Us page.
 *
 * Two testimonials have been taken off this page rather than rewritten.
 *
 * The first described horses that were "prone to chronic colic" improving after
 * the licks were introduced. The second — Darolyn Butler's, quoted in full in
 * `docs/production/content-corrections/removed-testimonial-darolyn-butler.md` —
 * credited a change of salt with her horses being "the healthier and able to
 * thrive in this Texas heat". Both are genuine customers' own accounts, and that
 * is the problem: publishing them has the site associate a salt product with a
 * health outcome it cannot substantiate, which is the one thing a testimonial
 * cannot be asked to carry. Rewriting somebody's words to soften them would
 * misquote them, so they are removed instead of edited, and kept in the record
 * above so the decision is auditable. A factual, customer-supplied version can be
 * restored if that customer agrees to one.
 *
 * What remains describes product quality, service and logistics — no health
 * result. The heading labels it as the customers' own comments for that reason.
 */
const testimonials = [
  {
    quote:
      'Just wanted to let everyone know how great the Himalayan Koh team has been to work with. Not only are they very knowledgeable about all the advantages of Himalayan salt, but their products are by far the best salt blocks we have purchased for our deer ranch.',
    name: 'James A. Brenek',
    place: 'Conroe, TX',
  },
];

/**
 * Shown above the quotes. A customer's sentence about their own operation reads
 * as the site's claim about the product unless it is labelled as theirs, so the
 * label is part of publishing it.
 */
const TESTIMONIAL_NOTE =
  'These are our customers\u2019 own comments, published as they gave them, not claims by Himalayan Koh about what a salt product will do.';

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="bg-gradient-to-r from-charcoal to-charcoal-light py-10 md:py-14">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 text-center">
          <motion.span
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-block px-3 py-1 bg-himalayan/20 text-himalayan text-xs font-semibold tracking-wider uppercase rounded-full mb-3"
          >
            About Himalayan Koh
          </motion.span>
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="font-serif text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-3 leading-tight"
          >
            Purity From the Source, Integrity in Every Grain
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-white/75 text-base md:text-lg max-w-2xl mx-auto leading-relaxed"
          >
            Himalayan pink salt for cooking and livestock, sold by our Houston, Texas team.
          </motion.p>
        </div>
      </div>

      {/* Main Content */}
      <section className="py-10 md:py-14 bg-cream">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="grid lg:grid-cols-2 gap-6 lg:gap-10 items-center">
            {/* Image Side */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <div className="relative">
                <div className="rounded-3xl overflow-hidden shadow-2xl shadow-himalayan/10 aspect-[4/3]">
                  <img
                    src={legacyImage('bowlOfSalt')}
                    alt="Coarse unrefined pink Himalayan salt crystals"
                    className="w-full h-full object-cover"
                    loading="lazy"
                    onError={(e) => { (e.target as HTMLImageElement).src = '/images/placeholder-product.svg'; }}
                  />
                </div>
                <div className="hidden sm:block absolute -top-4 -left-4 w-24 h-24 bg-himalayan/10 rounded-full -z-10" />
                <div className="hidden sm:block absolute -bottom-4 -left-8 w-32 h-32 bg-himalayan/5 rounded-full -z-10" />
              </div>
            </motion.div>

            {/* Text Side */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
            >
              <h2 className="font-serif text-2xl sm:text-3xl font-bold text-charcoal mb-4 leading-tight">
                Authentic Salt Sourced for{' '}
                <span className="text-himalayan">Gourmet & Agricultural Excellence</span>
              </h2>
              <div className="space-y-3 text-charcoal-light leading-relaxed text-sm md:text-base">
                <p>
                  Himalayan pink salt is rock salt sourced from Pakistan&apos;s Salt Range, including the Khewra region. Geological origin describes where it comes from; it is not a test of a finished product&apos;s purity.
                </p>
                <p>
                  Our catalog describes unrefined pink salt for two separate uses: edible salt for the kitchen and salt licks or loose salt for animals. Use the product label to choose the right item.
                </p>
                <p>
                  Our retail range includes a fine-grain 16 oz edible jar, a 2 lb horse lick, a 30 lb cattle block, and 6 lb and 45 lb livestock salt. Current prices and availability are shown on each listing.
                </p>
              </div>

              <div className="mt-5 space-y-2">
                {bulletPoints.map((point, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 + i * 0.1 }}
                    className="flex items-center gap-3"
                  >
                    <div className="flex-shrink-0 w-6 h-6 bg-himalayan/10 rounded-full flex items-center justify-center">
                      <Check size={14} className="text-himalayan" />
                    </div>
                    <span className="text-charcoal text-sm font-medium">{point}</span>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-10 md:py-14 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-8"
          >
            <span className="inline-block px-3 py-1 bg-himalayan-lighter text-himalayan text-xs font-semibold tracking-wider uppercase rounded-full mb-3">
              Our Standards
            </span>
            <h2 className="font-serif text-2xl sm:text-3xl md:text-4xl font-bold text-charcoal mb-3">
              What Natural Unrefined Salt Retains
            </h2>
            <p className="text-charcoal-light text-base max-w-2xl mx-auto">
              Authentic mineral composition tailored for specific culinary and agricultural needs.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
            {benefits.map((benefit, i) => (
              <motion.div
                key={benefit.title}
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.08 }}
                whileHover={{ y: -6 }}
                className="group bg-white border border-gray-100 rounded-2xl p-5 hover:shadow-xl hover:shadow-himalayan/10 hover:border-himalayan/20 transition-all duration-500"
              >
                <div className="w-11 h-11 bg-himalayan-lighter rounded-xl flex items-center justify-center text-himalayan mb-3 group-hover:bg-himalayan group-hover:text-white transition-all duration-300">
                  <benefit.icon size={20} />
                </div>
                <h3 className="font-serif text-lg font-bold text-charcoal mb-2">
                  {benefit.title}
                </h3>
                <p className="text-charcoal-light text-sm leading-relaxed">
                  {benefit.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Sourcing & QC Story Section */}
      <section className="py-10 md:py-14 bg-charcoal text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <span className="inline-block px-3 py-1 bg-himalayan/20 text-himalayan text-xs font-semibold tracking-wider uppercase rounded-full mb-3">
              Direct Origin
            </span>
            <h2 className="font-serif text-2xl sm:text-3xl font-bold mb-4">
              Geological Sourcing from the Khewra Salt Range
            </h2>
            <p className="text-white/80 text-base leading-relaxed mb-4">
              Our Himalayan pink salt is sourced from the Salt Range in Punjab, Pakistan, and sold by Himalayan Koh from Houston, Texas.
            </p>
            <p className="text-white/80 text-base leading-relaxed mb-4">
              Packaging and intended use differ by item. Check the product description and label, and contact our team before ordering if you need a particular packaging or quality specification.
            </p>
            <p className="text-white/80 text-base leading-relaxed mb-6">
              We welcome retail, wholesale and bulk inquiries. The information below explains how to choose a product and request supporting documentation.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <a
                href="#quality-standards"
                className="px-5 py-2.5 bg-himalayan hover:bg-himalayan-dark text-white font-semibold rounded-xl transition-all shadow-lg shadow-himalayan/20"
              >
                Quality & Sourcing Standards →
              </a>
              <Link
                href="/disclaimer"
                className="px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white font-semibold rounded-xl transition-all"
              >
                Product Disclaimer →
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Quality & Sourcing Standards — folded in from the former standalone /quality
          page so that route could be retired without losing its substance. */}
      <section id="quality-standards" className="py-10 md:py-14 bg-white border-t border-gray-100 scroll-mt-24">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-8">
            <span className="inline-block px-3 py-1 bg-himalayan-lighter text-himalayan text-xs font-semibold tracking-wider uppercase rounded-full mb-3">
              Quality &amp; Sourcing
            </span>
            <h2 className="font-serif text-2xl sm:text-3xl font-bold text-charcoal mb-3">
              Quality, Sourcing &amp; Verification Standards
            </h2>
            <p className="text-charcoal-light max-w-2xl mx-auto text-base">
              Product labels, appropriate uses, storage guidance and documentation requests.
            </p>
          </div>

          <div className="space-y-7">
            <div>
              <h3 className="font-serif text-xl font-bold text-charcoal mb-2">Origin and Product Evidence</h3>
              <p className="text-charcoal-light text-sm md:text-base leading-relaxed">
                Our listings describe Himalayan pink salt from Pakistan. A claim about origin does not establish the mineral or contaminant content of a specific shipment; that requires appropriate lot-specific evidence.
              </p>
              <p className="text-charcoal-light text-sm md:text-base leading-relaxed mt-2">
                We do not present general descriptions of mining as proof of a supplier audit, worker certification or laboratory result. Ask our team about documentation available for the item you need.
              </p>
            </div>

            <div>
              <h3 className="font-serif text-xl font-bold text-charcoal mb-2">Supplier Vetting &amp; Traceability</h3>
              <ul className="list-disc list-outside pl-6 space-y-2 text-charcoal-light text-sm md:text-base">
                <li><strong className="text-charcoal">Product identity:</strong> use the listing and SKU to identify the item you are ordering.</li>
                <li><strong className="text-charcoal">Intended use:</strong> culinary salt and livestock products are separate ranges.</li>
                <li><strong className="text-charcoal">Specifications:</strong> request the relevant documentation before ordering when a specification is essential.</li>
              </ul>
            </div>

            <div>
              <h3 className="font-serif text-xl font-bold text-charcoal mb-3">Checks for Your Delivery</h3>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="bg-cream p-5 rounded-2xl border border-gray-200/60">
                  <h4 className="font-bold text-charcoal text-base mb-1">Moisture &amp; Seal Integrity</h4>
                  <p className="text-xs text-charcoal-light leading-relaxed">Check packaging on arrival. If it is damaged or incomplete, keep photographs and contact us under our return policy.</p>
                </div>
                <div className="bg-cream p-5 rounded-2xl border border-gray-200/60">
                  <h4 className="font-bold text-charcoal text-base mb-1">Grain and Size</h4>
                  <p className="text-xs text-charcoal-light leading-relaxed">Use the grain and size stated on the individual listing. We do not assign a universal mesh range to every product.</p>
                </div>
                <div className="bg-cream p-5 rounded-2xl border border-gray-200/60">
                  <h4 className="font-bold text-charcoal text-base mb-1">Label and Use</h4>
                  <p className="text-xs text-charcoal-light leading-relaxed">Read the label and choose edible salt for food preparation. Do not use livestock salt as a culinary substitute.</p>
                </div>
                <div className="bg-cream p-5 rounded-2xl border border-gray-200/60">
                  <h4 className="font-bold text-charcoal text-base mb-1">Solid Salt Licks</h4>
                  <p className="text-xs text-charcoal-light leading-relaxed">Use a lick for the animal use stated on its listing. A cattle block is not a cooking slab.</p>
                </div>
              </div>
            </div>

            <div>
              <h3 className="font-serif text-xl font-bold text-charcoal mb-2">Packaging and Dry Storage</h3>
              <p className="text-charcoal-light text-sm md:text-base leading-relaxed mb-2">
                Protect salt from moisture and keep unused products closed and dry. Follow the label and the requirements of the intended use:
              </p>
              <ul className="list-disc list-outside pl-6 space-y-2 text-charcoal-light text-sm md:text-base">
                <li><strong className="text-charcoal">Retail pouches:</strong> keep closed between uses.</li>
                <li><strong className="text-charcoal">Culinary jars:</strong> use clean utensils and replace the lid.</li>
                <li><strong className="text-charcoal">Commercial 45 lb bags:</strong> store off wet ground and protect from rain.</li>
                <li><strong className="text-charcoal">Pasture salt licks:</strong> follow the listing for mounting and keep out of standing water.</li>
              </ul>
            </div>

            <div>
              <h3 className="font-serif text-xl font-bold text-charcoal mb-2">Understanding Natural Mineral Claims</h3>
              <ul className="list-disc list-outside pl-6 space-y-2 text-charcoal-light text-sm md:text-base">
                <li><strong className="text-charcoal">Predominant composition:</strong> pink salt is primarily sodium chloride; a precise composition requires a product-specific report.</li>
                <li><strong className="text-charcoal">Trace elements:</strong> mineral content can vary. A general list of trace elements is not a measurement of our stock.</li>
                <li><strong className="text-charcoal">Parts-per-million realities:</strong> trace-mineral marketing does not turn salt into a medicine or a complete human or livestock mineral program.</li>
              </ul>
            </div>

            <div className="bg-amber-50 border border-amber-200/80 rounded-2xl p-5">
              <p className="flex items-center gap-2 text-amber-800 font-bold text-sm uppercase tracking-wide">
                <AlertTriangle size={18} /> Quality documentation on request
              </p>
              <p className="text-sm text-amber-900 leading-relaxed mt-2">
                For lot-specific documentation or a specification sheet, contact our team before ordering. We will confirm what is available for the item rather than imply that every product carries a laboratory report. Email{' '}
                <a href="mailto:support@himalayankoh.com" className="underline font-semibold">support@himalayankoh.com</a>.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials — carried over from the live HimalayanKoh.com About Us page. */}
      <section className="py-10 md:py-14 bg-cream border-t border-gray-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-8">
            <span className="inline-block px-3 py-1 bg-himalayan-lighter text-himalayan text-xs font-semibold tracking-wider uppercase rounded-full mb-3">
              Testimonials
            </span>
            <h2 className="font-serif text-2xl sm:text-3xl font-bold text-charcoal mb-3">What our customers say</h2>
            <p className="mx-auto max-w-2xl text-xs text-charcoal-light leading-relaxed">{TESTIMONIAL_NOTE}</p>
          </div>
          <div className="grid md:grid-cols-3 gap-5">
            {testimonials.map((item) => (
              <blockquote key={item.name} className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex flex-col">
                <p className="text-sm text-charcoal-light leading-relaxed italic flex-1">&ldquo;{item.quote}&rdquo;</p>
                <footer className="mt-4 pt-3 border-t border-gray-100">
                  <p className="text-sm font-semibold text-charcoal">{item.name}</p>
                  <p className="text-xs text-charcoal-light">{item.place}</p>
                </footer>
              </blockquote>
            ))}
          </div>
        </div>
      </section>

      {/* Leadership & Editorial Trust Section */}
      <section className="py-10 md:py-14 bg-warm-white border-t border-gray-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-8">
            <span className="inline-block px-3 py-1 bg-himalayan-lighter text-himalayan text-xs font-semibold tracking-wider uppercase rounded-full mb-3">
              Leadership & Editorial Team
            </span>
            <h2 className="font-serif text-2xl sm:text-3xl font-bold text-charcoal mb-3">
              Transparency & Customer Commitment
            </h2>
            <p className="text-charcoal-light max-w-2xl mx-auto text-base">
              Himalayan Koh is proudly based in Houston, Texas. Our operations and educational publications are managed by professionals dedicated to authenticity and transparency.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-5 max-w-4xl mx-auto">
            {/* Operations & Sourcing Leadership */}
            <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between">
              <div>
                <div className="w-12 h-12 bg-himalayan-lighter rounded-xl flex items-center justify-center text-himalayan mb-4">
                  <UserCheck size={26} />
                </div>
                <h3 className="font-serif text-lg font-bold text-charcoal mb-1">Operations & Sourcing Team</h3>
                <p className="text-xs font-semibold text-himalayan uppercase tracking-wider mb-3">Supply Chain & Quality Control</p>
                <p className="text-sm text-charcoal-light leading-relaxed mb-3">
                  Handles product and supply inquiries, order coordination and requests for available specifications.
                </p>
              </div>
              <div className="pt-3 border-t border-gray-100 text-xs text-charcoal-light">
                Location: Houston, Texas Facility
              </div>
            </div>

            {/* Editorial & Educational Review */}
            <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between">
              <div>
                <div className="w-12 h-12 bg-himalayan-lighter rounded-xl flex items-center justify-center text-himalayan mb-4">
                  <ShieldCheck size={26} />
                </div>
                <h3 className="font-serif text-lg font-bold text-charcoal mb-1">Himalayan Koh Editorial Team</h3>
                <p className="text-xs font-semibold text-himalayan uppercase tracking-wider mb-3">Guides, Product Copy & Sources</p>
                <p className="text-sm text-charcoal-light leading-relaxed mb-3">
                  Writes and updates the buying guides and product descriptions, working from the product listings and from published extension, government and food-science sources where a claim needs one. It is the company&apos;s own team, not an independent reviewer, and it is not a veterinary or nutrition advisory panel.
                </p>
              </div>
              <div className="pt-3 border-t border-gray-100 text-xs text-charcoal-light">
                How we research and correct our guides:{' '}
                <Link href="/editorial-policy" className="font-semibold text-himalayan hover:underline">
                  Editorial Policy
                </Link>
              </div>
            </div>
          </div>

          {/* Direct Verified Contact Bar */}
          <div className="mt-8 bg-white rounded-2xl p-5 md:p-6 border border-gray-200/70 shadow-sm">
            <div className="grid sm:grid-cols-3 gap-5 text-center sm:text-left">
              <div className="flex items-center gap-4 justify-center sm:justify-start">
                <div className="w-10 h-10 bg-himalayan-lighter rounded-xl flex items-center justify-center text-himalayan flex-shrink-0">
                  <MapPin size={18} />
                </div>
                <div>
                  <p className="text-xs font-semibold text-charcoal-light uppercase">Operating Facility</p>
                  <p className="text-sm font-bold text-charcoal">12620 FM 1960 W Ste A-4, Houston, TX</p>
                </div>
              </div>

              <div className="flex items-center gap-4 justify-center sm:justify-start">
                <div className="w-10 h-10 bg-himalayan-lighter rounded-xl flex items-center justify-center text-himalayan flex-shrink-0">
                  <Phone size={18} />
                </div>
                <div>
                  <p className="text-xs font-semibold text-charcoal-light uppercase">Customer Service</p>
                  <a href="tel:8322246466" className="text-sm font-bold text-charcoal hover:text-himalayan">
                    (832) 224-6466
                  </a>
                </div>
              </div>

              <div className="flex items-center gap-4 justify-center sm:justify-start">
                <div className="w-10 h-10 bg-himalayan-lighter rounded-xl flex items-center justify-center text-himalayan flex-shrink-0">
                  <Mail size={18} />
                </div>
                <div>
                  <p className="text-xs font-semibold text-charcoal-light uppercase">Direct Inquiries</p>
                  <a href="mailto:support@himalayankoh.com" className="text-sm font-bold text-charcoal hover:text-himalayan">
                    support@himalayankoh.com
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
