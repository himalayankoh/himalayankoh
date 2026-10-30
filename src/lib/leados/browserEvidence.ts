import { publicCompanyUrl } from './intelligence';
import type { LeadResearch, NormalizedLead } from './types';

/** Staff-attested browser observations, explicitly distinct from automated crawling. */
export function browserObservation(lead: Pick<NormalizedLead, 'website'> & {research?: LeadResearch}, body: Record<string, unknown>, now = new Date().toISOString()) {
  const site = lead.website && publicCompanyUrl(lead.website);
  const source = typeof body.sourceUrl === 'string' && publicCompanyUrl(body.sourceUrl);
  const text = typeof body.observedText === 'string' ? body.observedText.trim() : '';
  if (!site || !source || new URL(site).hostname.replace(/^www\./,'') !== new URL(source).hostname.replace(/^www\./,'')) throw new Error('Use an actual public page on the saved company website.');
  if (body.browserReviewed !== true || text.length < 40 || text.length > 4000) throw new Error('Confirm browser review and provide 40–4,000 characters of visible company evidence.');
  const email = typeof body.observedEmail === 'string' ? body.observedEmail.trim().toLowerCase() : '';
  if (email && (!/^(?:info|sales|contact|hello|office|orders|wholesale|customerservice|service|support|enquiries|inquiries)@[a-z0-9.-]+\.[a-z]{2,}$/i.test(email) || !text.toLowerCase().includes(email))) throw new Error('Only a role mailbox visibly published in the quoted company evidence is accepted.');
  const excerpt = text.replace(/\s+/g,' ').slice(0,500) + (email ? ` Public business email: ${email}` : '') + ' Staff-attested browser observation; not an automated crawl.';
  const research: LeadResearch = {...lead.research, contactPage: source, lastVerifiedAt: now,
    sources:[...(lead.research?.sources || []),{url:source,retrievedAt:now,kind:'browser_page',status:'verified' as const,excerpt}].slice(-40)};
  return {research, ...(email ? {email,emailSource:'company_website' as const} : {})};
}
