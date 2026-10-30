/**
 * Himalayan Koh LeadOS 3.3 — Advanced Website Crawler & Business Enrichment Engine
 * 
 * Features:
 * 1. Safe URL validation & SSRF protection (private IP, metadata, loopback disallow).
 * 2. Domain-level crawling queue with per-host rate limiting (min 1200ms spacing).
 * 3. Inspection of permitted public business pages:
 *    - Homepage
 *    - About Us (/about, /about-us, /our-story)
 *    - Contact (/contact, /contact-us, /locations)
 *    - Products & Services (/products, /services, /feed, /equine)
 *    - Wholesale & Dealer (/wholesale, /dealers, /become-a-dealer)
 * 4. Structured data extraction:
 *    - JSON-LD (schema.org/LocalBusiness, Organization, Store)
 *    - OpenGraph & Meta tags
 *    - Real US business telephone & email validation
 *    - Social profile URLs (Facebook, Instagram, LinkedIn)
 *    - Wholesale/dealer opportunities detection
 * 5. Extraction confidence scoring (0-100) and lead quality grading:
 *    - discovered -> commercial_prospect -> qualified_buyer -> verified_contactable
 * 6. Deduplication and source evidence timestamps.
 */

import { checkFetchableUrl } from '@/lib/scrape/urlSafety';
import { isInformationalDomain } from './intelligence';
import type { NormalizedLead, LeadResearch, SourceEvidence } from './types';

export interface CrawlExtractionResult {
  url: string;
  success: boolean;
  httpStatus?: number;
  companyName?: string | null;
  category?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  phone?: string | null;
  email?: string | null;
  facebookUrl?: string | null;
  instagramUrl?: string | null;
  linkedinUrl?: string | null;
  hasWholesaleOpportunity: boolean;
  wholesaleDetails?: string | null;
  productRelevanceTags: string[];
  confidenceScore: number;
  qualityStage: 'discovered' | 'commercial_prospect' | 'qualified_buyer' | 'verified_contactable';
  evidence: SourceEvidence[];
  error?: string | null;
  crawledAt: string;
}

// In-memory domain rate limiter: ensures minimum 1200ms spacing per domain
const DOMAIN_LAST_CRAWL = new Map<string, number>();
const MIN_PER_HOST_DELAY_MS = 1200;

// Maximum pages to crawl per domain in a single enrichment run
const MAX_PAGES_PER_DOMAIN = 3;

// Common non-business email patterns to block (spam traps, placeholders, webmasters)
const JUNK_EMAIL_PATTERNS = [
  /example\./i,
  /domain\.com/i,
  /yourname/i,
  /sentry\./i,
  /wixpress\.com/i,
  /wordpress\.com/i,
  /cloudflare/i,
  /@2x\.png/i,
  /@3x\.png/i,
  /\.png$/i,
  /\.jpg$/i,
  /\.svg$/i,
  /\.webp$/i,
  /user@/i,
  /email@/i,
  /test@/i,
  /admin@localhost/i,
];

// Target business page paths to inspect
const TARGET_PAGE_PATTERNS = [
  { slug: 'contact', regex: /\b(contact|contact-us|locations|reach-us)\b/i },
  { slug: 'about', regex: /\b(about|about-us|our-story|who-we-are|history)\b/i },
  { slug: 'wholesale', regex: /\b(wholesale|dealers|become-a-dealer|distribution|retailers|bulk)\b/i },
  { slug: 'products', regex: /\b(products|services|feed|equine|livestock|salt)\b/i },
];

/** Cached robots.txt rules per hostname (1 hour TTL) */
interface RobotsPolicy {
  disallowPaths: string[];
  allowPaths: string[];
  expiresAt: number;
}
const ROBOTS_CACHE = new Map<string, RobotsPolicy>();

/**
 * Checks whether a given path is allowed by robots.txt
 */
