import { BUYER_CATEGORIES, PRODUCT_INTERESTS } from './intelligence';
import type { ProductInterest } from './types';

/**
 * Turns a plain-language request ("ranches and horse training stables near
 * Houston with a website") into LeadOS search fields.
 *
 * Token budget: rules first (0 tokens). The AI is called only when the rules
 * cannot find both a buyer segment and a location, with a ~150-token prompt,
 * short-key JSON output (≤120 tokens), no thinking budget, and a small cache.
 * The AI only picks from fixed enums; it never produces leads or facts.
 */
export interface SearchPlan {
  category: string;
  location: string;
  categories?: string[];
  locations?: string[];
  keywords?: string[];
  resultsLimit?: number;
  sources?: string[];
  keyword: string;
  productInterest: ProductInterest;
  requireWebsite: boolean;
  requirePhone: boolean;
  requireEmail: boolean;
  wholesaleOnly: boolean;
  privateLabelOnly: boolean;
  excludeSaved: boolean;
  searchDepth: 1 | 2;
}

export interface PlanResult {
  plan: SearchPlan;
  source: 'rules' | 'ai';
  /** True when rules found both a segment and a location (no AI needed). */
  confident: boolean;
  provider?: string;
}

const CATEGORY_RULES: Array<[RegExp, string]> = [
  [/private[\s-]?label/i, 'Private Label Buyer'],
  [/salt\s+(?:wholesal|import|distribut)|wholesale\s+salt|namak/i, 'Salt Wholesaler'],
  [/spice|seasoning|masala/i, 'Spice Retailer'],
  [/specialty\s+food|gourmet|grocer|food\s+distribut|culinary/i, 'Specialty Food Distributor'],
  [/\btack\b|saddle|equestrian\s+(?:store|shop)/i, 'Equestrian Store'],
  [/feed\s+(?:store|supply|supplies|mill|shop)|farm\s+(?:&|and)\s+feed|charah|chara|dana/i, 'Feed Store'],
  [/\branc?h(?:es)?\b|\brache?s?\b|stable|boarding|riding|horse\s+(?:train|farm|barn|cent|owner)|training\s+(?:area|cent|barn|facilit)|equestrian\s+(?:cent|facilit)|dairy|cattle|\bcows?\b|goat|sheep|\bfarms?\b|ghor[aeo]/i, 'Ranch & Horse Facility'],
  [/farm\s+suppl(?:y|ies|ier|iers)?|ag(?:ricultural)?\s+suppl(?:y|ies|ier|iers)?|tractor|\bco-?op\b|kisan|kisaan|zaraat/i, 'Farm Supply'],
  [/livestock\s+(?:distribut|wholesal|supplier|store)|distributor/i, 'Livestock Distributor'],
  [/feed/i, 'Feed Store'],
];

const INTEREST_RULES: Array<[RegExp, ProductInterest]> = [
  [/private[\s-]?label/i, 'private_label'],
  [/culinary|food|spice|kitchen|edible|cooking|grocer|masala/i, 'culinary_salt'],
  [/horse|equine|equestrian|stable|riding|\btack\b|\branc?h|ghor[aeo]/i, 'horse_salt'],
  [/\bcows?\b|cattle|livestock|goat|sheep|dairy|deer|janwar|maveshi|meweshi/i, 'livestock_salt'],
  [/bulk|pallet|truckload|namak/i, 'bulk_wholesale'],
];

const CATEGORY_INTEREST: Record<string, ProductInterest> = {
  'Spice Retailer': 'culinary_salt',
  'Specialty Food Distributor': 'culinary_salt',
  'Private Label Buyer': 'private_label',
  'Salt Wholesaler': 'bulk_wholesale',
  'Livestock Distributor': 'livestock_salt',
};

const STATES: Record<string, string> = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA', colorado: 'CO', connecticut: 'CT', delaware: 'DE', florida: 'FL', georgia: 'GA',
  hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA', kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD',
  massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS', missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ',
  'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK', oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT', virginia: 'VA', washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY',
};
const ABBRS = new Set(Object.values(STATES));

