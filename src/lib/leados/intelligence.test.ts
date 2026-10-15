import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createIntroduction,
  createOutreachMessage,
  deduplicateLeads,
  leadIdentity,
  matchingKnownLead,
  OFFER_PROFILES,
  publicCompanyUrl,
  qualifyLead,
  classifyLeadEntity,
  isInformationalDomain,
} from './intelligence';
import { discoveryQuery, normalizeSearchResults } from './discovery';
import { outreachReadiness, dispatchApprovedDraft } from './n8n';
import { searchNominatimKeywords } from './osm-provider';
import type { NormalizedLead } from './types';
const lead: NormalizedLead = { businessName:'Texas Feed Supply',category:'Feed Store',address:'1 Main St',city:'Houston',region:'TX',country:'US',website:'https://feed.example.org',phone:null,email:null,latitude:null,longitude:null,osmType:'node',osmId:'1',osmUrl:'https://www.openstreetmap.org/node/1',dataSource:'openstreetmap' };
afterEach(() => {vi.unstubAllGlobals();vi.unstubAllEnvs();});
describe('LeadOS 2 evidence and identity', () => {
  it('merges repeated source identities but keeps different branches', () => {
    const a={...lead,research:{sources:[{url:lead.osmUrl!,retrievedAt:'2026-10-12',kind:'osm',status:'verified' as const}]}};
    const b={...lead,website:'https://www.feed.example.org/',research:{sources:[{url:'https://feed.example.org/contact',retrievedAt:'2026-10-12',kind:'company',status:'verified' as const}]}};
    const d=deduplicateLeads([a,b,{...lead,address:'2 Main St'}]);
    expect(d.duplicatesRemoved).toBe(1);expect(d.leads).toHaveLength(2);expect(d.leads[0].research?.sources).toHaveLength(2);
    expect(leadIdentity(a)).not.toBe(leadIdentity({...a,city:'Dallas'}));
  });
  it.each(['http://127.0.0.1','http://169.254.169.254','https://user:pass@example.org','https://example.org:8080','https://linkedin.com/company/a','https://example.org/account'])('rejects unsafe/private/profile targets %s', (url) => expect(publicCompanyUrl(url)).toBeNull());
  it('does not convert search snippets into company facts or inferred emails', () => {
    const results=normalizeSearchResults([{title:'Texas Salt Supply | Wholesale',url:'https://salt.example.org',content:'Private label salt wholesaler USA sales@salt.example.org'}],{category:'Salt Wholesaler',location:'USA'},'2026-10-12T12:00:00Z');
    expect(results).toHaveLength(1);expect(results[0].country).toBeNull();expect(results[0].email).toBeNull();expect(results[0].research?.sources?.[0].status).toBe('inferred');
    const q=qualifyLead(results[0],'private_label');expect(q.breakdown.privateLabel).toBe(0);expect(q.breakdown.wholesale).toBe(0);expect(q.qualified).toBe(false);
  });
  it('scores explicit public evidence and excludes unrelated industries', () => {
    const q=qualifyLead({...lead,email:'sales@feed.example.org',emailSource:'company_website',research:{sources:[{url:lead.website!,retrievedAt:'2026-10-12',kind:'company_page',status:'verified',excerpt:'We supply livestock feed wholesale to farm retailers.'}]}});
    expect(q.score).toBe(87);expect(q.qualified).toBe(true);expect(q.reasons.join(' ')).not.toMatch(/turnover|budget/i);
    expect(qualifyLead({...lead,businessName:'Salt Software Marketing Agency'}).score).toBe(0);
  });
  it('offers only recorded active product IDs and treats private label as potential', () => {
    expect(Object.values(OFFER_PROFILES).flatMap((p)=>p.productIds)).not.toContain('2531');
    expect(createIntroduction(lead,'culinary_salt').message).toContain('16 oz');
    expect(createIntroduction(lead,'private_label').message).toContain('subject to confirming our capabilities');
    expect(createIntroduction(lead,'culinary_salt').message).not.toMatch(/5 lb|25 lb|complimentary|certified|free samples/i);
  });
  it('does not qualify an unrelated website from the selected search category', () => {
    const candidate = {...lead, osmUrl:null, dataSource:'searxng' as const, research:{sources:[{url:lead.website!,retrievedAt:'2026-10-12',kind:'company_page',status:'verified' as const,excerpt:'We sell office chairs and stationery.'}]}};
    const q = qualifyLead(candidate,'horse_salt');
    expect(q.breakdown.category).toBe(0); expect(q.breakdown.product).toBe(0); expect(q.qualified).toBe(false);
  });
  it('removes directory listings and merges a company homepage with product sections', () => {
    const results = normalizeSearchResults([
      {title:'Texas Feed Company',url:'https://feed.example.org/',content:'Livestock feed'},
      {title:'Livestock feed products',url:'https://feed.example.org/products',content:'Farm supplies'},
      {title:'Texas feed manufacturers',url:'https://whereorg.com/businesses/livestock-feed-tx',content:'Feed companies'},
    ],{category:'Feed Store',location:'Texas'},'2026-10-12T12:00:00Z');
    expect(results).toHaveLength(1); expect(results[0].research?.sources).toHaveLength(2); expect(results[0].website).toBe('https://feed.example.org/');
  });
  it('never harvests POIs from public Nominatim', async () => {
    const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
    expect((await searchNominatimKeywords('feed','Texas',null,20,'Feed Store')).error).toContain('disabled');expect(fetch).not.toHaveBeenCalled();
  });
  it('merges a generic web title into one known company location but preserves multiple branches',()=>{
    const generic={...lead,businessName:'Houston Feed Store | Feed and Garden',address:null,city:null,region:null,osmUrl:null,dataSource:'searxng'};
    const merged=deduplicateLeads([generic,lead]);expect(merged.leads).toHaveLength(1);expect(merged.leads[0].businessName).toBe(lead.businessName);
    expect(deduplicateLeads([generic,lead,{...lead,address:'2 Main St',city:'Dallas'}]).leads).toHaveLength(3);
  });
  it('excludes observed travel-directory and review-directory results',()=>{
    expect(normalizeSearchResults([{title:'Wabash Feed',url:'https://www.visithoustontexas.com/listings/wabash/123/',content:'Feed store'},{title:'Feed Supply',url:'https://www.loc8nearme.com/texas/feed/1/',content:'Feed'}],{category:'Feed Store',location:'Houston'},'2026-10-13')).toHaveLength(0);
  });
  it('uses the observed published company name in introductions',()=>{
    const intro=createIntroduction({...lead,research:{publicCompanyName:'Verified Feed Company'}},'horse_salt');expect(intro.subject).toContain('Verified Feed Company');expect(intro.message).toContain('Hello Verified Feed Company team');
  });
  it('narrows private-label and distributor queries to the actual salt/feed niche',()=>{
    expect(discoveryQuery({category:'Private Label Buyer',location:'USA'})).toContain('Himalayan pink salt private label wholesale');
    expect(discoveryQuery({category:'Livestock Distributor',location:'Texas'})).toContain('livestock feed agricultural supply distributor');
  });
  it('keeps actual equestrian companies and excludes the directories seen in Dallas QA',()=>{
    const results=normalizeSearchResults([{title:'Dover Saddlery Dallas',url:'https://usa.wheretoride.horse/us/dallas/dover-saddlery',content:'Horse tack store'},{title:'Tack Shops in Dallas - NewHorse.com',url:'https://www.newhorse.com/page/tackshops/dallas',content:'Equestrian tack shops'},{title:'State - Texas',url:'https://stullfeeders.com/properties/list',content:'Feed suppliers'},{title:'Dover Saddlery English Tack',url:'https://www.doversaddlery.com/',content:'Horse tack supplier'}],{category:'Equestrian Store',location:'Dallas'},'2026-10-13');
    expect(results.map(r=>r.website)).toEqual(['https://www.doversaddlery.com/']);
  });
  it('recognizes a saved company behind a generic search title without guessing its branch',()=>{
    const generic={...lead,businessName:'Himalayan Salt Supplier',address:null,city:null,region:null};
    expect(matchingKnownLead(generic,[lead])).toBe(lead);
    expect(matchingKnownLead(generic,[lead,{...lead,address:'2 Main St',city:'Dallas'}])).toBeUndefined();
    expect(matchingKnownLead({...generic,website:lead.website+'/locations/dallas'},[lead])).toBeUndefined();
    expect(matchingKnownLead({...lead,address:'Different address'},[lead])).toBeUndefined();
  });
});
describe('Outbound configuration fails closed', () => {
  it('does not call n8n while disabled or unverified', async () => {
    vi.stubEnv('LEADOS_OUTREACH_ENABLED','false');const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
    expect(outreachReadiness().ready).toBe(false);
    expect(await dispatchApprovedDraft({id:'draft-1',recipient:'sales@example.org',subject:'Intro',message:'Hi'})).toMatchObject({state:'blocked'});expect(fetch).not.toHaveBeenCalled();
  });
});