export async function isRobotsAllowed(targetUrl: string, timeoutMs = 4000): Promise<boolean> {
  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return false;
  }

  const hostname = parsed.hostname.toLowerCase();
  const now = Date.now();
  const cached = ROBOTS_CACHE.get(hostname);

  if (cached && cached.expiresAt > now) {
    return evaluateRobotsRules(parsed.pathname, cached);
  }

  // Fetch robots.txt with SSRF guard and small 16KB limit
  const robotsUrl = `${parsed.protocol}//${parsed.host}/robots.txt`;
  const safety = checkFetchableUrl(robotsUrl);
  if (!safety.ok) {
    return false;
  }

  let policy: RobotsPolicy = { disallowPaths: [], allowPaths: [], expiresAt: now + 3600 * 1000 };

  try {
    const res = await fetch(safety.url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) HimalayanKohResearchBot/3.3 (+https://himalayankoh.com)',
        'Accept': 'text/plain,*/*;q=0.8',
      },
      signal: AbortSignal.timeout(timeoutMs),
      cache: 'no-store',
      redirect: 'manual',
    });

    if (res.status === 200) {
      const reader = res.body?.getReader();
      if (reader) {
        let text = '';
        const decoder = new TextDecoder('utf-8');
        let bytes = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.length;
          text += decoder.decode(value, { stream: true });
          if (bytes >= 16 * 1024) {
            await reader.cancel();
            break;
          }
        }
        text += decoder.decode();
        policy = parseRobotsTxt(text, now);
      }
    }
  } catch {
    // If robots.txt fails or is unreachable, allow with short 10m fallback
    policy.expiresAt = now + 600 * 1000;
  }

  ROBOTS_CACHE.set(hostname, policy);
  return evaluateRobotsRules(parsed.pathname, policy);
}

function parseRobotsTxt(content: string, now: number): RobotsPolicy {
  const lines = content.split(/\r?\n/);
  let relevantAgent = false;
  const disallowPaths: string[] = [];
  const allowPaths: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;

    const [directive, ...rest] = line.split(':');
    const key = (directive || '').trim().toLowerCase();
    const val = rest.join(':').trim();

    if (key === 'user-agent') {
      const agent = val.toLowerCase();
      relevantAgent = agent === '*' || agent.includes('himalayankoh');
    } else if (relevantAgent) {
      if (key === 'disallow' && val) {
        disallowPaths.push(val);
      } else if (key === 'allow' && val) {
        allowPaths.push(val);
      }
    }
  }

  return { disallowPaths, allowPaths, expiresAt: now + 3600 * 1000 };
}

function evaluateRobotsRules(pathname: string, policy: RobotsPolicy): boolean {
  for (const allow of policy.allowPaths) {
    if (pathname.startsWith(allow)) return true;
  }
  for (const disallow of policy.disallowPaths) {
    if (disallow === '/' || pathname.startsWith(disallow)) return false;
  }
  return true;
}

/**
 * Throttle requests to the same domain to respect host resources
 */
async function throttleDomain(hostname: string): Promise<void> {
  const lastTime = DOMAIN_LAST_CRAWL.get(hostname) || 0;
  const now = Date.now();
  const elapsed = now - lastTime;
  if (elapsed < MIN_PER_HOST_DELAY_MS) {
    const waitTime = MIN_PER_HOST_DELAY_MS - elapsed;
    await new Promise((resolve) => setTimeout(resolve, waitTime));
  }
  DOMAIN_LAST_CRAWL.set(hostname, Date.now());
}

/**
 * Safe fetch with manual redirect validation against SSRF restrictions,
 * robots.txt verification, and response streaming with early byte ceiling cancellation.
 */
