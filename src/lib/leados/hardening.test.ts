import { describe, expect, it, vi } from 'vitest';
import { validateOutboundCopy } from './claims';
import { buildOutreachHtml, sendLeadOSMail } from './emailProvider';
import { escapeLeadOSCsvCell } from './csv';
import { parseLeadOSUrlState } from './urlState';

vi.stubGlobal('fetch', vi.fn());

describe('LeadOS hardening boundaries', () => {
  it('blocks unsupported claims from outbound copy', () => {
    expect(validateOutboundCopy('Himalayan salt products for your store.').ok).toBe(true);
    expect(validateOutboundCopy('Third-party laboratory tested and 84+ essential trace minerals.').ok).toBe(false);
    expect(validateOutboundCopy('We are a direct importer of food-grade salt with certified purity.').ok).toBe(false);
    expect(validateOutboundCopy('Our products provide health benefits.').ok).toBe(false);
  });

  it('reports provider unavailable without claiming success', async () => {
    vi.stubEnv('OUTREACH_PROVIDER_UNAVAILABLE', 'true');
    const result = await sendLeadOSMail({ to: 'buyer@example.com', subject: 'Hello', text: 'Message' }, { simulationRequested: false });
    expect(result.state).toBe('provider_unavailable');
    vi.unstubAllEnvs();
  });

  it('simulation is explicit and never a delivered provider result', async () => {
    const result = await sendLeadOSMail({ to: 'buyer@example.com', subject: 'Hello', text: 'Message' }, { simulationRequested: true });
    expect(result.state).toBe('simulated');
    expect(result.provider).toBe('simulation');
    expect(result.providerMessageId).toBeNull();
  });

  it('escapes HTML in outbound previews', () => {
    expect(buildOutreachHtml('<script>alert(1)</script>')).not.toContain('<script>');
  });

  it('escapes CSV formula prefixes', () => {
    expect(escapeLeadOSCsvCell('=HYPERLINK("https://evil.example")')).toContain("'=HYPERLINK");
    expect(escapeLeadOSCsvCell('normal')).toBe('"normal"');
  });

  it('preserves safe tab, search, and status URL state', () => {
    const parsed = parseLeadOSUrlState('https://preview.himalayankoh.com/admin/leados?tab=library&search=farm%20supply&status=qualified');
    expect(parsed).toEqual({ tab: 'library', search: 'farm supply', status: 'qualified' });
    expect(parseLeadOSUrlState('https://preview.himalayankoh.com/admin/leados?tab=market-map').tab).toBe('market-map');
    expect(parseLeadOSUrlState('https://preview.himalayankoh.com/admin/leados?tab=map').tab).toBe('market-map');
    expect(parseLeadOSUrlState('https://preview.himalayankoh.com/admin/leados?tab=private-note').tab).toBe('overview');
  });

  it('does not treat missing contact information as increased reachability', async () => {
    const { calculateLeadEvidence } = await import('./scoring');
    const base = { businessName: 'A', category: 'Feed Store', address: '1 Main', city: 'Dallas', region: 'TX', country: 'US', website: null, phone: null, email: null, latitude: null, longitude: null, osmType: 'node', osmId: '1', osmUrl: null, dataSource: 'openstreetmap' };
    expect(calculateLeadEvidence(base, 50).reachability).toBe(0);
    expect(calculateLeadEvidence({ ...base, phone: '555-0100' }, 50).reachability).toBeGreaterThan(0);
  });
});
