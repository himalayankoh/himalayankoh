import { checkFetchableUrl } from '@/lib/scrape/urlSafety';
import type { NormalizedLead, LeadResearch, ProductInterest } from './types';

export const LEAD_PIPELINE = ['new', 'researched', 'qualified', 'approved_for_outreach', 'contacted', 'replied', 'interested', 'quote_requested', 'negotiating', 'won', 'lost', 'do_not_contact'] as const;
export const PRODUCT_INTERESTS: ProductInterest[] = ['horse_salt', 'livestock_salt', 'culinary_salt', 'bulk_wholesale', 'private_label'];
export const BUYER_CATEGORIES = ['Feed Store', 'Farm Supply', 'Equestrian Store', 'Livestock Distributor', 'Salt Wholesaler', 'Specialty Food Distributor', 'Spice Retailer', 'Private Label Buyer'];

/** These are catalog references, not guaranteed wholesale manufacturing capabilities. */
export const OFFER_PROFILES: Record<ProductInterest, { label: string; productIds: string[]; caveat: string }> = {
  horse_salt: { label: 'Horse salt', productIds: ['2543', '2544'], caveat: 'Confirm current catalog specifications and availability before quoting.' },
  livestock_salt: { label: 'Livestock salt', productIds: ['2536', '2539', '2544'], caveat: 'Animal products must not be offered for human food use.' },
  culinary_salt: { label: 'Culinary salt', productIds: ['2526'], caveat: 'Only the active 16 oz edible jar; no invented bulk culinary sizes.' },
  bulk_wholesale: { label: 'Bulk wholesale', productIds: ['2539', '2544'], caveat: 'Current 45 lb livestock bag and 30 lb lick; MOQ, freight and terms require a quote.' },
  private_label: { label: 'Private-label opportunity', productIds: [], caveat: 'Potential buyer research only. Manufacturing, packaging and private-label capabilities require owner confirmation.' },
};

export function publicCompanyUrl(raw: string): string | null {
  const check = checkFetchableUrl(raw);
  if (!check.ok) return null;
  const u = new URL(check.url);
  if (u.port && !['80', '443'].includes(u.port)) return null;
  if (!u.hostname.includes('.') || u.hostname.includes(':')) return null;
  if (/\/(?:wp-admin|wp-login|login|signin|account|checkout|cart)(?:\/|\.|$)/i.test(u.pathname)) return null;
  if (/(^|\.)(?:facebook|instagram|linkedin|youtube|yelp|google|bing|amazon|yellowpages|superpages|mapquest)\.com$/i.test(u.hostname)) return null;
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

export function createIntroduction(lead: { businessName: string; city?: string | null; category?: string | null; research?: LeadResearch }, interest: ProductInterest) {
  const name = lead.research?.publicCompanyName || lead.businessName;
  const offer = OFFER_PROFILES[interest];
  const product = interest === 'horse_salt' ? 'our listed 2 lb horse salt lick and 30 lb salt lick' : interest === 'livestock_salt' ? 'our listed 6 lb livestock pouch, 45 lb livestock bag and 30 lb lick' : interest === 'culinary_salt' ? 'our listed 16 oz edible pink salt jar' : interest === 'bulk_wholesale' ? 'our listed livestock bags and salt licks' : 'a potential private-label salt opportunity, subject to confirming our capabilities and your requirements';
  return {
    subject: `Himalayan Koh ${offer.label.toLowerCase()} inquiry — ${name}`,
    message: `Hello ${name} team,\n\nI am reaching out from Himalayan Koh while researching ${lead.category || 'relevant businesses'}${lead.city ? ` in ${lead.city}` : ''}.\n\nWe would welcome a conversation about ${product}. Would this be relevant to your purchasing team? We can share current product details for review. Packaging, availability, pricing, minimum quantities and freight would be confirmed in a separate quote.\n\nIf you are not the right contact, please let us know. To opt out of further outreach, reply “unsubscribe”.\n\nHimalayan Koh\nsales@himalayankoh.com\nhttps://himalayankoh.com`,
  };
}
