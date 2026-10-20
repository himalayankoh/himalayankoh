// ============================================================================
// HIMALAYAN KOH — shared /about copy
//
// Used by BOTH the client AboutPage (src/App.tsx) and the worker pre-render
// (worker/seo-meta.ts) so the initial server HTML and the hydrated page can
// never drift. Every statement here is drawn from the live catalog or the
// published Himalayan Koh policies — nothing invented.
// ============================================================================

export const ABOUT_QUOTE = 'Authentic Himalayan pink rock salt, mined from ancient seams and packed in Houston, Texas.';

export const ABOUT_LEAD =
  'Himalayan Koh provides Himalayan pink salt for horses, cattle, livestock, and everyday cooking — ' +
  'sourced directly from the Khewra Salt Range and dispatched from Houston, Texas.';

export interface AboutSection {
  title: string;
  body: string;
}

export const ABOUT_SECTIONS: AboutSection[] = [
  {
    title: 'What we sell',
    body:
      'Our catalog includes a fine-grain edible jar, horse licks, cattle rock salt and livestock bags or pouches. Choose the intended use and size stated on each listing.',
  },
  {
    title: 'How we source and curate',
    body:
      'Our pink salt is sourced from Pakistan\'s Salt Range. Contact our Houston team before ordering when you need a particular specification or lot document; we will confirm what is available.',
  },
  {
    title: 'Our mineral guides',
    body:
      'Our guides discuss salt handling, storage and culinary or livestock uses. General information does not replace a product label, a lot-specific report or professional dietary advice.',
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
      'See our Contact page for customer-service hours and our Return Policy for eligibility. Questions? Contact sales@himalayankoh.com or call (832) 224-6466.',
  },
];
