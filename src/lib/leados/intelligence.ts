import { checkFetchableUrl } from '@/lib/scrape/urlSafety';
import type { NormalizedLead, LeadResearch, ProductInterest } from './types';
export type { ProductInterest };

export const LEAD_PIPELINE = ['new', 'researched', 'qualified', 'approved_for_outreach', 'contacted', 'replied', 'interested', 'quote_requested', 'negotiating', 'won', 'lost', 'do_not_contact'] as const;
export const PRODUCT_INTERESTS: ProductInterest[] = ['horse_salt', 'livestock_salt', 'culinary_salt', 'bulk_wholesale', 'private_label'];
export const BUYER_CATEGORIES = ['Feed Store', 'Farm Supply', 'Equestrian Store', 'Ranch & Horse Facility', 'Livestock Distributor', 'Salt Wholesaler', 'Specialty Food Distributor', 'Spice Retailer', 'Private Label Buyer'];

/** These are catalog references, not guaranteed wholesale manufacturing capabilities. */
export interface OfferProfile {
  label: string;
  productIds: string[];
  caveat: string;
  defaultUrl: string;
}

export const OFFER_PROFILES: Record<ProductInterest, OfferProfile> = {
  horse_salt: {
    label: 'Horse salt',
    productIds: ['2543'],
    caveat: 'Confirm current catalog specifications and availability before quoting.',
    defaultUrl: 'https://himalayankoh.com/products/himalayan-pink-salt-licks-for-horses-2-lbs-himalayan-koh',
  },
  livestock_salt: {
    label: 'Livestock salt',
    productIds: ['2544', '2536', '2539'],
    caveat: 'Animal products must not be offered for human food use.',
    defaultUrl: 'https://himalayankoh.com/products/himalayan-salt-rock-for-cattle-30-lbs-bag-himalayan-koh',
  },
  culinary_salt: {
    label: 'Culinary salt',
    productIds: ['2526'],
    caveat: 'Only the active 16 oz edible jar; no invented bulk culinary sizes.',
    defaultUrl: 'https://himalayankoh.com/products/himalayan-edible-pink-salt-16-oz-jar-fine-grain',
  },
  bulk_wholesale: {
    label: 'Bulk wholesale',
    productIds: ['2544', '2539'],
    caveat: 'Current 45 lb livestock bag and 30 lb lick; MOQ, freight and terms require a quote.',
    defaultUrl: 'https://himalayankoh.com/wholesale',
  },
  private_label: {
    label: 'Private-label opportunity',
    productIds: [],
    caveat: 'Potential buyer research only. Manufacturing, packaging and private-label capabilities require owner confirmation.',
    defaultUrl: 'https://himalayankoh.com/wholesale',
  },
};

export const INFORMATIONAL_DOMAINS = [
  'merriam-webster.com',
  'dictionary.com',
  'thesaurus.com',
  'cambridge.org',
  'oxfordlearnersdictionaries.com',
  'collinsdictionary.com',
  'wiktionary.org',
  'thefreedictionary.com',
  'vocabulary.com',
  'yourdictionary.com',
  'macmillandictionary.com',
  'wordnik.com',
  'urbandictionary.com',
  'wikipedia.org',
  'wikimedia.org',
  'britannica.com',
  'encyclopedia.com',
  'animals.net',
  'sportsfoundation.org',
  'nationalgeographic.com',
  'about.com',
  'wikihow.com',
  'investopedia.com',
  'quora.com',
  'reddit.com',
  'medium.com',
  'pinterest.com',
  'pickyourown.farm',
  'yellowpages.com',
  'superpages.com',
  'whitepages.com',
  'manta.com',
  'bbb.org',
  'chamberofcommerce.com',
  'zoominfo.com',
  'thehorse.com',
  'equimed.com',
  'equusmagazine.com',
  'horseandhound.co.uk',
  'horsesciencenews.com',
  'horsechannel.com',
  'horseillustrated.com',
];

export const INFORMATIONAL_TITLE_PATTERNS = [
  /definition & meaning/i,
  /meaning of/i,
  /wikipedia/i,
  /britannica/i,
  /dictionary/i,
  /thesaurus/i,
  /how it started/i,
  /interesting facts/i,
  /description, habitat/i,
  /timeline & how/i,
  /guide to/i,
  /ultimate guide/i,
  /everything you need to know/i,
  /facts & history/i,
];