export async function safeFetchHtml(
  rawUrl: string,
  timeoutMs = 8000,
  maxRedirects = 3
): Promise<{ html: string; status: number; finalUrl: string } | null> {
  let currentUrl = rawUrl;
  let redirectsRemaining = maxRedirects;

  while (redirectsRemaining >= 0) {
    const safety = checkFetchableUrl(currentUrl);
    if (!safety.ok) {
      return null;
    }

    let parsed: URL;
    try {
      parsed = new URL(safety.url);
    } catch {
      return null;
    }

    if (isInformationalDomain(parsed.hostname)) {
      return null;
    }

    const robotsOk = await isRobotsAllowed(safety.url, Math.min(timeoutMs, 4000));
    if (!robotsOk) {
      return null;
    }

    await throttleDomain(parsed.hostname);

    try {
      const res = await fetch(safety.url, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) HimalayanKohResearchBot/3.3 (+https://himalayankoh.com)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        signal: AbortSignal.timeout(timeoutMs),
        cache: 'no-store',
        redirect: 'manual',
      });

      // Handle HTTP redirects manually with SSRF validation on every hop
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location');
        if (!location || redirectsRemaining === 0) {
          return null;
        }
        let nextUrl: string;
        try {
          nextUrl = new URL(location, currentUrl).toString();
        } catch {
          return null;
        }

        // Validate redirected URL against SSRF rules before following
        const nextSafety = checkFetchableUrl(nextUrl);
        if (!nextSafety.ok) {
          return null;
        }

        currentUrl = nextSafety.url;
        redirectsRemaining--;
        continue;
      }

      if (!res.ok) {
        return { html: '', status: res.status, finalUrl: currentUrl };
      }

      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
        return null;
      }

      // Stream response chunks up to 512 KB, canceling reader immediately once ceiling is met
      const reader = res.body?.getReader();
      if (!reader) {
        return null;
      }

      const decoder = new TextDecoder('utf-8');
      let html = '';
      let receivedBytes = 0;
      const MAX_BYTES = 512 * 1024; // 512 KB streaming limit

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        receivedBytes += value.length;
        html += decoder.decode(value, { stream: true });
        if (receivedBytes >= MAX_BYTES) {
          await reader.cancel();
          break;
        }
      }
      html += decoder.decode();

      return { html, status: res.status, finalUrl: currentUrl };
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Extract JSON-LD structured data from HTML
 */
function extractJsonLd(html: string): Record<string, any>[] {
  const jsonLdBlocks: Record<string, any>[] = [];
  const scriptRegex = /<script\s+[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;

  while ((match = scriptRegex.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim());
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (typeof item === 'object' && item !== null) jsonLdBlocks.push(item);
        }
      } else if (typeof parsed === 'object' && parsed !== null) {
        if (parsed['@graph'] && Array.isArray(parsed['@graph'])) {
          for (const item of parsed['@graph']) {
            if (typeof item === 'object' && item !== null) jsonLdBlocks.push(item);
          }
        } else {
          jsonLdBlocks.push(parsed);
        }
      }
    } catch {
      // Ignore invalid JSON-LD blocks
    }
  }

  return jsonLdBlocks;
}

/**
 * Extract phone numbers matching US business formats
 */
function extractPhones(html: string): string[] {
  const phones = new Set<string>();

  // 1. Tel link check: <a href="tel:...">
  const telRegex = /href=["']tel:([^"']+)["']/gi;
  let telMatch: RegExpExecArray | null;
  while ((telMatch = telRegex.exec(html)) !== null) {
    const raw = telMatch[1].replace(/[^0-9]/g, '');
    if (raw.length === 10) {
      phones.add(`(${raw.slice(0, 3)}) ${raw.slice(3, 6)}-${raw.slice(6)}`);
    } else if (raw.length === 11 && raw.startsWith('1')) {
      phones.add(`(${raw.slice(1, 4)}) ${raw.slice(4, 7)}-${raw.slice(7)}`);
    }
  }

  // 2. Visible text check for standard US formats
  const textPhoneRegex = /\b(?:\+?1[-.\s]?)?\(?([2-9]\d{2})\)?[-.\s]?([2-9]\d{2})[-.\s]?(\d{4})\b/g;
  let textMatch: RegExpExecArray | null;
  while ((textMatch = textPhoneRegex.exec(html)) !== null) {
    const formatted = `(${textMatch[1]}) ${textMatch[2]}-${textMatch[3]}`;
    phones.add(formatted);
    if (phones.size >= 3) break;
  }

  return Array.from(phones);
}

/**
 * Extract business email addresses with junk filtering
 */
function extractEmails(html: string): string[] {
  const emails = new Set<string>();

  // 1. Mailto link check: <a href="mailto:...">
  const mailtoRegex = /href=["']mailto:([^"'\s?]+)["']/gi;
  let mailtoMatch: RegExpExecArray | null;
  while ((mailtoMatch = mailtoRegex.exec(html)) !== null) {
    const email = mailtoMatch[1].trim().toLowerCase();
    if (isValidBusinessEmail(email)) {
      emails.add(email);
    }
  }

  // 2. Visible text check
  const textEmailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
  let textMatch: RegExpExecArray | null;
  while ((textMatch = textEmailRegex.exec(html)) !== null) {
    const email = textMatch[0].trim().toLowerCase();
    if (isValidBusinessEmail(email)) {
      emails.add(email);
    }
    if (emails.size >= 3) break;
  }

  return Array.from(emails);
}

