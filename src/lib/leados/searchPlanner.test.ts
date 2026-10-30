import { describe, expect, it, vi } from 'vitest';
import { buildPlannerPrompt, extractLocation, mergeAIPlan, planLeadSearch, rulesPlan } from './searchPlanner';
import { BUYER_CATEGORIES } from './intelligence';

describe('LeadOS search planner', () => {
  it('maps the reported ranch/cow/horse request without AI', async () => {
    const ask = vi.fn();
    const r = await planLeadSearch('ranches, local farms or cows or horse training area near Houston, TX with website', { ask });
    expect(ask).not.toHaveBeenCalled();
    expect(r.source).toBe('rules');
    expect(r.plan).toMatchObject({ category: 'Ranch & Horse Facility', location: 'Houston, TX', productInterest: 'horse_salt', requireWebsite: true });
    expect(r.plan.keyword).toContain('cattle');
  });

  it('maps misspelled ranch query with zip code without AI', async () => {
    const ask = vi.fn();
    const r = await planLeadSearch('raches ower details neary by 77065 10 km', { ask });
    expect(ask).not.toHaveBeenCalled();
    expect(r.source).toBe('rules');
    expect(r.plan).toMatchObject({
      category: 'Ranch & Horse Facility',
      location: 'Houston, TX',
      productInterest: 'horse_salt',
      requirePhone: true,
    });
    expect(r.plan.keyword).toContain('ranch');
  });

  it('parses City, ST and ZIP codes without mistaking words like "in"/"or" for states', () => {
    expect(extractLocation('feed stores in Ocala, FL')).toBe('Ocala, FL');
    expect(extractLocation('tack shops near Billings, MT please')).toBe('Billings, MT');
    expect(extractLocation('farms, or cows')).toBe('');
    expect(extractLocation('ranches, in houston')).toBe('Houston, TX');
    expect(extractLocation('ranches near 77065 10 km')).toBe('Houston, TX');
    expect(extractLocation('distributors in 75201')).toBe('Dallas, TX');
    expect(extractLocation('distributors across Kansas City')).toBe('Kansas City, MO');
    expect(extractLocation('salt importers nationwide')).toBe('USA');
  });

  it('always yields a supported category and sensible interest', () => {
    expect(rulesPlan('spice shops in Austin').plan).toMatchObject({ category: 'Spice Retailer', productInterest: 'culinary_salt' });
    expect(rulesPlan('farm and feed store Dallas').plan.category).toBe('Feed Store');
    expect(BUYER_CATEGORIES).toContain(rulesPlan('something vague').plan.category);
  });

  it('calls AI only when unclear, with a compact prompt, and validates its enums', async () => {
    const ask = vi.fn().mockResolvedValue({ text: '{"c":"Livestock Distributor","i":"bad","l":"Amarillo, TX","k":"cattle mineral","w":false,"p":true,"e":false,"ws":true}', providerUsed: 'gemini' });
    const r = await planLeadSearch('Amarillo walay bare suppliers dhoondo jo janwaron ka saman bechtay hain', { ask, fallbackLocation: 'Houston, TX' });
    expect(ask).toHaveBeenCalledTimes(1);
    expect(buildPlannerPrompt('x').length).toBeLessThan(700);
    expect(r).toMatchObject({ source: 'ai', provider: 'gemini' });
    expect(r.plan).toMatchObject({ category: 'Livestock Distributor', location: 'Amarillo, TX', requirePhone: true, wholesaleOnly: true });
    expect(['horse_salt', 'livestock_salt', 'culinary_salt', 'bulk_wholesale', 'private_label']).toContain(r.plan.productInterest);
  });

  it('falls back to rules when AI fails or returns junk', async () => {
    const r = await planLeadSearch('mujhe kuch buyers chahiye', { ask: vi.fn().mockRejectedValue(new Error('down')), fallbackLocation: 'Dallas, TX' });
    expect(r.source).toBe('rules');
    expect(r.plan.location).toBe('Dallas, TX');
    expect(() => mergeAIPlan('not json', rulesPlan('x').plan)).toThrow();
    expect(mergeAIPlan('{"c":"Hacker <script>","l":"<b>Austin, TX</b>"}', rulesPlan('feed').plan)).toMatchObject({ category: 'Feed Store', location: 'Austin, TX' });
  });

  it('extracts multiple locations, categories and limit from composite prompt', () => {
    const r = rulesPlan('Find 100 livestock feed stores and mineral distributors in Houston, Dallas and Austin with websites, emails and phone numbers');
    expect(r.plan.locations).toEqual(expect.arrayContaining(['Houston, TX', 'Dallas, TX', 'Austin, TX']));
    expect(r.plan.categories).toEqual(expect.arrayContaining(['Feed Store', 'Livestock Distributor']));
    expect(r.plan.resultsLimit).toBe(100);
    expect(r.plan.requireWebsite).toBe(true);
    expect(r.plan.requireEmail).toBe(true);
    expect(r.plan.requirePhone).toBe(true);
  });

  it('correctly handles Roman Urdu queries with negation (website nahi hai)', () => {
    const r = rulesPlan('chhote ranches Texas mein jin ki website nahi hai sirf phone ya facebook page ho');
    expect(r.plan.category).toBe('Ranch & Horse Facility');
    expect(r.plan.location).toBe('Texas');
    expect(r.plan.requireWebsite).toBe(false);
    expect(r.plan.requirePhone).toBe(true);
    expect(r.plan.sources).toContain('facebook');
  });

  it('correctly handles Roman Urdu positive requirement queries', () => {
    const r = rulesPlan('Texas mein livestock feed stores aur farm suppliers dhoondo jin kay paas website ho ya phone number');
    expect(r.plan.categories).toEqual(expect.arrayContaining(['Feed Store', 'Farm Supply']));
    expect(r.plan.location).toBe('Texas');
    expect(r.plan.requireWebsite).toBe(true);
    expect(r.plan.requirePhone).toBe(true);
  });

  it('correctly handles namak and mineral distributor queries', () => {
    const r = rulesPlan('namak aur mineral distributors USA nationwide');
    expect(r.plan.category).toBe('Salt Wholesaler');
    expect(r.plan.location).toBe('USA');
    expect(r.plan.wholesaleOnly).toBe(true);
  });

  it('extracts multi-city locations in Roman Urdu format', () => {
    const r = rulesPlan('Houston aur Dallas mein horse stables aur equestrian centers');
    expect(r.plan.locations).toEqual(expect.arrayContaining(['Houston, TX', 'Dallas, TX']));
    expect(r.plan.category).toBe('Ranch & Horse Facility');
  });
});