describe('Lead Quality Filter & Informational Quarantine (Phase 1 Acceptance)', () => {
  const badExamples = [
    { title: 'Equestrianism - Wikipedia', url: 'https://en.wikipedia.org/wiki/Equestrianism' },
    { title: 'Equestrian Definition & Meaning - Merriam-Webster', url: 'https://www.merriam-webster.com/dictionary/equestrian' },
    { title: 'FEED Definition & Meaning | Dictionary.com', url: 'https://www.dictionary.com/browse/feed' },
    { title: 'FEED | English meaning - Cambridge Dictionary', url: 'https://dictionary.cambridge.org/dictionary/english/feed' },
    { title: 'Horse | Description, Breeds, & Facts | Britannica', url: 'https://www.britannica.com/animal/horse' },
    { title: 'The Ultimate Guide to Horse Feed & Equine Nutrition', url: 'https://thehorse.com/nutrition/feed-guide' },
  ];

  it.each(badExamples)('rejects informational website as a business lead: %s', (ex) => {
    expect(isInformationalDomain(ex.url)).toBe(true);
    expect(classifyLeadEntity({ businessName: ex.title, website: ex.url }).entityType).toBe('informational_content');
    expect(classifyLeadEntity({ businessName: ex.title, website: ex.url }).isActionableProspect).toBe(false);
  });

  it('normalizes search results and filters out dictionary and wikipedia entries', () => {
    const rawResults = [
      { title: 'Wikipedia — Equestrianism', url: 'https://en.wikipedia.org/wiki/Equestrianism', content: 'Equestrianism definition' },
      { title: 'Merriam-Webster — Equestrian Definition', url: 'https://www.merriam-webster.com/dictionary/equestrian', content: 'Equestrian noun' },
      { title: 'Wabash Feed & Garden Store', url: 'https://www.wabashfeed.com/', content: 'Houston TX feed and livestock supply store' },
      { title: 'Dictionary.com — Feed Definition', url: 'https://www.dictionary.com/browse/feed', content: 'Feed verb' },
      { title: 'Pasturas Los Alazanes', url: 'https://www.pasturaslosalazanes.com/', content: 'Dallas TX animal feed and saddle shop' },
    ];

    const filtered = normalizeSearchResults(rawResults, { category: 'Feed Store', location: 'Texas' }, '2026-10-14');
    expect(filtered).toHaveLength(2);
    expect(filtered.map((l) => l.businessName)).toContain('Wabash Feed & Garden Store');
    expect(filtered.map((l) => l.businessName)).toContain('Pasturas Los Alazanes');
  });

  it('classifies public Facebook Groups as public_community rather than buyer company', () => {
    const fbGroup = {
      businessName: 'Texas Horse Owners Community',
      website: 'https://www.facebook.com/groups/texashorselovers',
    };
    expect(classifyLeadEntity(fbGroup).entityType).toBe('public_community');
    expect(classifyLeadEntity(fbGroup).isActionableProspect).toBe(false);
  });

  it('qualifies genuine feed and livestock companies as commercial prospects', () => {
    const feedStore = {
      businessName: 'Wabash Feed & Garden Store',
      website: 'https://www.wabashfeed.com',
      city: 'Houston',
      region: 'TX',
    };
    const res = classifyLeadEntity(feedStore);
    expect(res.entityType).toBe('business_prospect');
    expect(res.isActionableProspect).toBe(true);
  });
});

