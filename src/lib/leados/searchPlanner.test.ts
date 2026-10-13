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

  it('parses City, ST without mistaking words like "in"/"or" for states', () => {
    expect(extractLocation('feed stores in Ocala, FL')).toBe('Ocala, FL');
    expect(extractLocation('tack shops near Billings, MT please')).toBe('Billings, MT');
    expect(extractLocation('farms, or cows')).toBe('');
    expect(extractLocation('ranches, in houston')).toBe('Houston, TX');
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
});
