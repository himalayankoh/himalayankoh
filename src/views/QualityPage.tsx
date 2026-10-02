import Link from 'next/link';
import { motion } from 'framer-motion';
import { ShieldCheck, Factory, PackageCheck, FileSearch, Layers, AlertTriangle, ArrowRight } from 'lucide-react';

export default function QualityPage() {
  return (
    <div className="min-h-screen bg-warm-white">
      {/* Header */}
      <div className="bg-gradient-to-r from-charcoal to-charcoal-light py-10 md:py-14">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 text-center">
          <motion.span
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-block px-3 py-1 bg-himalayan/20 text-himalayan text-xs font-semibold tracking-wider uppercase rounded-full mb-3"
          >
            Standards & Sourcing
          </motion.span>
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="font-serif text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-3 leading-tight"
          >
            Quality, Sourcing & Verification Standards
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-white/75 text-base md:text-lg max-w-3xl mx-auto leading-relaxed"
          >
            A detailed look at our ethical geological extraction in Pakistan, transatlantic shipping, rigorous incoming inspections, and Houston warehouse packaging protocols.
          </motion.p>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 md:py-12">
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 md:p-8 space-y-7 text-charcoal leading-relaxed">
          
          {/* Section 1: Geological Provenance */}
          <section className="space-y-4">
            <div className="flex items-center gap-3 text-himalayan">
              <Factory className="w-6 h-6 flex-shrink-0" />
              <h2 className="font-serif text-2xl font-bold text-charcoal">Geological Provenance & Mining Ethics</h2>
            </div>
            <p className="text-charcoal-light">
              All Himalayan pink salt distributed by Himalayan Koh originates exclusively from the Salt Range of northern Punjab, Pakistan—principally the historic Khewra mining region. These subterranean salt formations represent remnants of a vast ancient inland sea (the Tethys Sea) that dried up during the late Precambrian to early Cambrian periods, more than 250 million years ago.
            </p>
            <p className="text-charcoal-light">
              Tectonic shifts uplifted the Indo-Gangetic plain, encasing the salt seams under hundreds of meters of protective sedimentary and igneous rock. As a consequence, genuine Himalayan rock salt was sheltered from surface environmental pollutants, microplastics, and modern industrial chemical effluents.
            </p>
            <p className="text-charcoal-light">
              <strong>Ethical Sourcing & Fair Trade:</strong> Himalayan Koh partners strictly with licensed and vetted mining operators who utilize traditional underground room-and-pillar extraction methods. This technique maintains subterranean structural stability without relying on explosive blasting that could fracture crystalline structures or introduce chemical contaminants into the salt face. Miners and artisans who cut, carve, and grade our salt blocks work in safe, ventilated conditions and receive fair, dignified compensation.
            </p>
          </section>

          <hr className="border-gray-100" />

          {/* Section 2: Supplier Vetting Protocol */}
          <section className="space-y-4">
            <div className="flex items-center gap-3 text-himalayan">
              <ShieldCheck className="w-6 h-6 flex-shrink-0" />
              <h2 className="font-serif text-2xl font-bold text-charcoal">Supplier Vetting & Traceability Protocol</h2>
            </div>
            <p className="text-charcoal-light">
              Not all rock salt exported from South Asia satisfies commercial and culinary food-safety standards. Himalayan Koh maintains a rigorous supplier evaluation checklist before entering into supply contracts:
            </p>
            <ul className="list-disc list-outside pl-6 space-y-2 text-charcoal-light">
              <li>
                <strong>Facility Auditing:</strong> Processing facilities must operate dedicated sorting areas equipped with stainless steel handling equipment and optical sorting tables to prevent cross-contamination.
              </li>
              <li>
                <strong>Hygiene & Personal Protective Equipment:</strong> Handlers must adhere to strict sanitation practices during grading, milling, and bagging.
              </li>
              <li>
                <strong>Chain of Custody Documentation:</strong> Every shipping container is tracked from the mine head to Port Qasim in Karachi, maintaining verified bills of lading, customs declarations, and agricultural phytosanitary clearance certificates.
              </li>
            </ul>
          </section>

          <hr className="border-gray-100" />

          {/* Section 3: Incoming Inspection in Houston */}
          <section className="space-y-4">
            <div className="flex items-center gap-3 text-himalayan">
              <PackageCheck className="w-6 h-6 flex-shrink-0" />
              <h2 className="font-serif text-2xl font-bold text-charcoal">Houston Warehouse Receiving & Quality Verification</h2>
            </div>
            <p className="text-charcoal-light">
              When freight containers arrive at our Houston, Texas distribution warehouse, our quality-assurance team executes an intensive multi-step receiving protocol:
            </p>
            <div className="grid sm:grid-cols-2 gap-4 pt-2">
              <div className="bg-cream p-5 rounded-2xl border border-gray-200/60 space-y-2">
                <h3 className="font-bold text-charcoal text-base">Moisture & Seal Integrity</h3>
                <p className="text-xs text-charcoal-light leading-relaxed">
                  Bulk bags and consumer containers are inspected for transit moisture barriers. Any container showing condensation, seal compromise, or carton damage is immediately quarantined.
                </p>
              </div>
              <div className="bg-cream p-5 rounded-2xl border border-gray-200/60 space-y-2">
                <h3 className="font-bold text-charcoal text-base">Granulometry Calibration</h3>
                <p className="text-xs text-charcoal-light leading-relaxed">
                  Milled grains undergo mechanical sieve testing to verify precise mesh size distributions: Fine (0.5–1.0 mm), Medium (1.0–3.0 mm), and Coarse (3.0–6.0 mm).
                </p>
              </div>
              <div className="bg-cream p-5 rounded-2xl border border-gray-200/60 space-y-2">
                <h3 className="font-bold text-charcoal text-base">Physical & Visual Assay</h3>
                <p className="text-xs text-charcoal-light leading-relaxed">
                  Salt crystals are evaluated on clean inspection surfaces under high-lumen illumination to verify clean crystalline translucency and absence of foreign particulate debris.
                </p>
              </div>
              <div className="bg-cream p-5 rounded-2xl border border-gray-200/60 space-y-2">
                <h3 className="font-bold text-charcoal text-base">Structural Integrity of Blocks</h3>
                <p className="text-xs text-charcoal-light leading-relaxed">
                  Solid animal licks and cooking blocks are inspected for compressive strength, drilled rope-hole symmetry, and absence of micro-fractures that could cause premature splitting.
                </p>
              </div>
            </div>
          </section>

          <hr className="border-gray-100" />

          {/* Section 4: Packaging & Climate-Controlled Storage */}
          <section className="space-y-4">
            <div className="flex items-center gap-3 text-himalayan">
              <Layers className="w-6 h-6 flex-shrink-0" />
              <h2 className="font-serif text-2xl font-bold text-charcoal">Packaging Standards & Climate-Controlled Storage</h2>
            </div>
            <p className="text-charcoal-light">
              Sodium chloride is naturally hygroscopic, meaning it attracts and absorbs ambient atmospheric moisture. In humid climates like the Texas Gulf Coast, improper storage leads to clumping, dissolution, and package degradation.
            </p>
            <p className="text-charcoal-light">
              <strong>Our Packaging Solutions:</strong>
            </p>
            <ul className="list-disc list-outside pl-6 space-y-2 text-charcoal-light">
              <li>
                <strong>Retail Pouches:</strong> Multi-layer barrier laminates featuring an airtight zip-lock closure that prevents humidity penetration.
              </li>
              <li>
                <strong>Culinary Jars:</strong> Heavyweight PET jars sealed with tamper-evident induction liners to guarantee freshness from our warehouse to your kitchen.
              </li>
              <li>
                <strong>Commercial 45 lb Bags:</strong> Heavy-gauge woven polypropylene sacks lined with internal polyethylene liners to withstand rough agricultural handling and outdoor freight.
              </li>
              <li>
                <strong>Pasture Salt Licks:</strong> Weatherproof shrink-wrap enclosing durable natural jute hanging ropes, ensuring the lick arrives clean and ready for stable or paddock mounting.
              </li>
            </ul>
          </section>

          <hr className="border-gray-100" />

          {/* Section 5: Natural Mineral Variation & Claim Interpretation */}
          <section className="space-y-4">
            <div className="flex items-center gap-3 text-himalayan">
              <FileSearch className="w-6 h-6 flex-shrink-0" />
              <h2 className="font-serif text-2xl font-bold text-charcoal">Understanding Natural Mineral Claims Factually</h2>
            </div>
            <p className="text-charcoal-light">
              Consumer wellness literature frequently cites that Himalayan pink salt contains &ldquo;84 minerals.&rdquo; At Himalayan Koh, we believe in scientific transparency rather than marketing sensationalism:
            </p>
            <ul className="list-disc list-outside pl-6 space-y-3 text-charcoal-light">
              <li>
                <strong>Predominant Composition:</strong> Himalayan pink salt is primarily sodium chloride (typically 96% to 98% NaCl by dry weight).
              </li>
              <li>
                <strong>Naturally Occurring Trace Elements:</strong> The remaining 2% to 4% consists of naturally occurring mineral compounds, including iron oxide (which imparts the characteristic rose, coral, and amber coloration), calcium, magnesium, potassium, and trace sulfate.
              </li>
              <li>
                <strong>Parts-Per-Million Quantities:</strong> The vast majority of the additional elements cited in scientific spectroscopy exist in infinitesimal parts-per-million (ppm) or parts-per-billion (ppb) concentrations. While these trace elements give Himalayan salt its distinctive flavor complexity and artisanal color, salt should never be consumed in excessive amounts in an attempt to fulfill daily nutritional vitamin or mineral requirements.
              </li>
            </ul>
          </section>

          <hr className="border-gray-100" />

          {/* Section 6: Official Lab Analysis / COA Status */}
          <section className="space-y-4">
            <div className="flex items-center gap-3 text-himalayan">
              <AlertTriangle className="w-6 h-6 flex-shrink-0" />
              <h2 className="font-serif text-2xl font-bold text-charcoal">Laboratory Analysis & Certificate of Analysis (COA) Status</h2>
            </div>
            <div className="bg-amber-50 border border-amber-200/80 rounded-2xl p-6 space-y-3">
              <div className="flex items-center gap-2 text-amber-800 font-bold text-sm uppercase tracking-wide">
                <AlertTriangle size={18} />
                LAB REPORT / COA REQUIRED IF AVAILABLE
              </div>
              <p className="text-sm text-amber-900 leading-relaxed">
                Himalayan Koh maintains documented lot tracing with our exporter network. We are currently consolidating full third-party laboratory spectroscopic test results and heavy metal screening panels (testing for lead, cadmium, arsenic, and mercury below FDA action limits) into an online public portal.
              </p>
              <p className="text-xs text-amber-800/80">
                Commercial wholesale purchasers, feedlot managers, and food service partners requiring formal lot-specific Certificates of Analysis (COA) or technical data specification sheets should contact our technical compliance desk at <a href="mailto:sales@himalayankoh.com" className="underline font-semibold">sales@himalayankoh.com</a>.
              </p>
            </div>
          </section>

          <hr className="border-gray-100" />

          {/* Section 7: Sourcing Questions & Wholesale Inquiries */}
          <section className="space-y-4">
            <h2 className="font-serif text-2xl font-bold text-charcoal">Technical Inquiries & Wholesale Supply</h2>
            <p className="text-charcoal-light">
              For additional questions about our geological provenance, commercial bulk freight specifications, or custom carving capabilities, please contact our Houston facility:
            </p>
            <div className="bg-cream p-6 rounded-2xl border border-gray-200/60 text-sm text-charcoal-light space-y-2">
              <p><strong className="text-charcoal">Operating Entity:</strong> Himalayan Koh</p>
              <p><strong className="text-charcoal">Physical Warehouse:</strong> 12620 FM 1960 W Ste A-4, Houston, TX 77065</p>
              <p><strong className="text-charcoal">Phone:</strong> (832) 224-6466</p>
              <p><strong className="text-charcoal">Email:</strong> sales@himalayankoh.com</p>
            </div>
            <div className="pt-2 flex flex-wrap gap-4">
              <Link href="/products" className="inline-flex items-center gap-2 text-sm font-bold text-himalayan hover:underline">
                Explore Verified Products <ArrowRight size={16} />
              </Link>
              <Link href="/disclaimer" className="inline-flex items-center gap-2 text-sm font-bold text-charcoal hover:underline">
                View Site Disclaimer →
              </Link>
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}