const KNOWN_CITIES: Record<string, string> = {
  houston: 'Houston, TX', 'fort worth': 'Fort Worth, TX', 'san antonio': 'San Antonio, TX', dallas: 'Dallas, TX', austin: 'Austin, TX',
  katy: 'Katy, TX', conroe: 'Conroe, TX', waco: 'Waco, TX', amarillo: 'Amarillo, TX', lubbock: 'Lubbock, TX', 'el paso': 'El Paso, TX',
  omaha: 'Omaha, NE', denver: 'Denver, CO', lexington: 'Lexington, KY', 'des moines': 'Des Moines, IA', ocala: 'Ocala, FL',
  'oklahoma city': 'Oklahoma City, OK', tulsa: 'Tulsa, OK', nashville: 'Nashville, TN', phoenix: 'Phoenix, AZ', 'kansas city': 'Kansas City, MO',
};

const ZIP_PREFIXES: Array<[RegExp, string]> = [
  [/\b77\d{3}\b/, 'Houston, TX'],
  [/\b75\d{3}\b/, 'Dallas, TX'],
  [/\b76\d{3}\b/, 'Fort Worth, TX'],
  [/\b78\d{3}\b/, 'San Antonio, TX'],
  [/\b79\d{3}\b/, 'Lubbock, TX'],
  [/\b73\d{3}\b/, 'Oklahoma City, OK'],
  [/\b80\d{3}\b/, 'Denver, CO'],
  [/\b68\d{3}\b/, 'Omaha, NE'],
  [/\b40\d{3}\b/, 'Lexington, KY'],
  [/\b34\d{3}\b/, 'Ocala, FL'],
  [/\b37\d{3}\b/, 'Nashville, TN'],
  [/\b85\d{3}\b/, 'Phoenix, AZ'],
];

const KEYWORD_TERMS: Array<[RegExp, string]> = [
  [/horse|equine/i, 'horse'], [/\bcows?\b|cattle/i, 'cattle'], [/dairy/i, 'dairy'], [/goat/i, 'goat'], [/sheep/i, 'sheep'],
  [/boarding/i, 'boarding'], [/train/i, 'training'], [/rodeo/i, 'rodeo'], [/organic/i, 'organic'], [/deer|hunting/i, 'deer'],
  [/\branc?h(?:es)?\b|\brache?s?\b/i, 'ranch'], [/owner|ower/i, 'owner'],
];

const titleCase = (s: string) => s.replace(/\b[a-z]/g, (m) => m.toUpperCase());
// Lowercase two-letter words that are also state codes ("farms, or cows").
const AMBIGUOUS = new Set(['in', 'or', 'me', 'ok', 'hi', 'oh', 'al', 'de', 'id', 'co', 'la', 'ma', 'pa', 'ga', 'mo', 'wa']);

function cityBefore(prefix: string): string {
  const afterPrep = prefix.split(/\b(?:in|near|around|at|from|of)\s+/i).pop()!.trim();
  const words = afterPrep.split(/\s+/).filter(Boolean);
  const capped: string[] = [];
  for (let i = words.length - 1; i >= 0 && capped.length < 3 && /^[A-Z]/.test(words[i]); i--) capped.unshift(words[i]);
  if (capped.length) return capped.join(' ');
  return afterPrep !== prefix.trim() ? words.slice(-3).join(' ') : words.slice(-1).join(' ');
}