export type LeadEntityType =
  | 'business_prospect'
  | 'potential_distributor'
  | 'social_business_page'
  | 'public_community'
  | 'directory_source'
  | 'informational_content'
  | 'unqualified';

export function isInformationalDomain(domainOrUrl: string): boolean {
  if (!domainOrUrl) return false;
  let hostname = domainOrUrl.toLowerCase();
  try {
    if (hostname.includes('://')) hostname = new URL(hostname).hostname;
  } catch {
    // fallback
  }
  hostname = hostname.replace(/^www\./, '');
  return INFORMATIONAL_DOMAINS.some((d) => hostname === d || hostname.endsWith(`.${d}`));
}

export function classifyLeadEntity(lead: {
  businessName: string;
  website?: string | null;
  category?: string | null;
  osmUrl?: string | null;
  facebook?: string | null;
  instagram?: string | null;
  dataSource?: string | null;
}): {
  entityType: LeadEntityType;
  isActionableProspect: boolean;
  exclusionReason: string | null;
} {
  const name = lead.businessName || '';
  const web = lead.website || '';
  const fb = lead.facebook || '';
  const ig = lead.instagram || '';
  const cat = lead.category || '';

  // 1. Informational domain or encyclopedia/dictionary title check
  if (isInformationalDomain(web) || INFORMATIONAL_TITLE_PATTERNS.some((p) => p.test(name))) {
    return {
      entityType: 'informational_content',
      isActionableProspect: false,
      exclusionReason: 'Educational reference, encyclopedia or dictionary definition — not a commercial buyer.',
    };
  }

  // 2. Facebook Group check
  if (
    web.includes('facebook.com/groups') ||
    fb.includes('facebook.com/groups') ||
    /public.*group/i.test(cat) ||
    (name.includes('- Facebook') && /group|boarding|services/i.test(name))
  ) {
    return {
      entityType: 'public_community',
      isActionableProspect: false,
      exclusionReason: 'Community group or public discussion forum — not an individual purchasing entity.',
    };
  }

  // 3. Social business page check
  if (
    web.includes('facebook.com') ||
    web.includes('instagram.com') ||
    (fb && !web.includes('http')) ||
    (ig && !web.includes('http'))
  ) {
    return {
      entityType: 'social_business_page',
      isActionableProspect: true,
      exclusionReason: null,
    };
  }

  // 4. Commercial wholesale / distributor check
  if (
    /wholesal|distribut/i.test(cat) ||
    /wholesal|distribut|feed mill|grain elevator|supply co-op/i.test(name)
  ) {
    return {
      entityType: 'potential_distributor',
      isActionableProspect: true,
      exclusionReason: null,
    };
  }

  // 5. Standard verified business prospect
  return {
    entityType: 'business_prospect',
    isActionableProspect: true,
    exclusionReason: null,
  };
}

export type LivestockEligibility = 'ELIGIBLE_LIVESTOCK' | 'IRRELEVANT' | 'NEEDS_REVIEW';

export const IRRELEVANT_PATTERNS = [
  /\bspa\b/i,
  /\bwellness\b/i,
  /\bsalon\b/i,
  /\bmassage\b/i,
  /\bfloat\b/i,
  /\byoga\b/i,
  /\bskincare\b/i,
  /\bcosmetic\b/i,
  /\brestaurant\b/i,
  /\bbakery\b/i,
  /\bbistro\b/i,
  /\bcafe\b/i,
  /\bcoffee\b/i,
  /\bdeli\b/i,
  /\bkitchen\b/i,
  /\bbar & grill\b/i,
  /\bpet grooming\b/i,
  /\bpet salon\b/i,
  /\bpetsmart\b/i,
  /\bpetco\b/i,
  /\bpet supplies\b/i,
  /\banimal hospital\b/i,
  /\banimal clinic\b/i,
  /\bveterinary clinic\b/i,
  /\bveterinary hospital\b/i,
  /\bveterinar(?:y|ian)\b/i,
  /\bpet care\b/i,
  /\bpet resort\b/i,
  /\bdog\b/i,
  /\bcat\b/i,
  /\bpets?\b/i,
  /\bcompanion animal\b/i,
  /\bpuppy\b/i,
  /\bkitten\b/i,
  /\bcanine\b/i,
  /\bfeline\b/i,
  /\baquarium\b/i,
  /\bbath salt\b/i,
  /\bhimalayan salt cave\b/i,
  /\blumber\b/i,
  /\belectric supply\b/i,
  /\bbuilding materials?\b/i,
  /\bblueprint\b/i,
];

