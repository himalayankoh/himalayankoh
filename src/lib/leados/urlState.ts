export type LeadOSTab = 'overview' | 'find' | 'library' | 'settings';

const supportedTabs = new Set<LeadOSTab>(['overview', 'find', 'library', 'settings']);

export function parseLeadOSUrlState(input: string | URL): { tab: LeadOSTab; search: string; status: string } {
  const url = typeof input === 'string' ? new URL(input, 'https://preview.himalayankoh.com') : input;
  const rawTab = url.searchParams.get('tab');
  let tab: LeadOSTab = 'overview';

  if (rawTab && supportedTabs.has(rawTab as LeadOSTab)) {
    tab = rawTab as LeadOSTab;
  } else if (rawTab === 'outreach') {
    tab = 'library';
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