export function extractLocations(text: string): string[] {
  const lower = text.toLowerCase();
  const found: string[] = [];
  for (const name of Object.keys(KNOWN_CITIES).sort((a, b) => b.length - a.length)) {
    if (new RegExp(`\\b${name}\\b`).test(lower)) {
      const city = KNOWN_CITIES[name];
      if (!found.includes(city)) found.push(city);
    }
  }
  for (const [re, city] of ZIP_PREFIXES) {
    if (re.test(text) && !found.includes(city)) {
      found.push(city);
    }
  }
  for (const m of text.matchAll(/([A-Za-z][A-Za-z .'-]{1,60}?),\s*([A-Za-z]{2})\b/g)) {
    const code = m[2].toUpperCase();
    if (!ABBRS.has(code) || (m[2] !== code && AMBIGUOUS.has(m[2]))) continue;
    const city = cityBefore(m[1]);
    if (city) {
      const formatted = `${titleCase(city.toLowerCase())}, ${code}`;
      if (!found.includes(formatted)) found.push(formatted);
    }
  }
  for (const name of Object.keys(STATES).sort((a, b) => b.length - a.length)) {
    if (new RegExp(`\\b${name}\\b`).test(lower)) {
      const state = titleCase(name);
      if (!found.includes(state)) found.push(state);
    }
  }
  if (!found.length && /\b(?:nationwide|usa|united states|all over (?:the )?us)\b/i.test(text)) {
    found.push('USA');
  }
  return found;
}

export function extractLocation(text: string): string {
  const locs = extractLocations(text);
  return locs[0] || '';
}

export function extractCategories(text: string): string[] {
  const cats: string[] = [];
  for (const [re, cat] of CATEGORY_RULES) {
    if (re.test(text) && !cats.includes(cat)) {
      cats.push(cat);
    }
  }
  return cats.length ? cats : ['Feed Store'];
}

export function extractKeywordsList(text: string): string[] {
  const keywords: string[] = [];
  for (const [re, term] of KEYWORD_TERMS) {
    if (re.test(text) && !keywords.includes(term)) {
      keywords.push(term);
    }
  }
  return keywords;
}

export function extractLimit(text: string): number {
  const m = text.match(/\b(\d{1,3})\s*(?:leads|prospects|stores|ranches|businesses|results|suppliers)?\b/i);
  if (m) {
    const n = parseInt(m[1], 10);
    if (n >= 10 && n <= 500) return n;
  }
  return 100;
}

export function extractPreferredSources(text: string): string[] {
  const sources: string[] = [];
  if (/\b(?:facebook|fb|facebook\s*pages?)\b/i.test(text)) sources.push('facebook');
  if (/\b(?:instagram|insta|ig)\b/i.test(text)) sources.push('instagram');
  if (/\b(?:groups?|facebook\s*groups?)\b/i.test(text)) sources.push('facebook_groups');
  if (/\b(?:google\s*maps?|maps?)\b/i.test(text)) sources.push('maps');
  if (/\b(?:osm|openstreetmap)\b/i.test(text)) sources.push('osm');
  if (/\b(?:google|web|search|website)\b/i.test(text) && !sources.length) sources.push('web');
  return sources.length ? sources : ['all'];
}

/** Zero-token planner. Always returns a valid plan with correct negation and Roman Urdu support. */
export function rulesPlan(description: string, fallbackLocation = ''): PlanResult {
  const text = description.slice(0, 300);
  const categories = extractCategories(text);
  const ruled = CATEGORY_RULES.find(([re]) => re.test(text))?.[1];
  const category = ruled || categories[0] || 'Feed Store';
  const locations = extractLocations(text);
  const location = locations[0] || fallbackLocation || 'Texas';
  const productInterest = INTEREST_RULES.find(([re]) => re.test(text))?.[1] || CATEGORY_INTEREST[category] || 'horse_salt';
  const keyword = [...new Set(KEYWORD_TERMS.filter(([re]) => re.test(text)).map(([, term]) => term))].slice(0, 4).join(' ');
  const keywords = extractKeywordsList(text);
  const resultsLimit = extractLimit(text);
  const sources = extractPreferredSources(text);

  // Robust negation handling (English + Roman Urdu)
  const hasNegWebsite = /\b(?:no\s+web(?:site)?|without\s+web(?:site)?|website\s+nahi|web\s+nahi|bina\s+web(?:site)?|baghair\s+web(?:site)?|website\s+na\s+ho|website\s+optional)\b/i.test(text);
  const requireWebsite = !hasNegWebsite && /\b(?:with\s+web(?:site)?s?|websites?|having\s+web(?:site)?s?|website\s+ho|website\s+lazmi|website\s+chahiye|website\s+required|must\s+have\s+web(?:site)?s?)\b/i.test(text);

  const hasNegPhone = /\b(?:no\s+phone|without\s+phone|phone\s+nahi|bina\s+phone|baghair\s+phone)\b/i.test(text);
  const requirePhone = !hasNegPhone && /\b(?:phone|call|contact\s+number|mobile|rabta|phone\s+numbers?|\bower\b|\bowner\b|\bcontact\b|\bdetails\b)\b/i.test(text);

  const hasNegEmail = /\b(?:no\s+email|without\s+email|email\s+nahi|bina\s+email|baghair\s+email)\b/i.test(text);
  const requireEmail = !hasNegEmail && /\b(?:with\s+emails?|email\s+ho|emails?|e-mail)\b/i.test(text);

  return {
    plan: {
      category,
      location: location || fallbackLocation,
      categories: categories.length ? categories : [category],
      locations: locations.length ? locations : (location ? [location] : ['Houston, TX']),
      keywords: keywords.length ? keywords : (keyword ? keyword.split(' ') : ['feed store', 'livestock', 'mineral']),
      keyword,
      resultsLimit,
      sources,
      productInterest,
      requireWebsite,
      requirePhone,
      requireEmail,
      wholesaleOnly: /wholesal|distributor|bulk|namak/i.test(text),
      privateLabelOnly: /private[\s-]?label/i.test(text),
      excludeSaved: /\bnew only\b|not saved|fresh|naye|nayi|naya/i.test(text),
      searchDepth: /deep|expanded|more results|zyada|ziada|zada|maximum|\bmax\b/i.test(text) ? 2 : 1,
    },
    source: 'rules',
    confident: Boolean(ruled && location),
  };
}

export function buildPlannerPrompt(description: string): string {
  return `Map this B2B lead-search request (any language) for a US Himalayan salt seller to JSON.
c: one of Ranch & Horse Facility (ranches, stables, horse farms, cattle)|Feed Store|Farm Supply|Equestrian Store|Livestock Distributor|Salt Wholesaler|Spice Retailer|Specialty Food Distributor|Private Label Buyer
i: one of ${PRODUCT_INTERESTS.join('|')}
l: US "City, ST", state name, "USA", or ""
k: up to 4 English search words not already implied by c, or ""
w,p,e: true only if website/phone/email is required
ws: true if wholesale/distributor wanted
JSON only: {"c":"","i":"","l":"","k":"","w":false,"p":false,"e":false,"ws":false}
Request: ${JSON.stringify(description)}`;
}

/** Validates AI output against the enums; anything invalid falls back to rules. */
export function mergeAIPlan(raw: string, base: SearchPlan): SearchPlan {
  const parsed = JSON.parse(raw.replace(/```(?:json)?/g, '').trim()) as Record<string, unknown>;
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/<[^>]*>/g, '').replace(/[^\w\s,.'&-]/g, '').trim().slice(0, max) : '');
  const category = typeof parsed.c === 'string' && BUYER_CATEGORIES.includes(parsed.c) ? parsed.c : base.category;
  const interest = PRODUCT_INTERESTS.includes(parsed.i as ProductInterest) ? (parsed.i as ProductInterest) : base.productInterest;

  return {
    ...base,
    category,
    productInterest: interest,
    location: str(parsed.l, 160) || base.location,
    keyword: str(parsed.k, 80).split(/\s+/).slice(0, 4).join(' ') || base.keyword,
    requireWebsite: base.requireWebsite && parsed.w !== false ? true : (base.requireWebsite ? true : parsed.w === true),
    requirePhone: base.requirePhone || parsed.p === true,
    requireEmail: base.requireEmail || parsed.e === true,
    wholesaleOnly: base.wholesaleOnly || parsed.ws === true,
  };
}

const cache = new Map<string, PlanResult>();

export async function planLeadSearch(
  description: string,
  options: { fallbackLocation?: string; ask?: (prompt: string) => Promise<{ text: string; providerUsed: string }> } = {},
): Promise<PlanResult> {
  const text = description.replace(/\s+/g, ' ').trim().slice(0, 300);
  if (!text) throw new Error('Describe who you want to find.');
  const rules = rulesPlan(text, options.fallbackLocation?.slice(0, 160) || '');
  if (rules.confident || !options.ask) return rules;

  const key = text.toLowerCase();
  const hit = cache.get(key);
  if (hit) return { ...hit, plan: { ...hit.plan, location: hit.plan.location || rules.plan.location } };
  try {
    const { text: raw, providerUsed } = await options.ask(buildPlannerPrompt(text));
    const result: PlanResult = { plan: mergeAIPlan(raw, rules.plan), source: 'ai', confident: true, provider: providerUsed };
    if (cache.size >= 50) cache.delete(cache.keys().next().value as string);
    cache.set(key, result);
    return result;
  } catch {
    return rules;
  }
}
