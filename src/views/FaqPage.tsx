import { useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, HelpCircle } from 'lucide-react';

/**
 * The business's own FAQ, migrated from the production site.
 *
 * The answers are production's wording, because they are the answers a customer has
 * already been given. One question was framed around a product name ("Deer Salt
 * blocks") for the same salt block sold under different names; it is asked here by
 * what it is. Everything else — the return window, the 15-day refund processing, the
 * 1–2 day dispatch, the accepted cards, the trademark statement — is unchanged.
 */

interface Faq {
  question: string;
  answer: string;
}

const faqs: Faq[] = [
  {
    question: 'What is your criteria for returns?',
    answer:
      'We can accept returns only if the product is unopened and still in its original packaging. We accept returns for damaged products or mistaken orders. Free shipping is not included in the return unless the product was faulty or damaged on arrival.',
  },
  {
    question: 'What is your time period for returns?',
    answer: 'Please make sure you contact us within 30 days of your order date.',
  },
  {
    question: 'How much time is required to process a return?',
    answer:
      'Refunds are issued in the same manner that the purchase was made (credit card, check, and so on). Free shipping is not included in the return unless the product was faulty or damaged on arrival. It normally takes around 15 days to process a return.',
  },
  {
    question: 'Where do I send a return request, and where do returns go?',
    answer:
      'Email sales@himalayankoh.com or call (832) 224-6466 to open a return request. Because returns require prior Return Merchandise Authorization (RMA), our support team will provide you with authorized return instructions and the appropriate receiving facility address when approving your request.',
  },
  {
    question: 'How long does it take you to process an order for shipping?',
    answer:
      'Most orders are packaged and shipped from our Houston, Texas warehouse within 1–2 business days. The delivery date depends on the distance your package has to travel from our facility.',
  },
  {
    question: 'What payment options are available for purchase?',
    answer:
      'We accept Visa, Mastercard, American Express and Discover online. If you would rather not enter your card details online, call (832) 224-6466 and we will be happy to assist you.',
  },
  {
    question: 'Can I use Himalayan salt blocks and crystals for bath and beauty?',
    answer:
      'Yes. Our Himalayan salt products are safe for bath and beauty use, including bath soaks and salt scrubs.',
  },
  {
    question: 'Do you supply wholesale?',
    answer:
      'Yes — we provide wholesale supplies, including bulk bags, blocks and lumps, and can arrange orders shipping outside the United States. Call (832) 224-6466 to discuss a bulk or wholesale order.',
  },
  {
    question: 'Is HimalayanKoh a registered trademark?',
    answer:
      'HimalayanKoh is a registered trademark, protecting our salt brand name and logo as used on our website and goods. HimalayanKoh.com retains exclusive rights to mark its products; no one else is allowed to use our logo, name or slogan in the USA. No claim is made to the exclusive right to use "HIMALAYAN" apart from the mark as shown in our logo. The English translation of the word "KOH" in the mark is "Mountain".',
  },
  {
    question: 'My question is not answered here.',
    answer:
      'No problem — send it to sales@himalayankoh.com or call us on (832) 224-6466 and we will help.',
  },
];

function FaqItem({ faq, index }: { faq: Faq; index: number }) {
  const [open, setOpen] = useState(index === 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4, delay: Math.min(index * 0.04, 0.3) }}
      className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-4 text-left px-6 py-5 hover:bg-cream/60 transition-colors"
      >
        <span className="font-serif text-lg font-bold text-charcoal">{faq.question}</span>
        <ChevronDown
          size={20}
          className={`flex-shrink-0 text-himalayan transition-transform duration-300 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            <p className="px-6 pb-6 text-charcoal-light leading-relaxed">{faq.answer}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function FaqPage() {
  return (
    <div className="min-h-screen bg-warm-white">
      <div className="bg-gradient-to-r from-charcoal to-charcoal-light py-10 md:py-14">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 text-center">
          <motion.span
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-block px-3 py-1 bg-himalayan/20 text-himalayan text-xs font-semibold tracking-wider uppercase rounded-full mb-3"
          >
            How We Help
          </motion.span>
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="font-serif text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-3 leading-tight"
          >
            Frequently Asked Questions
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-white/75 text-base md:text-lg max-w-2xl mx-auto leading-relaxed"
          >
            Returns, shipping, payment and the questions we are asked most about
            Himalayan pink salt
          </motion.p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 md:py-12">
        <div className="space-y-4">
          {faqs.map((faq, i) => (
            <FaqItem key={faq.question} faq={faq} index={i} />
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mt-8 bg-himalayan rounded-2xl p-6 text-center text-white"
        >
          <HelpCircle size={28} className="mx-auto mb-4" />
          <h2 className="font-serif text-2xl font-bold mb-2">Still have a question?</h2>
          <p className="text-white/80 mb-6">
            We answer by phone and email during business hours, Monday to Friday, 8:00 AM to
            5:00 PM CST.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/contact"
              className="inline-flex items-center justify-center px-6 min-h-11 bg-white text-himalayan font-semibold rounded-xl hover:bg-white/90 transition-colors"
            >
              Contact us
            </Link>
            <a
              href="tel:8322246466"
              className="inline-flex items-center justify-center px-6 min-h-11 bg-white/10 hover:bg-white/20 text-white font-semibold rounded-xl transition-colors"
            >
              (832) 224-6466
            </a>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
