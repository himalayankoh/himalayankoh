import { runPromptWithFallback } from './ai';
import { createIntroduction } from './intelligence';
import type { SavedLeadRecord, ProductInterest } from './types';

/** AI selects from truthful sentences; it cannot introduce facts, sizes or promises. */
export async function assistIntroduction(lead: SavedLeadRecord, interest: ProductInterest) {
  const base = createIntroduction(lead, interest);
  const websiteObserved = (lead.research?.sources || []).some((s) => s.kind === 'company_page' && s.status === 'verified');
  const choices = [
    'Would this be relevant to your purchasing team?',
    'Would your team be interested in reviewing our current product details?',
    ...(interest === 'private_label' ? ['Would you be open to sharing your private-label requirements so we can assess a potential opportunity?'] : []),
  ];
  const prompt = `Select the best American-English CTA for a Himalayan Koh B2B introduction. Return JSON {"choice": integer}. Do not write any additional copy. Buyer category: ${String(lead.category || '').slice(0,100)}. Product interest: ${interest}. Company website observed: ${websiteObserved}. Allowed choices: ${JSON.stringify(choices.map((text,index)=>({index,text})))}`;
  const result = await runPromptWithFallback(prompt);
  const match = result.text.match(/\{[\s\S]*\}/);
  let choice = 0;
  try { const parsed = JSON.parse(match?.[0] || '{}'); if (Number.isInteger(parsed.choice) && parsed.choice >= 0 && parsed.choice < choices.length) choice = parsed.choice; } catch { /* Keep truthful deterministic copy. */ }
  return { ...base, message: base.message.replace('Would this be relevant to your purchasing team?', choices[choice]), provider: result.providerUsed };
}