export function isValidBusinessEmail(email: string): boolean {
  if (!email || email.length < 6 || email.length > 80) return false;
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(email)) return false;
  return !JUNK_EMAIL_PATTERNS.some((p) => p.test(email));
}

/**
 * Extract social media profiles
 */
function extractSocialProfiles(html: string): { facebook?: string; instagram?: string; linkedin?: string } {
  let facebook: string | undefined;
  let instagram: string | undefined;
  let linkedin: string | undefined;

  const fbMatch = html.match(/href=["'](https?:\/\/(?:www\.)?facebook\.com\/(?:pages\/|people\/|[A-Za-z0-9._-]+)\/?)["']/i);
  if (fbMatch && !fbMatch[1].includes('/sharer') && !fbMatch[1].includes('/share.php')) {
    facebook = fbMatch[1];
  }

  const igMatch = html.match(/href=["'](https?:\/\/(?:www\.)?instagram\.com\/[A-Za-z0-9._-]+\/?)["']/i);
  if (igMatch && !igMatch[1].includes('/p/') && !igMatch[1].includes('/reel/')) {
    instagram = igMatch[1];
  }

  const liMatch = html.match(/href=["'](https?:\/\/(?:www\.)?linkedin\.com\/company\/[A-Za-z0-9._-]+\/?)["']/i);
  if (liMatch && !liMatch[1].includes('/sharing')) {
    linkedin = liMatch[1];
  }

  return { facebook, instagram, linkedin };
}

/**
 * Detect wholesale / dealer opportunities in page text
 */
export function detectWholesaleOpportunity(html: string): { hasWholesale: boolean; excerpt?: string } {
  const plainText = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const wholesaleKeywords = [
    /\bwholesale\b/i,
    /become a dealer/i,
    /dealer application/i,
    /\bdealers?\b/i,
    /\bdistributors?\b/i,
    /wholesale pricing/i,
    /\bbulk (?:orders?|feed|supply|pallet|livestock)\b/i,
    /retailer partnership/i,
    /private label/i,
  ];

  for (const re of wholesaleKeywords) {
    const match = re.exec(plainText);
    if (match) {
      const idx = match.index;
      const start = Math.max(0, idx - 40);
      const end = Math.min(plainText.length, idx + match[0].length + 40);
      return {
        hasWholesale: true,
        excerpt: plainText.slice(start, end).trim(),
      };
    }
  }

  return { hasWholesale: false };
}

export function detectWholesaleSignals(html: string): { hasOpportunity: boolean; signals: string[]; excerpt?: string } {
  const opp = detectWholesaleOpportunity(html);
  return {
    hasOpportunity: opp.hasWholesale,
    signals: opp.hasWholesale ? [opp.excerpt || 'wholesale'] : [],
    excerpt: opp.excerpt,
  };
}

export function calculateExtractionConfidence(details: {
  companyName?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  hasWholesale?: boolean;
  sourceCount?: number;
}): number {
  let score = 25;
  if (details.companyName) score += 20;
  if (details.phone) score += 15;
  if (details.email) score += 15;
  if (details.address) score += 10;
  if (details.hasWholesale) score += 10;
  if ((details.sourceCount || 0) > 1) score += 10;
  return Math.min(100, score);
}

/**
 * Discover relevant internal link candidates from homepage
 */
function findInternalLinks(html: string, baseUrl: string): string[] {
  const found = new Set<string>();
  const linkRegex = /href=["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;

  while ((match = linkRegex.exec(html)) !== null) {
    const rawHref = match[1].trim();
    if (!rawHref || rawHref.startsWith('#') || rawHref.startsWith('mailto:') || rawHref.startsWith('tel:') || rawHref.startsWith('javascript:')) {
      continue;
    }

    try {
      const resolved = new URL(rawHref, baseUrl);
      const baseParsed = new URL(baseUrl);

      // Must be same hostname
      if (resolved.hostname !== baseParsed.hostname) continue;

      // Check if matches one of the target page slugs
      const pathAndQuery = resolved.pathname.toLowerCase();
      const isTargetPage = TARGET_PAGE_PATTERNS.some((p) => p.regex.test(pathAndQuery));
      if (isTargetPage) {
        found.add(resolved.toString());
      }
    } catch {
      // Ignore URL parse error
    }

    if (found.size >= 5) break;
  }

  return Array.from(found);
}

/**
 * Main Business Website Crawler & Enrichment Pipeline
 */
export async function crawlBusinessWebsite(
  websiteUrl: string,
  options?: {
    knownBusinessName?: string;
    knownCategory?: string;
  }
): Promise<CrawlExtractionResult> {
  const timestamp = new Date().toISOString();
  const evidence: SourceEvidence[] = [];

  const safety = checkFetchableUrl(websiteUrl);
  if (!safety.ok) {
    return {
      url: websiteUrl,
      success: false,
      hasWholesaleOpportunity: false,
      productRelevanceTags: [],
      confidenceScore: 0,
      qualityStage: 'discovered',
      evidence: [],
      error: safety.reason || 'Invalid or restricted website URL',
      crawledAt: timestamp,
    };
  }

  const normalizedUrl = safety.url;
  const homeRes = await safeFetchHtml(normalizedUrl, 8000);

  if (!homeRes || !homeRes.html) {
    return {
      url: normalizedUrl,
      success: false,
      httpStatus: homeRes?.status || 0,
      hasWholesaleOpportunity: false,
      productRelevanceTags: [],
      confidenceScore: 10,
      qualityStage: 'discovered',
      evidence: [],
      error: `Could not fetch website (HTTP ${homeRes?.status || 'network error'})`,
      crawledAt: timestamp,
    };
  }

  evidence.push({
    url: normalizedUrl,
    retrievedAt: timestamp,
    kind: 'website',
    status: 'verified',
    excerpt: `Crawled homepage (HTTP ${homeRes.status})`,
  });

  // Extract from homepage
  let allHtml = homeRes.html;
  const jsonLdBlocks = extractJsonLd(homeRes.html);
  let companyName: string | null = null;
  let category: string | null = options?.knownCategory || null;
  let address: string | null = null;
  let city: string | null = null;
  let state: string | null = null;
  let postalCode: string | null = null;
  let phone: string | null = null;
  let email: string | null = null;

  // Inspect JSON-LD blocks for Schema.org LocalBusiness / Organization
  for (const block of jsonLdBlocks) {
    if (block.name && !companyName) companyName = String(block.name);
    if (block.telephone && !phone) phone = String(block.telephone);
    if (block.email && !email && isValidBusinessEmail(String(block.email))) email = String(block.email);
    if (block.address) {
      if (typeof block.address === 'string') {
        address = block.address;
      } else if (typeof block.address === 'object') {
        address = [block.address.streetAddress, block.address.addressLocality, block.address.addressRegion, block.address.postalCode]
          .filter(Boolean)
          .join(', ');
        city = block.address.addressLocality || null;
        state = block.address.addressRegion || null;
        postalCode = block.address.postalCode || null;
      }
    }
  }

  // Fallback to title / og:site_name
  if (!companyName) {
    const ogSite = homeRes.html.match(/property=["']og:site_name["']\s+content=["']([^"']+)["']/i);
    const titleMatch = homeRes.html.match(/<title>([^<]+)<\/title>/i);
    if (ogSite && ogSite[1]) {
      companyName = ogSite[1].trim();
    } else if (titleMatch && titleMatch[1]) {
      companyName = titleMatch[1].split(/[|\-–•]/)[0].trim();
    }
  }

  // Crawl secondary permitted pages (contact, about, wholesale)
  const secondaryLinks = findInternalLinks(homeRes.html, normalizedUrl).slice(0, MAX_PAGES_PER_DOMAIN - 1);
  for (const subLink of secondaryLinks) {
    const subRes = await safeFetchHtml(subLink, 6000);
    if (subRes && subRes.html) {
      allHtml += '\n' + subRes.html;
      evidence.push({
        url: subLink,
        retrievedAt: timestamp,
        kind: 'website',
        status: 'verified',
        excerpt: `Inspected sub-page: ${new URL(subLink).pathname}`,
      });
    }
  }

  // Extract contacts from accumulated HTML
  const extractedPhones = extractPhones(allHtml);
  const extractedEmails = extractEmails(allHtml);
  const socials = extractSocialProfiles(allHtml);
  const wholesale = detectWholesaleOpportunity(allHtml);

  if (socials.facebook) {
    evidence.push({
      url: socials.facebook,
      retrievedAt: timestamp,
      kind: 'website',
      status: 'verified',
      excerpt: 'Facebook Profile',
    });
  }
  if (socials.instagram) {
    evidence.push({
      url: socials.instagram,
      retrievedAt: timestamp,
      kind: 'website',
      status: 'verified',
      excerpt: 'Instagram Profile',
    });
  }

  if (!phone && extractedPhones.length > 0) phone = extractedPhones[0];
  if (!email && extractedEmails.length > 0) email = extractedEmails[0];

  // Detect product relevance tags
  const relevanceTags: string[] = [];
  const lowerText = allHtml.toLowerCase();
  if (lowerText.includes('feed') || lowerText.includes('grain') || lowerText.includes('hay')) relevanceTags.push('feed_supply');
  if (lowerText.includes('horse') || lowerText.includes('equine') || lowerText.includes('tack') || lowerText.includes('stable')) relevanceTags.push('equine_nutrition');
  if (lowerText.includes('cattle') || lowerText.includes('livestock') || lowerText.includes('ranch')) relevanceTags.push('livestock_ranch');
  if (lowerText.includes('salt lick') || lowerText.includes('mineral lick') || lowerText.includes('rock salt')) relevanceTags.push('salt_lick_distributor');
  if (lowerText.includes('pink salt') || lowerText.includes('himalayan salt') || lowerText.includes('halotherapy') || lowerText.includes('salt room')) relevanceTags.push('himalayan_salt');

  // Calculate confidence score (0 to 100)
  let confidenceScore = 25; // Base for accessible website
  if (companyName) confidenceScore += 20;
  if (jsonLdBlocks.length > 0) confidenceScore += 15;
  if (phone) confidenceScore += 15;
  if (email) confidenceScore += 15;
  if (socials.facebook || socials.instagram) confidenceScore += 10;
  confidenceScore = Math.min(100, confidenceScore);

  // Determine quality stage
  let qualityStage: CrawlExtractionResult['qualityStage'] = 'commercial_prospect';
  if (relevanceTags.length >= 2 || wholesale.hasWholesale) {
    qualityStage = 'qualified_buyer';
  }
  if (phone && (email || socials.facebook)) {
    qualityStage = 'verified_contactable';
  }

  return {
    url: normalizedUrl,
    success: true,
    httpStatus: homeRes.status,
    companyName: companyName || options?.knownBusinessName || null,
    category,
    address,
    city,
    state,
    postalCode,
    phone,
    email,
    facebookUrl: socials.facebook || null,
    instagramUrl: socials.instagram || null,
    linkedinUrl: socials.linkedin || null,
    hasWholesaleOpportunity: wholesale.hasWholesale,
    wholesaleDetails: wholesale.excerpt || null,
    productRelevanceTags: relevanceTags,
    confidenceScore,
    qualityStage,
    evidence,
    error: null,
    crawledAt: timestamp,
  };
}

/**
 * Enrich a normalized lead record with autonomous crawler findings
 */
export async function enrichLeadWithCrawler(lead: NormalizedLead): Promise<NormalizedLead> {
  if (!lead.website) return lead;

  try {
    const result = await crawlBusinessWebsite(lead.website, {
      knownBusinessName: lead.businessName,
      knownCategory: lead.category || undefined,
    });

    if (!result.success) return lead;

    const updatedResearch: LeadResearch = {
      ...(lead.research || {}),
      contactPage: result.url || lead.research?.contactPage,
      lastVerifiedAt: result.crawledAt,
      sources: [
        ...(lead.research?.sources || []),
        ...result.evidence,
      ],
      facebook: lead.facebook || result.facebookUrl || lead.research?.facebook || undefined,
      instagram: lead.instagram || result.instagramUrl || lead.research?.instagram || undefined,
    };

    return {
      ...lead,
      businessName: result.companyName && result.companyName.length > 3 ? result.companyName : lead.businessName,
      phone: lead.phone || result.phone || null,
      email: lead.email || result.email || null,
      emailSource: lead.email ? lead.emailSource : (result.email ? 'company_website' : lead.emailSource),
      address: lead.address || result.address || null,
      city: lead.city || result.city || null,
      region: lead.region || result.state || null,
      facebook: lead.facebook || result.facebookUrl || null,
      instagram: lead.instagram || result.instagramUrl || null,
      research: updatedResearch,
    };
  } catch {
    return lead;
  }
}