export const LIVESTOCK_PATTERNS = [
  /\bcattle\b/i,
  /\bdairy\b/i,
  /\bbovine\b/i,
  /\bbeef\b/i,
  /\bcow\b/i,
  /\bcalves\b/i,
  /\bcalf\b/i,
  /\bheifer\b/i,
  /\bsteer\b/i,
  /\bbull\b/i,
  /\bhorse\b/i,
  /\bequine\b/i,
  /\bequestrian\b/i,
  /\bstable\b/i,
  /\bstallion\b/i,
  /\bmare\b/i,
  /\branch\b/i,
  /\btack\b/i,
  /\bgoat\b/i,
  /\bsheep\b/i,
  /\blamb\b/i,
  /\bram\b/i,
  /\bwool\b/i,
  /\blivestock\b/i,
  /\bpasture\b/i,
  /\bherd\b/i,
  /\bfeed & seed\b/i,
  /\bfeed store\b/i,
  /\bfeed mill\b/i,
  /\bfeed\s*(?:&|and)?\s*(?:store|supply|company|co\.?|mill|seed)\b/i,
  /\bgrain elevator\b/i,
  /\bfarm supply\b/i,
  /\banimal nutrition\b/i,
  /\bsalt lick\b/i,
  /\bmineral lick\b/i,
  /\bfarm & ranch\b/i,
  /\bco-op\b/i,
  /\bcooperative\b/i,
];

export const APPROVED_LIVESTOCK_CATEGORIES = new Set([
  'Agriculture & Livestock',
  'Feed Store',
  'Ranch & Horse Facility',
  'Equestrian Store',
  'Farm Supply',
  'Livestock Distributor',
  'Salt Wholesaler',
]);

export function classifyLivestockEligibility(lead: {
  businessName: string;
  category?: string | null;
  notes?: string | null;
  website?: string | null;
  address?: string | null;
  city?: string | null;
  region?: string | null;
}): {
  classification: LivestockEligibility;
  reason: string;
} {
  const cat = (lead.category || '').trim();
  // The discovery bucket a lead was found under is a request, not a fact about
  // the business. When "Agriculture & Livestock" carried the word "livestock"
  // into the signal text, every pet shop and veterinary clinic found in that bucket
  // was classified as an eligible livestock prospect. Judge the business itself.
  const subject = [lead.businessName, lead.notes, lead.website, lead.address, lead.city, lead.region]
    .filter(Boolean)
    .join(' ');

  const isSpaOrCulinaryOrPet = IRRELEVANT_PATTERNS.some((p) => p.test(subject)) || cat === 'Wellness & Lifestyle';
  const hasLivestockSignal = LIVESTOCK_PATTERNS.some((p) => p.test(subject));

  if (isSpaOrCulinaryOrPet && !hasLivestockSignal) {
    return {
      classification: 'IRRELEVANT',
      reason: 'Non-livestock entity (wellness/spa/salon/restaurant/pet store/materials) archived per Himalayan Koh Livestock-Only policy.',
    };
  }

  if (hasLivestockSignal) {
    return {
      classification: 'ELIGIBLE_LIVESTOCK',
      reason: 'Verified USA livestock operation, horse facility, cattle ranch, or feed & mineral supplier.',
    };
  }

  // A specific buyer category is weaker evidence than the business name, but the
  // broad discovery bucket says nothing about the business and is not evidence.
  const specificCategory = APPROVED_LIVESTOCK_CATEGORIES.has(cat) && cat !== 'Agriculture & Livestock';
  if (specificCategory && !isSpaOrCulinaryOrPet) {
    return {
      classification: 'ELIGIBLE_LIVESTOCK',
      reason: 'Verified USA livestock operation, horse facility, cattle ranch, or feed & mineral supplier.',
    };
  }

  return {
    classification: 'NEEDS_REVIEW',
    reason: 'Commercial salt or trade contact requiring operator confirmation of animal care/feed relevance.',
  };
}

