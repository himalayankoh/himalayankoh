export type LeadOSTab =
  | 'overview'
  | 'prospects'
  | 'outreach'
  | 'automation'
  | 'settings'
  | 'find'
  | 'market-map'
  | 'library'
  | 'email'
  | 'marketing'
  | 'seo';

const supportedTabs = new Set<LeadOSTab>([
  'overview',
  'prospects',
  'outreach',
  'automation',
  'settings',
  'find',
  'market-map',
  'library',
  'email',
  'marketing',
  'seo',
]);

export function parseLeadOSUrlState(input: string | URL): { tab: LeadOSTab; search: string; status: string } {
  const url = typeof input === 'string' ? new URL(input, 'https://preview.himalayankoh.com') : input;
  const rawTab = url.searchParams.get('tab');
  let tab: LeadOSTab = 'overview';

  if (rawTab && supportedTabs.has(rawTab as LeadOSTab)) {
    tab = rawTab as LeadOSTab;
  } else if (rawTab === 'crm' || rawTab === 'leads') {
    tab = 'prospects';
  } else if (rawTab === 'campaigns' || rawTab === 'email-marketing' || rawTab === 'mail') {
    tab = 'outreach';
  } else if (rawTab === 'n8n' || rawTab === 'seo-engine' || rawTab === 'marketing-gen') {
    tab = 'automation';
  } else if (rawTab === 'research') {
    tab = 'find';
  } else if (rawTab === 'map' || rawTab === 'market' || rawTab === 'usa-map') {
    tab = 'market-map';
  } else if (rawTab === 'ai' || rawTab === 'scoring' || rawTab === 'projects') {
    tab = 'settings';
  }

  return {
    tab,
    search: url.searchParams.get('search') || '',
    status: url.searchParams.get('status') || 'all',
  };
}