describe('LeadOS 3.1 Outreach Modes & Claim Compliance (Phase 3 & 4)', () => {
  // Import validateOutboundCopy dynamically to verify claim check
  it('generates retail outreach with verified 5% coupon and passes claim checks', async () => {
    const { validateOutboundCopy } = await import('./claims');
    const { createOutreachMessage } = await import('./intelligence');

    const leadInfo = {
      businessName: 'Lone Star Equine Tack & Feed',
      city: 'Fort Worth',
      category: 'Feed Store',
    };

    const retail = createOutreachMessage(leadInfo, {
      mode: 'retail',
      couponCode: 'welcome5',
      senderEmail: 'sales@himalayankoh.com',
    });

    expect(retail.mode).toBe('retail');
    expect(retail.sender).toBe('sales@himalayankoh.com');
    expect(retail.couponCode).toBe('welcome5');
    expect(retail.productUrl).toBe('https://himalayankoh.com/products/pink-salt-block-lick-2lb');
    expect(retail.subject).toContain('5% Welcome Offer');
    expect(retail.message).toContain('welcome5');
    expect(retail.message).toContain('sales@himalayankoh.com');

    // Must strictly pass validateOutboundCopy
    const check = validateOutboundCopy(`${retail.subject}\n${retail.message}`);
    expect(check.ok).toBe(true);
  });

  it('generates wholesale outreach with catalog link and passes claim checks', async () => {
    const { validateOutboundCopy } = await import('./claims');
    const { createOutreachMessage } = await import('./intelligence');

    const leadInfo = {
      businessName: 'Central Texas Feed Co',
      city: 'Austin',
      category: 'Livestock Distributor',
    };

    const wholesale = createOutreachMessage(leadInfo, {
      mode: 'wholesale',
      senderEmail: 'sales@himalayankoh.com',
    });

    expect(wholesale.mode).toBe('wholesale');
    expect(wholesale.sender).toBe('sales@himalayankoh.com');
    expect(wholesale.productUrl).toBe('https://himalayankoh.com/wholesale');
    expect(wholesale.subject).toContain('Wholesale Himalayan Salt Distribution');
    expect(wholesale.message).toContain('https://himalayankoh.com/wholesale');
    expect(wholesale.message).not.toContain('welcome5'); // No retail coupon in wholesale

    const check = validateOutboundCopy(`${wholesale.subject}\n${wholesale.message}`);
    expect(check.ok).toBe(true);
  });

  it('generates private-label inquiry with catalog link and passes claim checks', async () => {
    const { validateOutboundCopy } = await import('./claims');
    const { createOutreachMessage } = await import('./intelligence');

    const leadInfo = {
      businessName: 'Premier Farm Supply Brands',
      city: 'San Antonio',
      category: 'Private Label Buyer',
    };

    const pl = createOutreachMessage(leadInfo, {
      mode: 'private_label',
      senderEmail: 'sales@himalayankoh.com',
    });

    expect(pl.mode).toBe('private_label');
    expect(pl.sender).toBe('sales@himalayankoh.com');
    expect(pl.productUrl).toBe('https://himalayankoh.com/wholesale');
    expect(pl.subject).toContain('Private-Label Mineral Salt Discussion');
    expect(pl.message).toContain('Manufacturing schedules and minimum order quantities are confirmed upon technical review');

    const check = validateOutboundCopy(`${pl.subject}\n${pl.message}`);
    expect(check.ok).toBe(true);
  });
});