export function publicCompanyUrl(raw: string): string | null {
  const check = checkFetchableUrl(raw);
  if (!check.ok) return null;
  const u = new URL(check.url);
  if (u.port && !['80', '443'].includes(u.port)) return null;
  if (!u.hostname.includes('.') || u.hostname.includes(':')) return null;
  if (/\/(?:wp-admin|wp-login|login|signin|account|checkout|cart)(?:\/|\.|$)/i.test(u.pathname)) return null;
  if (/(^|\.)(?:facebook|instagram|linkedin|youtube|yelp|google|bing|amazon|yellowpages|superpages|mapquest)\.com$/i.test(u.hostname)) return null;
  if (isInformationalDomain(u.hostname)) return null;
  u.hash = ''; u.search = '';
  return u.toString();
}

function normalized(value: string | null | undefined): string {
  return String(value || '').normalize('NFKC').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
export function leadIdentity(lead: Pick<NormalizedLead, 'businessName' | 'website' | 'address' | 'city' | 'region'> & { osmType?: string | null; osmId?: string | null }): string {
  // A known location always separates branches, even on a shared company domain.
  const website = lead.website ? publicCompanyUrl(lead.website) : null;
  const domain = website ? new URL(website).hostname.replace(/^www\./, '') : '';
  const location = [lead.address, lead.city, lead.region].map(normalized).join('|');
  if (domain) return `company|${domain}|${normalized(lead.businessName)}|${location}`;
  if (lead.osmType && lead.osmId) return `osm|${lead.osmType}|${lead.osmId}`;
  return `name|${normalized(lead.businessName)}|${location}`;
}

type CompanyIdentity = Pick<NormalizedLead,'businessName'|'website'|'address'|'city'|'region'> & {osmType?:string|null;osmId?:string|null};
/** A generic search title is not a new company when one saved location owns its site. */
export function matchingKnownLead<T extends CompanyIdentity>(candidate: CompanyIdentity, known: T[]): T | undefined {
  const exact = known.find(l=>leadIdentity(l)===leadIdentity(candidate));
  if (exact) return exact;
  if ([candidate.address,candidate.city,candidate.region].some(Boolean)) return undefined;
  const site = candidate.website && publicCompanyUrl(candidate.website);
  if (!site) return undefined;
  const url = new URL(site);
  if (/\/(?:locations?|stores?|branches?)(?:\/|[-_])/i.test(url.pathname)) return undefined;
  const domain = url.hostname.replace(/^www\./,'');
  const matches = known.filter(l=>{const s=l.website && publicCompanyUrl(l.website);return s && new URL(s).hostname.replace(/^www\./,'')===domain;});
  return matches.length===1 ? matches[0] : undefined;
}

export function deduplicateLeads<T extends NormalizedLead>(leads: T[]): { leads: T[]; duplicatesRemoved: number } {
  const located = new Map<string, Set<string>>();
  for (const lead of leads) {
    const site = lead.website && publicCompanyUrl(lead.website);
    if (site && [lead.address,lead.city,lead.region].some(Boolean)) {
      const domain = new URL(site).hostname.replace(/^www\./,'');
      const keys = located.get(domain) || new Set<string>(); keys.add(leadIdentity(lead)); located.set(domain,keys);
    }
  }
  const groups = new Map<string, T>();
  // Prefer known locations as representatives; a generic same-domain search
  // snippet can join only one unambiguous location, never collapse branches.
  for (const lead of [...leads].sort((a,b)=>Number([b.address,b.city,b.region].some(Boolean))-Number([a.address,a.city,a.region].some(Boolean)))) {
    let key = leadIdentity(lead);
    const site = lead.website && publicCompanyUrl(lead.website);
    if (site && ![lead.address,lead.city,lead.region].some(Boolean)) {
      const url = new URL(site), keys = located.get(url.hostname.replace(/^www\./,''));
      if (keys?.size===1 && !/\/(?:locations?|stores?|branches?)(?:\/|[-_])/i.test(url.pathname)) key=[...keys][0];
    }
    const prior = groups.get(key);
    if (!prior) { groups.set(key, { ...lead }); continue; }
    const sources = [...(prior.research?.sources || []), ...(lead.research?.sources || [])];
    prior.research = { ...prior.research, sources: sources.filter((s, i) => sources.findIndex((p) => p.url === s.url && p.kind === s.kind && p.retrievedAt === s.retrievedAt) === i).slice(-40) };
    prior.website ||= lead.website; prior.phone ||= lead.phone;
    if (!prior.email && lead.email) { prior.email = lead.email; prior.emailSource = lead.emailSource; }
  }
  return { leads: [...groups.values()], duplicatesRemoved: leads.length - groups.size };
}

const PRODUCT_MATCH: Record<ProductInterest, RegExp> = {
  horse_salt: /feed|equestrian|equine|horse|tack|farm|ranch/i,
  livestock_salt: /feed|livestock|cattle|farm|ranch|agricultur/i,
  culinary_salt: /specialty food|spice|seasoning|culinary|salt wholesal|food distribut|grocery/i,
  bulk_wholesale: /livestock|agricultur|feed|ranch|farm|salt wholesal|distribut/i,
  private_label: /private.label|wholesal|distribut|spice|specialty food|salt/i,
};

/** No revenue, company-size or guessed-email inputs. Snippets do not verify facts. */
export function qualifyLead(lead: NormalizedLead, interest: ProductInterest = 'horse_salt') {
  // Check Commercial Business Qualification Gate
  const classification = classifyLeadEntity(lead);
  if (!classification.isActionableProspect) {
    return {
      score: 0,
      reasons: [classification.exclusionReason || 'Filtered by Commercial Business Qualification Gate: non-commercial content.'],
      breakdown: { category: 0, product: 0, usMarket: 0, wholesale: 0, privateLabel: 0, assortment: 0, contact: 0, sources: 0 },
      interest,
      qualified: false,
    };
  }

  const observed = (lead.research?.sources || []).filter((s) => s.status === 'verified' && ['company_page','browser_page'].includes(s.kind)).map((s) => s.excerpt || '').join(' ');
  const category = lead.category || '';
  // A search's requested category is not a fact about a discovered website.
  // OSM categories come from map tags; web candidates need company-page words.
  const buyerEvidence = observed || (lead.osmUrl ? category : '');
  const reasons: string[] = [];
  const breakdown: Record<string, number> = { category: 0, product: 0, usMarket: 0, wholesale: 0, privateLabel: 0, assortment: 0, contact: 0, sources: 0 };
  const relevant = /feed|farm|ranch|equestrian|equine|horse|tack|livestock|salt wholesal|food distribut|spice|private.label/i.test(buyerEvidence);
  const excluded = /software|marketing agency|restaurant|fast food|gas station/i.test(`${lead.businessName} ${category}`);
  if (relevant && !excluded) { breakdown.category = 25; reasons.push('Relevant B2B buyer category (25/25).'); }
  if (relevant && !excluded && PRODUCT_MATCH[interest].test(buyerEvidence)) { breakdown.product = 20; reasons.push(`Category compatible with ${OFFER_PROFILES[interest].label} (20/20); buyer interest remains unconfirmed.`); }
  if (/^(?:us|usa|united states(?: of america)?)$/i.test(lead.country || '')) { breakdown.usMarket = 10; reasons.push('US location recorded by the source (10/10).'); }
  if (/wholesale|distribut|resell|dealer/i.test(observed)) { breakdown.wholesale = 10; reasons.push('Wholesale/distribution wording observed (10/10).'); }
  if (/private[ -]label/i.test(observed)) { breakdown.privateLabel = 10; reasons.push('Private-label wording observed (10/10); HK service capability requires confirmation.'); }
  if (/salt|horse|equine|livestock|feed|spice/i.test(observed)) { breakdown.assortment = 10; reasons.push('Relevant assortment wording observed (10/10).'); }
  if (lead.phone) breakdown.contact += 3;
  if (lead.website) breakdown.contact += 3;
  if (lead.email && lead.emailSource === 'company_website') breakdown.contact += 4;
  breakdown.sources = observed ? 5 : lead.osmUrl ? 2 : 0;
  if (excluded) reasons.push('Excluded unrelated business; qualification is zero.');
  if (!observed) reasons.push('Company website facts not yet verified; no wholesale/private-label/assortment points awarded.');
  reasons.push(`Public contact evidence (${breakdown.contact}/10); source quality (${breakdown.sources}/5).`);
  return { score: excluded ? 0 : Object.values(breakdown).reduce((a, b) => a + b, 0), reasons, breakdown, interest, qualified: !excluded && breakdown.category > 0 && breakdown.product > 0 && breakdown.sources === 5 };
}

export interface ProductRecommendationResult {
  productInterest: ProductInterest;
  productName: string;
  productUrl: string;
  fitLevel: 'high' | 'moderate' | 'low';
  relevanceReason: string;
  isLowFit: boolean;
}

/**
 * Deterministic product recommendation based on real business category & evidence.
 * Ensures wellness businesses are never pitched livestock licks, and unrelated businesses
 * are flagged for manual review rather than sent misleading pitches.
 */
export function determineProductRelevance(lead: {
  businessName: string;
  category?: string | null;
  research?: LeadResearch;
}): ProductRecommendationResult {
  const name = (lead.businessName || '').toLowerCase();
  const cat = (lead.category || '').toLowerCase();
  const text = `${name} ${cat}`;

  // 1. Wellness / Spa / Massage / Therapy / Health / Salon / Yoga
  if (/massage|spa\b|wellness|therapy|therapeutic|esthetic|beauty|salon|yoga|relaxation/i.test(text)) {
    return {
      productInterest: 'culinary_salt',
      productName: 'Himalayan Edible Pink Salt – 16 oz Jar | Fine Grain',
      productUrl: 'https://himalayankoh.com/products/himalayan-edible-pink-salt-16-oz-jar-fine-grain',
      fitLevel: 'moderate',
      relevanceReason: 'Wellness and therapeutic practitioner: matched with pure food-grade pink mineral salt line. Animal feed products strictly excluded.',
      isLowFit: false,
    };
  }

  // 2. Horse / Equine / Equestrian / Tack
  if (/horse|equine|equestrian|tack|stallion|riding|colt|pony/i.test(text)) {
    return {
      productInterest: 'horse_salt',
      productName: 'Himalayan Pink Salt Licks for Horses (2 lb & 6 lb)',
      productUrl: 'https://himalayankoh.com/products/himalayan-pink-salt-licks-for-horses-2-lbs-himalayan-koh',
      fitLevel: 'high',
      relevanceReason: 'Equine facility or equestrian specialty store: matched with equine salt licks on rope.',
      isLowFit: false,
    };
  }

  // 3. Ranch / Cattle / Livestock / Farm & Feed Store
  if (/feed|cattle|livestock|ranch|farm|co-?op|grain|mill\b|pasture/i.test(text)) {
    return {
      productInterest: 'livestock_salt',
      productName: 'Himalayan Koh 30 lb Red Rock Salt Lick & 45 lb Feed Minerals',
      productUrl: 'https://himalayankoh.com/products/himalayan-salt-rock-for-cattle-30-lbs-bag-himalayan-koh',
      fitLevel: 'high',
      relevanceReason: 'Commercial livestock, feed or ranch supplier: matched with 30 lb rock salt licks and livestock feed bags.',
      isLowFit: false,
    };
  }

  // 4. Commercial Salt Wholesaler / Distributor
  if (/salt\s*wholesal|mineral\s*distribut|bulk\s*salt|spice\s*wholesal/i.test(text)) {
    return {
      productInterest: 'bulk_wholesale',
      productName: 'Commercial Wholesale Himalayan Salt Line',
      productUrl: 'https://himalayankoh.com/wholesale',
      fitLevel: 'high',
      relevanceReason: 'Wholesale distributor or B2B dealer: matched with pallet & container bulk wholesale program.',
      isLowFit: false,
    };
  }

  // 5. Specialty Food / Spice / Grocery / Gourmet
  if (/grocery|supermarket|food|spice|gourmet|culinary|produce|market/i.test(text)) {
    return {
      productInterest: 'culinary_salt',
      productName: 'Himalayan Edible Pink Salt – 16 oz Jar | Fine Grain',
      productUrl: 'https://himalayankoh.com/products/himalayan-edible-pink-salt-16-oz-jar-fine-grain',
      fitLevel: 'high',
      relevanceReason: 'Food retailer or specialty grocer: matched with premium 16 oz fine grain edible jar.',
      isLowFit: false,
    };
  }

  // 6. Unrelated or dubious category (Deli, hardware, auto, construction, industrial)
  return {
    productInterest: 'bulk_wholesale',
    productName: 'None (Unverified Product Fit)',
    productUrl: 'https://himalayankoh.com/wholesale',
    fitLevel: 'low',
    relevanceReason: 'Low Product Fit — Manual Review required. Business has no established commercial relevance to agricultural minerals or gourmet salt.',
    isLowFit: true,
  };
}

export function createIntroduction(lead: { businessName: string; city?: string | null; category?: string | null; research?: LeadResearch }, interest: ProductInterest) {
  const name = lead.research?.publicCompanyName || lead.businessName;
  const offer = OFFER_PROFILES[interest] || OFFER_PROFILES.bulk_wholesale;
  const product =
    interest === 'horse_salt'
      ? 'our listed Himalayan Pink Salt Licks for Horses (2 lb & 6 lb)'
      : interest === 'livestock_salt'
      ? 'our listed 30 lb red rock salt lick for cattle and 45 lb livestock feed mineral bags'
      : interest === 'culinary_salt'
      ? 'our listed 16 oz edible pink salt jar'
      : interest === 'bulk_wholesale'
      ? 'our commercial wholesale Himalayan mineral salt line'
      : 'a potential private-label mineral salt discussion, subject to confirming our capabilities';

  return {
    subject: `Himalayan Koh ${offer.label.toLowerCase()} inquiry — ${name}`,
    message: `Hello ${name} team,\n\nI am reaching out from Himalayan Koh while researching ${lead.category || 'relevant businesses'}${lead.city ? ` in ${lead.city}` : ''}.\n\nWe would welcome an introductory conversation about ${product}. Would this be relevant to your purchasing requirements? We can share current product specifications for review. Packaging, availability, pricing, minimum quantities and freight are confirmed in a separate quote.\n\nIf you are not the right contact, please let us know. To opt out of further communications, please reply “unsubscribe”.\n\nHimalayan Koh Commercial Sales\nsales@himalayankoh.com\nhttps://himalayankoh.com`,
  };
}

export interface OutreachMessageOptions {
  mode: 'retail' | 'wholesale' | 'private_label';
  couponCode?: string;
  senderEmail?: string;
}

export function createOutreachMessage(
  lead: {
    businessName: string;
    city?: string | null;
    category?: string | null;
    research?: LeadResearch;
    website?: string | null;
  },
  options: OutreachMessageOptions = { mode: 'wholesale' }
) {
  const name = lead.research?.publicCompanyName || lead.businessName;
  const defaultSender = options.mode === 'retail' ? 'marketing@himalayankoh.com' : 'ws@himalayankoh.com';
  const sender = options.senderEmail || defaultSender;
  const city = lead.city ? ` in ${lead.city}` : '';
  const coupon = options.couponCode || 'WELCOME5';

  const rec = determineProductRelevance(lead);

  // If low product fit, flag explicitly
  if (rec.isLowFit) {
    return {
      mode: options.mode,
      subject: `[Manual Review Needed] Potential Product Fit for ${name}`,
      sender,
      productUrl: 'https://himalayankoh.com/wholesale',
      couponCode: undefined,
      isLowFit: true,
      fitLevel: 'low' as const,
      relevanceReason: rec.relevanceReason,
      message: `[LOW PRODUCT FIT — MANUAL REVIEW REQUIRED]\n\nProspect: ${name}\nCategory: ${lead.category || 'Unclassified'}\n\nOur system detected that this business may not have demonstrated commercial alignment with livestock salt licks or gourmet culinary salt.\n\nPlease inspect the business manually and choose a verified product before approving any sales pitch.`,
    };
  }

  if (options.mode === 'retail') {
    const productUrl =
      rec.productInterest === 'culinary_salt'
        ? rec.productUrl
        : 'https://himalayankoh.com/products/pink-salt-block-lick-2lb';
    return {
      mode: 'retail' as const,
      subject: `Special 5% Welcome Offer for ${name} — Himalayan Koh Pink Salt`,
      sender,
      productUrl,
      couponCode: coupon,
      isLowFit: false,
      fitLevel: rec.fitLevel,
      relevanceReason: rec.relevanceReason,
      message: `Hello ${name} Team,\n\nWe'd love to introduce Himalayan Koh, a Houston-based wholesale supplier and distributor of authentic Himalayan Pink Salt products.\n\nWe supply feed stores, farm & ranch retailers, livestock supply stores, and online resellers with premium salt licks and blocks at competitive wholesale prices.\n\nExclusive Retailer Welcome Offer:\nEnjoy 5% OFF your first trial order with code ${coupon}.\n\nExplore our products: https://himalayankoh.com\n\nInterested in adding Himalayan Koh products to your store? Simply reply to learn more about our wholesale pricing and retail partnership opportunities.\n\nBest regards,\nMarketing Department\nHimalayan Koh\nWholesale Supplier & Distributor\nEmail: ${sender}\nPhone: (832) 224-6466\nWebsite: https://himalayankoh.com\n12620 FM 1960 W, Ste A-4\nHouston, TX 77065, USA\n\nTo unsubscribe from future marketing emails, reply with "Unsubscribe".`,
    };
  }

  if (options.mode === 'private_label') {
    return {
      mode: 'private_label' as const,
      subject: `Private-Label Mineral Salt Discussion — ${name} & Himalayan Koh`,
      sender,
      productUrl: 'https://himalayankoh.com/wholesale',
      couponCode: undefined,
      isLowFit: false,
      fitLevel: rec.fitLevel,
      relevanceReason: rec.relevanceReason,
      message: `Hello ${name} team,\n\nI am reaching out from Himalayan Koh regarding potential private-label Himalayan mineral salt packaging for your brand${city}.\n\nWe supply authentic agricultural and livestock pink salt blocks and granular minerals directly from Himalayan salt deposits. We would welcome an introductory discussion regarding your custom packaging specifications, target volume, and private-label timelines.\n\nPlease note: Manufacturing schedules and minimum order quantities are confirmed upon technical review of your requirements.\n\nWould your brand development team be available for a brief inquiry call next week?\n\nSincerely,\n\nHimalayan Koh B2B Operations\n${sender}\nhttps://himalayankoh.com/wholesale`,
    };
  }

  // Default: Wholesale
  return {
    mode: 'wholesale' as const,
    subject: `Wholesale Himalayan Salt Distribution Inquiry — ${name}`,
    sender,
    productUrl: 'https://himalayankoh.com/wholesale',
    couponCode: undefined,
    isLowFit: false,
    fitLevel: rec.fitLevel,
    relevanceReason: rec.relevanceReason,
    message: `Hello ${name} Team,\n\nWe'd love to introduce Himalayan Koh, a Houston-based wholesale supplier and distributor of authentic Himalayan Pink Salt products.\n\nWe supply wholesale distributors, bulk agricultural dealers, commercial ranches, and livestock supply stores with premium salt licks, mineral blocks, and feed salt at competitive wholesale pricing.\n\nExplore our wholesale specifications & catalog: https://himalayankoh.com/wholesale\n\nInterested in wholesale pricing, pallet freight, or container quotes? Simply reply to this email to learn more.\n\nBest regards,\nWholesale Department\nHimalayan Koh\nWholesale Supplier & Distributor\nEmail: ${sender}\nPhone: (832) 224-6466\nWebsite: https://himalayankoh.com/wholesale\n12620 FM 1960 W, Ste A-4\nHouston, TX 77065, USA\n\nTo unsubscribe from future wholesale communications, reply with "Unsubscribe".`,
  };
}
