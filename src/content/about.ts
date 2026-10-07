// ============================================================================
// LUXEDGE — shared /about copy (single source of truth)
//
// Used by BOTH the client AboutPage (src/App.tsx) and the worker pre-render
// (worker/seo-meta.ts) so the initial server HTML and the hydrated page can
// never drift. Every statement here is drawn from the live catalog or the
// published Luxedge policies — nothing invented.
// ============================================================================

export const ABOUT_QUOTE = 'Authentic Himalayan pink rock salt, mined from ancient seams and packed in Houston, Texas.';

export const ABOUT_LEAD =
  'Himalayan Koh provides authentic, unrefined Himalayan pink salt for horses, cattle, wildlife, and culinary wellness — ' +
  'sourced directly from the Khewra Salt Range and dispatched from Houston, Texas.';

export interface AboutSection {
  title: string;
  body: string;
}

export const ABOUT_SECTIONS: AboutSection[] = [
  {
    title: 'What we sell',
    body:
      'Our catalog focuses on natural, unrefined Himalayan pink salt products: pure mineral salt licks on durable ropes, dense animal salt blocks for pastures and stables, and fine culinary salts for human consumption. Every product is 100% natural with no artificial anti-caking agents.',
  },
  {
    title: 'How we source and curate',
    body:
      'Direct geological sourcing from the Salt Range in Pakistan. Each batch is inspected for purity, moisture protection, and uniform grain sorting before dispatch from our facility in Houston, Texas.',
  },
  {
    title: 'Our mineral guides',
    body:
      'Our guides explain mineral supplementation, proper placement for livestock, and culinary uses. Product information reflects verified physical attributes and geological origin.',
  },
  {
    title: 'Who we are',
    body:
      'Himalayan Koh (himalayankoh.com) is an American direct-to-consumer and B2B distributor of authentic Himalayan rock salt products based in Houston, Texas.',
  },
  {
    title: 'How our products reach you',
    body:
      'Products are stocked, packed, and dispatched from Houston, Texas. We ship throughout the continental United States with verified freight and parcel carriers.',
  },
  {
    title: 'What you can expect from us',
    body:
      'Transparent sourcing, honest mineral disclosures, and reliable delivery. If an item arrives damaged or incomplete, contact sales@himalayankoh.com and our Houston team will make it right.',
  },
  {
    title: 'Customer support',
    body:
      'Our team is available Monday to Friday, 9AM–6PM CT. We offer 30-day return support for damaged or defective items. Questions? Contact sales@himalayankoh.com or call (832) 224-6466.',
  },
];
