export type LeadOSTab = 'overview' | 'find' | 'library' | 'email' | 'marketing' | 'seo' | 'settings';

const supportedTabs = new Set<LeadOSTab>(['overview', 'find', 'library', 'email', 'marketing', 'seo', 'settings']);

export function parseLeadOSUrlState(input: string | URL): { tab: LeadOSTab; search: string; status: string } {
  const url = typeof input === 'string' ? new URL(input, 'https://preview.himalayankoh.com') : input;
  const rawTab = url.searchParams.get('tab');
  let tab: LeadOSTab = 'overview';

  if (rawTab && supportedTabs.has(rawTab as LeadOSTab)) {
    tab = rawTab as LeadOSTab;
  } else if (rawTab === 'outreach') {
    tab = 'library';
  } else if (rawTab === 'email-marketing' || rawTab === 'mail') {
    tab = 'email';
  } else if (rawTab === 'seo-engine' || rawTab === 'seo') {
    tab = 'seo';
  } else if (rawTab === 'marketing-gen' || rawTab === 'ads' || rawTab === 'marketing') {
    tab = 'marketing';
  } else if (rawTab === 'ai' || rawTab === 'scoring' || rawTab === 'projects') {
    tab = 'settings';
  } else if (rawTab === 'research') {
    tab = 'find';
  }

  return {
    tab,
    search: url.searchParams.get('search') || '',
    status: url.searchParams.get('status') || 'all',
  };
}
