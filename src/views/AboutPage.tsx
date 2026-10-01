import Link from 'next/link';
import { motion } from 'framer-motion';
import { Check, Gem, Heart, Droplets, Leaf, Timer, Utensils, ShieldCheck, MapPin, Phone, Mail, UserCheck } from 'lucide-react';
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
  'Precise grain sizing: fine, medium, coarse, plus carved salt blocks and licks',
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
    title: 'Uniform Grain Sorting',
    description: 'Carefully screened for consistency: fine for culinary baking, medium for table grinders, and coarse for curing.',
    icon: Droplets,
  },
  {
    title: 'Zero Chemical Additives',
    description: '100% natural unrefined rock salt. Free of artificial anti-caking agents (such as sodium ferrocyanide or aluminosilicate).',
    icon: Leaf,
  },
  {
    title: 'Durable & Non-Perishable',
    description: 'Naturally resistant to spoilage when stored in dry conditions, providing lasting stability for kitchens and ranches.',
    icon: Timer,
  },
  {
    title: 'Kitchen & Pasture Uses',
    description: 'Food-grade crystals for culinary arts, hand-carved slabs for cooking, and dense mineral blocks for livestock herds.',
    icon: Utensils,
  },
];

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
            Authentic Himalayan pink rock salt, inspected, packed, and dispatched from Houston, Texas.
          </motion.p>
        </div>
      </div>

      {/* Main Content */}
      <section className="py-10 md:py-14 bg-cream">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="grid lg:grid-cols-2 gap-6 lg:gap-10 items-center">
            {/* Image Side */}
            <motion.div
              initial={{ opacity: 0, x: -40 }}
              animate={{ opacity: 1, x: 0 }}
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
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
            >
              <h2 className="font-serif text-2xl sm:text-3xl font-bold text-charcoal mb-4 leading-tight">
                Authentic Salt Sourced for{' '}
                <span className="text-himalayan">Gourmet & Agricultural Excellence</span>
              </h2>
              <div className="space-y-3 text-charcoal-light leading-relaxed text-sm md:text-base">
                <p>
                  Himalayan pink salt was deposited over 250 million years ago during the Precambrian era as ancient ocean beds evaporated. Protected beneath tectonic mountain strata in Pakistan&apos;s Salt Range, this mineral deposit remained shielded from modern industrial pollutants.
                </p>
                <p>
                  At Himalayan Koh, we preserve this natural geological mineral in its unrefined state. We never chemically bleach, strip, or alter our salt crystals. What the rock naturally holds — essential sodium chloride balanced with trace minerals like iron, potassium, and magnesium — is exactly what reaches your home or farm.
                </p>
                <p>
                  We supply salt the way chefs, ranchers, and families actually use it: fine grain for balanced culinary seasoning, medium for table grinders, coarse crystals for brining, dense hand-carved slabs for cooking, and weather-hardy blocks for equine and livestock herds.
                </p>
              </div>

              <div className="mt-5 space-y-2">
                {bulletPoints.map((point, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
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
              Our Himalayan rose pink salt originates from the ancient Khewra salt mines, situated in the foothills of the Salt Range in Punjab, Pakistan. We work directly with licensed mining partners who practice ethical extraction and traditional craftsmanship.
            </p>
            <p className="text-white/80 text-base leading-relaxed mb-4">
              Upon maritime arrival in the United States, every batch is received at our facility in Houston, Texas. Our team conducts physical inspections for moisture barriers, granulometry consistency, and purity before packaging into sealed, food-safe containers.
            </p>
            <p className="text-white/80 text-base leading-relaxed mb-6">
              We welcome wholesale, retail distribution, and bulk commercial inquiries. For full details on our quality-assurance framework and laboratory protocols, visit our dedicated sourcing guide.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Link
                href="/quality"
                className="px-5 py-2.5 bg-himalayan hover:bg-himalayan-dark text-white font-semibold rounded-xl transition-all shadow-lg shadow-himalayan/20"
              >
                Quality & Sourcing Standards →
              </Link>
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
                  Oversees direct supplier auditing in the Salt Range, transatlantic freight logistics, and warehouse quality inspections at our Houston distribution center.
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
                <h3 className="font-serif text-lg font-bold text-charcoal mb-1">Editorial & Resource Board</h3>
                <p className="text-xs font-semibold text-himalayan uppercase tracking-wider mb-3">Agricultural & Culinary Education</p>
                <p className="text-sm text-charcoal-light leading-relaxed mb-3">
                  Researches and reviews practical guides on livestock mineral management, equine electrolyte replenishment, and culinary salt block techniques to ensure factual accuracy.
                </p>
              </div>
              <div className="pt-3 border-t border-gray-100 text-xs text-charcoal-light">
                Review Standard: Human Fact-Checked Against Extension Guidelines
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
                  <a href="mailto:sales@himalayankoh.com" className="text-sm font-bold text-charcoal hover:text-himalayan">
                    sales@himalayankoh.com
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
