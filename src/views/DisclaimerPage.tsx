import Link from 'next/link';
import { motion } from 'framer-motion';
import { AlertCircle, FileText, HeartPulse, ShieldAlert, Sparkles, Scale } from 'lucide-react';

export default function DisclaimerPage() {
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
            Legal & Compliance
          </motion.span>
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="font-serif text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-3 leading-tight"
          >
            Website & Product Disclaimer
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-white/75 text-base md:text-lg max-w-3xl mx-auto leading-relaxed"
          >
            Important notices regarding educational information, animal nutrition, dietary use, natural product variability, and editorial standards.
          </motion.p>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 md:py-12">
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 md:p-8 space-y-6 text-charcoal leading-relaxed">
          
          {/* Section 1: General Informational Use */}
          <section className="space-y-4">
            <div className="flex items-center gap-3 text-himalayan">
              <FileText className="w-6 h-6 flex-shrink-0" />
              <h2 className="font-serif text-2xl font-bold text-charcoal">1. General Educational & Informational Purpose</h2>
            </div>
            <p className="text-charcoal-light">
              All information, articles, product descriptions, guides, and educational materials published on the Himalayan Koh website (<strong>https://preview.himalayankoh.com</strong> and <strong>https://himalayankoh.com</strong>) are presented solely for general educational, practical, and informational purposes. While we make every reasonable effort to ensure that content is accurate, up-to-date, and grounded in reputable agricultural and geological references, content on this website does not constitute formal veterinary, nutritional, medical, or legal counsel.
            </p>
            <p className="text-charcoal-light">
              Your use of this website and reliance on any information provided is strictly at your own discretion and risk. Himalayan Koh and its operators disclaim any liability for any loss, adverse reaction, or injury resulting directly or indirectly from the use or application of any material on this website.
            </p>
          </section>

          <hr className="border-gray-100" />

          {/* Section 2: Veterinary & Livestock Nutrition Disclaimer */}
          <section className="space-y-4">
            <div className="flex items-center gap-3 text-himalayan">
              <ShieldAlert className="w-6 h-6 flex-shrink-0" />
              <h2 className="font-serif text-2xl font-bold text-charcoal">2. Veterinary & Livestock Nutrition Disclaimer</h2>
            </div>
            <p className="text-charcoal-light">
              <strong>Not Veterinary Advice:</strong> The educational guides, articles, and product information relating to equine, bovine, deer, or other livestock husbandry do not constitute veterinary medical diagnosis, treatment, or animal nutrition consulting. Never disregard professional veterinary advice or delay seeking it because of something you have read on this website.
            </p>
            <p className="text-charcoal-light">
              <strong>Not a Complete Mineral Program:</strong> Himalayan rock salt licks and bulk coarse rock salt provide essential elemental sodium and chloride, along with trace quantities of naturally occurring minerals. <em>Himalayan salt is not a complete or balanced livestock vitamin and mineral supplement program.</em> Grazing livestock frequently require supplemental macro-minerals (such as phosphorus, calcium, and magnesium) and micro-nutrients (such as copper, selenium, zinc, and cobalt) tailored to local soil conditions, forage analyses, animal age, gestation, lactation, and workload.
            </p>
            <p className="text-charcoal-light">
              <strong>Species-Specific Dietary Considerations:</strong> Nutritional requirements and mineral tolerances vary significantly between animal species. For instance, sheep have a high sensitivity to dietary copper and must not consume mineral products formulated for cattle or horses. Always consult with a licensed veterinarian, animal nutritionist, or your regional agricultural cooperative extension office to formulate an appropriate feeding and mineral management program tailored specifically for your herd, flock, or stable.
            </p>
            <p className="text-charcoal-light">
              <strong>Continuous Water Supply:</strong> Whenever free-choice salt licks or granular salt are offered to livestock, animals must have continuous, unrestricted access to fresh, clean, potable drinking water at all times to prevent salt toxicity and support normal osmotic regulation.
            </p>
          </section>

          <hr className="border-gray-100" />

          {/* Section 3: Human Dietary & Health Disclaimer */}
          <section className="space-y-4">
            <div className="flex items-center gap-3 text-himalayan">
              <HeartPulse className="w-6 h-6 flex-shrink-0" />
              <h2 className="font-serif text-2xl font-bold text-charcoal">3. Culinary & Health Disclaimer</h2>
            </div>
            <p className="text-charcoal-light">
              <strong>No Therapeutic or Medical Claims:</strong> Himalayan Koh edible pink salts are culinary food ingredients composed predominantly of sodium chloride. They are not drugs, supplements, or medical treatments. Statements regarding mineral content or traditional kitchen uses have not been evaluated by the U.S. Food and Drug Administration (FDA). Our products are not intended to diagnose, treat, cure, or prevent any disease, illness, or health condition.
            </p>
            <p className="text-charcoal-light">
              Individuals on sodium-restricted diets, those managing hypertension, cardiovascular disease, renal conditions, or any other medical conditions should consult their licensed physician or registered dietitian regarding their daily sodium intake.
            </p>
          </section>

          <hr className="border-gray-100" />

          {/* Section 4: Natural Product Variability */}
          <section className="space-y-4">
            <div className="flex items-center gap-3 text-himalayan">
              <Scale className="w-6 h-6 flex-shrink-0" />
              <h2 className="font-serif text-2xl font-bold text-charcoal">4. Natural Mineral & Physical Variability</h2>
            </div>
            <p className="text-charcoal-light">
              Himalayan pink salt is a natural geological mineral extracted from ancient salt deposits in the Salt Range region of Pakistan. Because it is an unrefined mineral mined from underground deposits rather than an artificially synthesized chemical compound:
            </p>
            <ul className="list-disc list-outside pl-6 space-y-2 text-charcoal-light">
              <li>
                <strong>Color Variation:</strong> Color naturally ranges from translucent white and light peach to deep rose, ruby, and amber. These coloration differences result from varying concentrations of naturally occurring iron oxide and other trace minerals within natural geologic seams.
              </li>
              <li>
                <strong>Shape & Texture:</strong> Hand-carved salt licks, cooking slabs, and chunks feature natural fissures, crystalline striations, irregular facets, and textural variations that are authentic characteristics of genuine rock salt.
              </li>
              <li>
                <strong>Weight Tolerances:</strong> Hand-hewn licks are sorted by weight brackets (e.g., 3–4 lbs, 12–14 lbs). Minor dimensional and weight variances within published ranges are normal and expected.
              </li>
            </ul>
          </section>

          <hr className="border-gray-100" />

          {/* Section 5: Advertising, Affiliate & Third-Party Disclosures */}
          <section className="space-y-4">
            <div className="flex items-center gap-3 text-himalayan">
              <Sparkles className="w-6 h-6 flex-shrink-0" />
              <h2 className="font-serif text-2xl font-bold text-charcoal">5. Advertising, Affiliate & Sponsorship Disclosures</h2>
            </div>
            <p className="text-charcoal-light">
              <strong>Advertising Disclosure:</strong> In accordance with Federal Trade Commission (FTC) guidelines, this website may display online advertisements, including automated contextual advertisements served by third-party advertising networks such as Google AdSense. Himalayan Koh may receive monetary compensation if users view or click on advertising units. Third-party advertising networks operate independently, and advertisements do not necessarily reflect the views or endorsements of Himalayan Koh.
            </p>
            <p className="text-charcoal-light">
              <strong>Affiliate Links:</strong> Certain links on our educational or blog pages may occasionally be affiliate links. If you make a purchase through an affiliate link, Himalayan Koh may earn a small referral commission at no additional cost to you. We only recommend products or tools that align with our standard of quality.
            </p>
            <p className="text-charcoal-light">
              <strong>Editorial Independence:</strong> Editorial guides, resource articles, and buying recommendations are produced independently. Commercial relationships, ad placements, or potential affiliate partnerships never dictate our factual content standards, safety advisories, or product reviews.
            </p>
          </section>

          <hr className="border-gray-100" />

          {/* Section 6: AI & Editorial Transparency */}
          <section className="space-y-4">
            <div className="flex items-center gap-3 text-himalayan">
              <AlertCircle className="w-6 h-6 flex-shrink-0" />
              <h2 className="font-serif text-2xl font-bold text-charcoal">6. AI Assistance & Editorial Review Standards</h2>
            </div>
            <p className="text-charcoal-light">
              To provide thorough and comprehensive agricultural, geological, and culinary resources, our editorial team may utilize artificial intelligence tools for research synthesis, initial drafting, formatting, and proofreading. All educational content, resource articles, and product guides undergo human editorial review, fact-checking against reputable agricultural extension guidelines, and verification for scientific accuracy prior to publication.
            </p>
            <p className="text-charcoal-light">
              We continually audit our content to prevent unsupported claims, ensure compliance with animal welfare and consumer safety guidelines, and uphold transparent information standards across our digital channels.
            </p>
          </section>

          <hr className="border-gray-100" />

          {/* Section 7: Contact Information */}
          <section className="space-y-4">
            <h2 className="font-serif text-2xl font-bold text-charcoal">7. Contact Information</h2>
            <p className="text-charcoal-light">
              If you have any questions, suggestions, or concerns regarding this Disclaimer or the content published on our website, please reach out to our team:
            </p>
            <div className="bg-cream p-6 rounded-2xl border border-gray-200/60 space-y-2 text-sm text-charcoal-light">
              <p><strong className="text-charcoal">Business Name:</strong> Himalayan Koh</p>
              <p><strong className="text-charcoal">Mailing Address:</strong> 12620 FM 1960 W Ste A-4, Houston, TX 77065</p>
              <p><strong className="text-charcoal">Customer Service Telephone:</strong> (832) 224-6466</p>
              <p><strong className="text-charcoal">General Inquiries & Support Email:</strong> <a href="mailto:sales@himalayankoh.com" className="text-himalayan hover:underline">sales@himalayankoh.com</a></p>
              <p><strong className="text-charcoal">Customer Support Hours:</strong> Monday – Friday, 8:00 AM – 5:00 PM CST</p>
            </div>
            <div className="pt-2">
              <Link href="/terms" className="text-himalayan hover:underline text-sm font-semibold mr-6">
                Terms of Service →
              </Link>
              <Link href="/privacy" className="text-himalayan hover:underline text-sm font-semibold">
                Privacy Policy →
              </Link>
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}
