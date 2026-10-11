import Link from 'next/link';
import { motion } from 'framer-motion';
import { PenLine, Search, Sparkles, RefreshCw, AlertTriangle, ShoppingBag } from 'lucide-react';

/**
 * The editorial policy, in plain language.
 *
 * Written because the About page described an "Editorial & Resource Board" the
 * audits could not identify, and because a store that publishes guides about the
 * products it also sells owes the reader a straight account of who writes them.
 * Every paragraph here describes something the business actually does; nothing
 * claims a veterinary reviewer, a laboratory, or independent editorial control
 * that has not been engaged.
 */

const LAST_REVIEWED = 'October 11, 2026';

const SECTIONS: { title: string; icon: typeof PenLine; paragraphs: string[] }[] = [
  {
    title: 'Who writes our guides',
    icon: PenLine,
    paragraphs: [
      'Our guides and product descriptions are written by the Himalayan Koh team — the same company that runs the shop. We say so on every article: the byline is the company, not an invented person, and the “cross-checked by” line names a second company team, not an external expert.',
      'No named author with a personal byline is published unless a real person supplies a real name and biography. We have not engaged a veterinarian, animal nutritionist, or other credentialed reviewer, so no page claims one.',
    ],
  },
  {
    title: 'How we research',
    icon: Search,
    paragraphs: [
      'Product facts — weight, grain size, packaging, what is included — come from the individual WooCommerce product listing, which is the record the shop actually sells from. If the listing does not state something, the guide does not either.',
      'General explanations use published sources we can point to: university cooperative extension material, government food-safety and agriculture publications, and peer-reviewed or food-science literature. Where a guide leans on a source for a factual claim, the article names it or links it so you can read it yourself.',
      'We do not publish laboratory results, test reports, or measurement data we have not received from a laboratory. Where a buyer needs a specification or Certificate of Analysis we do not hold, the page says to ask, and we answer from what the supplier and exporter have provided.',
    ],
  },
  {
    title: 'Where AI is used, and where it is not',
    icon: Sparkles,
    paragraphs: [
      'We may use AI tools for research synthesis, first drafts, formatting, and proofreading. That is allowed, and we are saying so rather than leaving you to guess.',
      'AI output is not published as fact. A person edits every article, checks claims against the sources above, removes anything the source does not support, and rewrites text that reads as machine-generated filler. No first-hand experience, test, farm, or customer is invented by a model or by us.',
    ],
  },
  {
    title: 'Facts we will not publish',
    icon: AlertTriangle,
    paragraphs: [
      'We do not state or imply that a salt product cures, treats, prevents, reverses, or relieves any disease or condition — in people or in animals. Salt is sodium chloride with naturally occurring trace minerals; it is not a medicine, and it is not a complete mineral supplement.',
      'We do not invent certifications, awards, star ratings, reviews, veterinary approval, laboratory testing, or supplier audits. Customer testimonials are published only as the customer wrote them; if a genuine testimonial describes a health outcome we cannot stand behind, it is left off the page rather than softened into something the customer did not say.',
    ],
  },
  {
    title: 'Corrections and update dates',
    icon: RefreshCw,
    paragraphs: [
      'When a product, price, policy, or factual explanation changes, we update the article and change its “last updated” date. We keep the article URL when it is still useful rather than deleting and republishing it at a new address.',
      'If something is wrong, tell us: email sales@himalayankoh.com with the page address and what is incorrect. We check it against the source and correct the page, or remove the claim if we cannot support it. A correction that changes the substance of a guide is made in the article itself, not hidden in a footnote.',
    ],
  },
  {
    title: 'Commercial interests, stated plainly',
    icon: ShoppingBag,
    paragraphs: [
      'Himalayan Koh sells the products these guides discuss. The guides are therefore promotional and informational at the same time, and we do not pretend otherwise: product links go to our own store, and we earn money when you buy from us.',
      'What that does not change: an advertiser does not choose which products we write about, a paid placement is never presented as an independent recommendation, and no product is described as better than the listing supports. We do not publish affiliate links to other retailers, and no page on this site earns a commission from one.',
      'Where a guide is about animal use, it stays factual: what the product is, how much it weighs, and that animals need continuous access to fresh water. Guidance about a specific animal’s diet or health belongs with your own veterinarian or extension service, not with our shop.',
    ],
  },
];

export default function EditorialPolicyPage() {
  return (
    <div className="min-h-screen bg-warm-white">
      <div className="bg-gradient-to-r from-charcoal to-charcoal-light py-10 md:py-14">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 text-center">
          <motion.span
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-block px-3 py-1 bg-himalayan/20 text-himalayan text-xs font-semibold tracking-wider uppercase rounded-full mb-3"
          >
            Editorial Standards
          </motion.span>
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="font-serif text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-3 leading-tight"
          >
            Editorial Policy
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-white/75 text-base md:text-lg max-w-3xl mx-auto leading-relaxed"
          >
            Who writes our guides, what we cite, how AI is used, how corrections work, and the
            commercial interest we are not hiding.
          </motion.p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 md:py-12">
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 md:p-8 space-y-8 text-charcoal leading-relaxed">
          <p className="text-sm text-charcoal-light">
            Last reviewed: <time dateTime="2026-10-11">{LAST_REVIEWED}</time>
          </p>

          {SECTIONS.map((section) => (
            <section key={section.title} className="space-y-3">
              <div className="flex items-center gap-3 text-himalayan">
                <section.icon className="w-6 h-6 flex-shrink-0" />
                <h2 className="font-serif text-2xl font-bold text-charcoal">{section.title}</h2>
              </div>
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph} className="text-charcoal-light">
                  {paragraph}
                </p>
              ))}
            </section>
          ))}

          <hr className="border-gray-100" />

          <section className="space-y-3">
            <h2 className="font-serif text-2xl font-bold text-charcoal">Related pages</h2>
            <ul className="list-disc list-outside pl-6 space-y-1.5 text-sm">
              <li>
                <Link href="/disclaimer" className="text-himalayan hover:underline">
                  Product, veterinary &amp; health disclaimer
                </Link>{' '}
                — the limits on what a salt product can be said to do.
              </li>
              <li>
                <Link href="/about" className="text-himalayan hover:underline">
                  About Himalayan Koh
                </Link>{' '}
                — who we are, where the salt comes from, and how it is handled in Houston.
              </li>
              <li>
                <Link href="/blog" className="text-himalayan hover:underline">
                  Guides &amp; articles
                </Link>{' '}
                — the content this policy governs.
              </li>
              <li>
                <Link href="/terms" className="text-himalayan hover:underline">
                  Terms of Service
                </Link>{' '}
                and{' '}
                <Link href="/privacy" className="text-himalayan hover:underline">
                  Privacy Policy
                </Link>
                .
              </li>
            </ul>
          </section>

          <p className="text-sm text-charcoal-light">
            Questions, corrections, or a factual error to report? Email{' '}
            <a href="mailto:sales@himalayankoh.com" className="text-himalayan hover:underline font-semibold">
              sales@himalayankoh.com
            </a>{' '}
            or call (832) 224-6466, Monday–Friday, 9AM–6PM CT.
          </p>
        </div>
      </div>
    </div>
  );
}
