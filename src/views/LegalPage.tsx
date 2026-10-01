import Link from 'next/link';
import { motion } from 'framer-motion';

/**
 * The policy pages, carrying the business's approved wording.
 *
 * Contact details and return protocols are aligned with approved business identity:
 * - General business address: 12620 FM 1960 W Ste A-4, Houston, TX 77065
 * - Phone: (832) 224-6466
 * - Email: sales@himalayankoh.com
 * - Returns: Require prior authorization; customers contact support for return instructions.
 */

const BUSINESS_NAME = 'Himalayan Koh';
const BUSINESS_ADDRESS = '12620 FM 1960 W Ste A-4, Houston, TX 77065';
const STORE_PHONE = '(832) 224-6466';
const SUPPORT_EMAIL = 'sales@himalayankoh.com';

interface LegalPageProps {
  type: 'terms' | 'privacy' | 'return' | 'shipping';
}

interface Subsection {
  heading: string;
  body?: string;
  bullets?: string[];
}

interface Section {
  title: string;
  intro?: string;
  body?: string;
  bullets?: string[];
  subsections?: Subsection[];
  outro?: string;
  link?: { href: string; label: string };
}

const content: Record<LegalPageProps['type'], { eyebrow: string; title: string; description: string; sections: Section[] }> = {
  privacy: {
    eyebrow: 'Your Privacy',
    title: 'Privacy Policy',
    description:
      'Effective Date: August 2, 2026. At Himalayan Koh, we value your privacy and are committed to protecting your personal information. This Privacy Policy explains what information we collect, how we use it, and the choices you have when using our website.',
    sections: [
      {
        title: 'Information We Collect',
        bullets: [
          'Name',
          'Billing and shipping address',
          'Email address',
          'Phone number',
          'Payment information (processed securely through our payment providers)',
          'Order history',
          'IP address, browser type, and device information',
          'Website usage information through cookies and analytics',
        ],
      },
      {
        title: 'Checkout Options',
        subsections: [
          {
            heading: 'Guest Checkout',
            body: 'You do not need to create an account to make a purchase. Customers may complete their orders using Guest Checkout. We collect only the information necessary to process, ship, and support the order.',
          },
          {
            heading: 'Create an Account',
            bullets: [
              'Customers who prefer to create an account may register during checkout.',
              'View order history.',
              'Save billing and shipping information for faster future purchases.',
              'Track current and past orders.',
              'Manage account information.',
            ],
          },
        ],
        outro:
          'Whether you choose Guest Checkout or create an account, your personal information is collected, stored, and protected in accordance with this Privacy Policy.',
      },
      {
        title: 'How We Use Your Information',
        bullets: [
          'Process and fulfill your orders.',
          'Communicate regarding your order or customer service requests.',
          'Improve our website and customer experience.',
          'Prevent fraud and unauthorized transactions.',
          'Comply with legal obligations.',
          'Send promotional emails if you have opted in (you may unsubscribe at any time).',
        ],
      },
      {
        title: 'Payment Security',
        body: 'Payments are processed securely through trusted third-party payment processors. Himalayan Koh does not store your complete credit or debit card information on our servers.',
      },
      {
        title: 'Cookies',
        body: 'Our website uses cookies to remember your preferences, improve website performance, analyze website traffic, and enhance your shopping experience. You may disable cookies through your browser settings, although some website features may not function properly.',
      },
      {
        title: 'Advertising, Google AdSense & Third-Party Vendors',
        intro: 'To support our educational publishing and content development, our website may display online advertisements delivered by third-party advertising partners, including Google AdSense. Please note the following disclosures regarding advertising technologies and data practices:',
        bullets: [
          'Third-party vendors, including Google, may use cookies to serve advertisements based on a user’s prior visits to this website or other websites across the Internet.',
          'Google’s use of advertising cookies enables it and its partners to serve personalized or non-personalized advertisements to users based on their browsing activity where permitted by applicable law.',
          'Users may opt out of personalized advertising by visiting Google Ads Settings (https://adssettings.google.com) or through third-party industry opt-out portals such as www.aboutads.info.',
          'If non-personalized ads are selected or required by region, cookies and mobile identifiers may still be used to combat fraud and abuse, measure ad impressions, frequency cap ads, and provide aggregated reporting.',
          'Where required by regional data protection laws (such as in the European Economic Area, UK, or specific U.S. states), user consent is gathered prior to deploying optional advertising cookies.',
          'Please note: Google AdSense integration is configured for future editorial monetization and compliance readiness; advertising partners do not receive access to your private customer account login details or payment credentials.',
        ],
      },
      {
        title: 'Sharing Your Information',
        bullets: [
          'We do not sell or rent your personal information.',
          'We may share your information only with trusted service providers, including payment processors, shipping carriers, website hosting providers, and analytics services. These providers receive only the information necessary to perform their services.',
        ],
      },
      {
        title: 'Data Security',
        body: 'We use reasonable administrative, technical, and physical safeguards to protect your personal information. While no method of transmission over the Internet is completely secure, we strive to protect your information using industry-standard security practices.',
      },
      {
        title: 'Your Rights',
        body: 'Depending on your location, you may request access to, correction of, or deletion of your personal information where permitted by law, and you may opt out of marketing communications.',
      },
      {
        title: 'Third-Party Links',
        body: 'Our website may contain links to third-party websites. We are not responsible for the privacy practices or content of those websites.',
      },
      {
        title: 'Changes to This Privacy Policy',
        body: 'We may update this Privacy Policy from time to time. Any changes will be posted on this page with an updated effective date.',
      },
      {
        title: 'Contact Us',
        intro: 'If you have any questions about this Privacy Policy or how we handle your information, please contact us:',
        bullets: [
          `Email: ${SUPPORT_EMAIL}`,
          `Phone: ${STORE_PHONE}`,
          `Mailing Address: ${BUSINESS_NAME}, ${BUSINESS_ADDRESS}`,
        ],
      },
    ],
  },
  terms: {
    eyebrow: 'Terms',
    title: 'Terms of Service',
    description:
      'The terms and conditions governing the use of this website and all purchases made through Himalayan Koh.',
    sections: [
      {
        title: 'Agreement to Terms',
        body: 'By accessing or using the Himalayan Koh website and purchasing our products, you agree to be bound by these Terms of Service. If you do not agree to all terms and conditions, please do not use this site or purchase products from us.',
      },
      {
        title: 'Website Use & Eligibility',
        body: 'You may use this website only for lawful purposes and in accordance with these Terms. You represent that you are at least the age of majority in your jurisdiction of residence, or that you have given us your consent to allow any of your minor dependents to use this site under your supervision.',
      },
      {
        title: 'Product Information & Pricing',
        body: 'We make every reasonable effort to display product descriptions, specifications, and images accurately. However, natural variations in color, texture, and grain size are inherent to genuine Himalayan rock salt products. All prices are listed in U.S. Dollars and are subject to change without prior notice. We reserve the right to correct pricing errors before processing orders.',
      },
      {
        title: 'Orders, Acceptance & Cancellation',
        body: 'An order confirmation receipt does not signify our final acceptance of your order. We reserve the right to limit order quantities, refuse service, or cancel orders at our sole discretion, including cases of suspected fraud or pricing inaccuracies. If your order is canceled after payment has been processed, a full refund will be issued promptly.',
      },
      {
        title: 'Payment Processing',
        body: 'Payment must be received in full before an order is dispatched. We accept major credit and debit cards (Visa, MasterCard, American Express, Discover) processed securely through authorized third-party payment gateways. Himalayan Koh does not store complete cardholder payment data on our servers.',
      },
      {
        title: 'Shipping & Delivery',
        body: 'Orders are packed and dispatched from our warehouse facility in Houston, Texas. Delivery times provided at checkout are estimates and are not guaranteed delivery dates. Himalayan Koh is not liable for carrier transit delays, severe weather, or address delivery errors provided by the customer.',
        link: { href: '/shipping', label: 'View Full Shipping & Delivery Policy' },
      },
      {
        title: 'Returns, Refunds & Damaged Goods',
        body: 'We accept returns on unopened standard retail products in their original packaging within 30 days of the order date. Bulk bags, pallet quantities, and custom-cut salt blocks over 20 lbs are packed to order and are non-returnable. Customers must contact support to obtain prior return authorization.',
        link: { href: '/returns', label: 'View Full Return & Refund Policy' },
      },
      {
        title: 'Customer Account Responsibilities',
        body: 'If you create an account on our website, you are responsible for maintaining the confidentiality of your login credentials and for restricting access to your computer or device. You agree to accept responsibility for all activities that occur under your account.',
      },
      {
        title: 'Prohibited Uses',
        bullets: [
          'Using the site for any unlawful purpose or to solicit others to perform unlawful acts.',
          'Violating any local, state, federal, or international regulations, rules, or laws.',
          'Attempting to interfere with the proper working of the website or circumventing security controls.',
          'Submitting false, fraudulent, or misleading information.',
        ],
      },
      {
        title: 'Intellectual Property',
        body: 'All content on this website, including text, graphics, logos, product names, images, audio clips, and software, is the property of Himalayan Koh or its content suppliers and is protected by United States and international copyright, trademark, and intellectual property laws.',
      },
      {
        title: 'Disclaimer & Limitation of Liability',
        body: 'Our products are sold "as is" and "as available." Information provided regarding mineral composition and general animal husbandry is for educational purposes only and does not constitute veterinary or medical advice. To the fullest extent permitted by applicable law, Himalayan Koh disclaims all warranties, express or implied, and shall not be liable for any indirect, incidental, punitive, or consequential damages arising from website use or product purchase.',
      },
      {
        title: 'Governing Law',
        body: 'These Terms of Service and any separate agreements whereby we provide you goods shall be governed by and construed in accordance with the laws of the State of Texas, without regard to its conflict of law provisions.',
      },
      {
        title: 'Changes to Terms',
        body: 'We reserve the right to update, replace, or modify any part of these Terms of Service at our discretion. Any updates become effective immediately upon posting to this website.',
      },
      {
        title: 'Contact Information',
        intro: 'For questions regarding these Terms of Service, please contact us:',
        bullets: [
          `Email: ${SUPPORT_EMAIL}`,
          `Phone: ${STORE_PHONE}`,
          `Mailing Address: ${BUSINESS_NAME}, ${BUSINESS_ADDRESS}`,
        ],
      },
    ],
  },
  shipping: {
    eyebrow: 'Shipping & Delivery',
    title: 'Shipping & Delivery Policy',
    description:
      'Information on order processing, carrier dispatch, tracking, and delivery timelines for Himalayan Koh products shipped from Houston, Texas.',
    sections: [
      {
        title: 'Dispatch & Order Processing',
        body: 'All standard orders are packaged and dispatched from our warehouse facility in Houston, Texas. Most retail orders are processed and prepared for carrier pickup within 1 to 2 business days (Monday through Friday, excluding national holidays). During peak seasonal periods, processing may take slightly longer.',
      },
      {
        title: 'Delivery Estimates & Carriers',
        intro: 'We ship small package orders via recognized domestic carriers including USPS and FedEx:',
        bullets: [
          'Standard Ground Delivery: Typically 3 to 7 business days depending on transit distance from Houston, Texas.',
          'Delivery timelines displayed during checkout or on carrier portals are estimates, not guaranteed delivery dates.',
          'Shipping charges are calculated at checkout based on total package weight, dimensions, and destination zip code.',
        ],
      },
      {
        title: 'Order Tracking',
        body: 'Once your order has been dispatched, you will receive an automated shipment confirmation email containing your carrier tracking number. Registered account holders can also track order status and transit milestones directly from the My Orders dashboard.',
      },
      {
        title: 'Address Accuracy & Customer Responsibility',
        body: 'Customers are responsible for providing an accurate and complete delivery address, including apartment, suite, or unit numbers. If a package is returned to us due to an incorrect or incomplete address, additional shipping charges may apply to re-dispatch the package.',
      },
      {
        title: 'Carrier Delays, Lost Packages & Damaged Shipments',
        bullets: [
          'Carrier Transit Delays: Adverse weather conditions, carrier mechanical issues, or high volume may cause delays beyond our direct control.',
          'Damaged on Arrival: Please inspect your shipment immediately upon arrival. If an item arrives damaged or broken, contact us within 30 days of the order date with photos of the damaged product and packaging.',
          'Lost Shipments: If your tracking shows delivered but you cannot locate the package, or if tracking has stalled for more than 7 business days, contact our support team immediately so we can initiate a trace with the carrier.',
        ],
      },
      {
        title: 'Bulk, Pallet & Freight Shipments',
        body: 'Bulk granular salt bags (45 lbs), large animal salt blocks, and pallet wholesale orders exceed standard parcel limits and are dispatched via LTL freight. Commercial freight orders require liftgate and delivery appointment coordination. Contact our sales department directly to arrange wholesale freight logistics.',
      },
      {
        title: 'Geographic Scope',
        body: 'Our automated online checkout currently supports shipping to addresses within the contiguous United States. For shipping inquiries to Alaska, Hawaii, U.S. Territories, or international freight destinations, please contact us for a custom shipping quote.',
      },
      {
        title: 'Questions About a Shipment',
        intro: 'If you have questions about your order transit or delivery status, please reach out to us:',
        bullets: [
          `Email: ${SUPPORT_EMAIL}`,
          `Phone: ${STORE_PHONE}`,
          `Facility Address: ${BUSINESS_NAME}, ${BUSINESS_ADDRESS}`,
        ],
      },
    ],
  },
  return: {
    eyebrow: 'Returns & Refunds',
    title: 'Return & Refund Policy',
    description:
      'Our 30-day policy for retail returns, damaged order replacements, and return authorization procedures.',
    sections: [
      {
        title: '30-Day Return Window',
        body: 'We want you to be completely satisfied with your purchase. If you are not satisfied with an eligible retail item, you may request a return within 30 days from your original order date.',
      },
      {
        title: 'Return Eligibility Criteria',
        bullets: [
          'Products must be unopened, unused, and in their original packaging with all protective seals intact.',
          'Items showing signs of use, contamination, moisture exposure, or broken packaging are not eligible for return due to food-safety and mineral purity standards.',
          'Custom orders, bulk 45 lb bags, and wholesale pallets are packed to order and are non-returnable. We recommend ordering smaller retail sample sizes prior to large commercial commitments.',
        ],
      },
      {
        title: 'Damaged, Defective or Incorrect Items',
        body: 'Please inspect your delivery thoroughly upon arrival. If an item arrives damaged, defective, or if you received the incorrect product, notify us within 30 days of the order date. Please provide your order number and clear photographs of the damaged product and shipping box. Upon verification, Himalayan Koh will promptly send a replacement or issue a full refund, including applicable shipping costs.',
      },
      {
        title: 'Return Authorization & Instructions',
        body: 'All returns require prior authorization from Himalayan Koh before items are shipped back. Do not send returns to our general business address without an authorized Return Merchandise Authorization (RMA) number. Please contact our support team via email or phone to receive authorized return instructions and the appropriate returns receiving facility address.',
      },
      {
        title: 'Return Shipping Costs',
        bullets: [
          'For standard customer preference returns (e.g. change of mind, incorrect item ordered), the customer is responsible for all return shipping postage.',
          'We strongly recommend using a trackable shipping carrier with insurance, as Himalayan Koh cannot be responsible for items lost or damaged during return transit.',
          'If the return is due to our error, transit damage, or a defective product, Himalayan Koh will provide a pre-paid return shipping label.',
        ],
      },
      {
        title: 'Refund Processing & Timing',
        bullets: [
          'Once your return is received and inspected at our authorized facility, we will notify you of the approval or rejection of your refund.',
          'Approved refunds are processed to your original payment method within 10 to 15 business days.',
          'Depending on your bank or credit card issuer, it may take an additional 3 to 7 business days for the credit to reflect on your statement.',
          'Original shipping charges are non-refundable unless the return is due to transit damage or fulfillment error.',
        ],
      },
      {
        title: 'Contact Support to Initiate a Return',
        intro: 'To start a return or request assistance with an order, please contact our team:',
        bullets: [
          `Email: ${SUPPORT_EMAIL}`,
          `Phone: ${STORE_PHONE}`,
          `Customer Support Hours: Monday – Friday, 8:00 AM – 5:00 PM CST`,
        ],
      },
    ],
  },
};

export default function LegalPage({ type }: LegalPageProps) {
  const page = content[type];

  return (
    <div className="min-h-screen bg-warm-white">
      <div className="bg-gradient-to-r from-charcoal to-charcoal-light py-10 md:py-14">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 text-center">
          <motion.span
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-block px-3 py-1 bg-himalayan/20 text-himalayan text-xs font-semibold tracking-wider uppercase rounded-full mb-3"
          >
            {page.eyebrow}
          </motion.span>
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="font-serif text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-3 leading-tight"
          >
            {page.title}
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-white/75 text-base md:text-lg max-w-2xl mx-auto leading-relaxed"
          >
            {page.description}
          </motion.p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 md:py-12">
        <div className="bg-white rounded-2xl shadow-md p-6 md:p-8 space-y-8">
          {page.sections.map((section) => (
            <section key={section.title} className="border-b border-gray-100 last:border-b-0 pb-6 last:pb-0">
              <h2 className="font-serif text-xl font-bold text-charcoal mb-3">
                {section.title}
              </h2>
              {section.intro && (
                <p className="text-charcoal-light leading-relaxed mb-3">{section.intro}</p>
              )}
              {section.subsections ? (
                <div className="space-y-4">
                  {section.subsections.map((sub) => (
                    <div key={sub.heading} className="pl-1">
                      <h3 className="font-semibold text-charcoal mb-1.5">{sub.heading}</h3>
                      {sub.bullets ? (
                        <ul className="list-disc list-outside pl-5 space-y-1.5 text-charcoal-light leading-relaxed">
                          {sub.bullets.map((bullet, i) => (
                            <li key={i}>{bullet}</li>
                          ))}
                        </ul>
                      ) : sub.body ? (
                        <p className="text-charcoal-light leading-relaxed">{sub.body}</p>
                      ) : null}
                    </div>
                  ))}
                  {section.outro && (
                    <p className="text-charcoal-light leading-relaxed pt-2">{section.outro}</p>
                  )}
                </div>
              ) : section.bullets ? (
                <ul className="list-disc list-outside pl-5 space-y-1.5 text-charcoal-light leading-relaxed">
                  {section.bullets.map((bullet, i) => (
                    <li key={i}>{bullet}</li>
                  ))}
                </ul>
              ) : section.body ? (
                <p className="text-charcoal-light leading-relaxed">
                  {section.body}
                </p>
              ) : null}
              {section.link && (
                <Link
                  href={section.link.href}
                  className="mt-3 inline-flex text-sm font-semibold text-himalayan hover:underline"
                >
                  {section.link.label} →
                </Link>
              )}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
