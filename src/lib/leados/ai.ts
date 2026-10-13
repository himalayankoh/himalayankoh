import type { NormalizedLead, ProjectFitResult, LeadOSProject } from './types';
import { getSetting } from '@/lib/settings/serverSettings';

export interface AIAnalysisResult {
  summary: string;
  opportunitySignals: string[];
  potentialValue: string;
  confidence: 'low' | 'medium' | 'high';
}

export interface AIProjectFitResult {
  score: number;
  reasons: string[];
  outreachAngles: string[];
}

/**
 * LeadOS AI providers.
 *
 * - `gemini` uses the Google key the owner saved in Admin → Settings → API Keys
 *   (category `gemini`, env fallback `GEMINI_API_KEY`). Primary, because that is
 *   the key that is actually configured.
 * - `openrouter` / `deepseek` are the legacy paths, kept working.
 * - `auto` (default) tries gemini → openrouter → deepseek and uses the first
 *   one that answers, so enrichment keeps working when any single provider is
 *   down or unconfigured. Search itself never needs AI: it stays deterministic
 *   (OSM Nominatim + Overpass) and AI only enriches on demand.
 */
export type LeadOSAIProvider = 'auto' | 'gemini' | 'openrouter' | 'deepseek';

function getOpenRouterApiKey(): string | null {
  return process.env.OPENROUTER_API_KEY || null;
}

function getDeepSeekApiKey(): string | null {
  return process.env.DEEPSEEK_API_KEY || null;
}

async function getGeminiApiKey(): Promise<string | null> {
  if (process.env.GEMINI_API_KEY?.trim()) return process.env.GEMINI_API_KEY.trim();
  try {
    const stored = await getSetting('gemini', 'api_key');
    return stored?.trim() ? stored.trim() : null;
  } catch {
    return null;
  }
}

async function getGeminiModel(): Promise<string> {
  try {
    const stored = await getSetting('gemini', 'model');
    if (stored?.trim()) return stored.trim();
  } catch {
    /* fall through to env/default */
  }
  return process.env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash';
}

/** Provider status for the AI Engine "Test Connection" buttons. Never leaks keys. */
export async function getAIProviderStatus(): Promise<
  Record<'gemini' | 'openrouter' | 'deepseek', { configured: boolean; model: string }>
> {
  const [geminiKey, openRouterKey, deepSeekKey, geminiModel] = await Promise.all([
    getGeminiApiKey(),
    (async () => {
      if (getOpenRouterApiKey()) return getOpenRouterApiKey();
      try {
        const stored = await getSetting('openrouter', 'api_key');
        return stored?.trim() ? stored.trim() : null;
      } catch {
        return null;
      }
    })(),
    (async () => {
      if (getDeepSeekApiKey()) return getDeepSeekApiKey();
      try {
        const stored = await getSetting('deepseek', 'api_key');
        return stored?.trim() ? stored.trim() : null;
      } catch {
        return null;
      }
    })(),
    getGeminiModel(),
  ]);
  let openRouterModel = process.env.OPENROUTER_MODEL || 'deepseek/deepseek-chat';
  try {
    const stored = await getSetting('openrouter', 'model');
    if (stored?.trim()) openRouterModel = stored.trim();
  } catch {
    /* keep env/default */
  }
  return {
    gemini: { configured: Boolean(geminiKey), model: geminiModel },
    openrouter: { configured: Boolean(openRouterKey), model: openRouterModel },
    deepseek: { configured: Boolean(deepSeekKey), model: 'deepseek-chat' },
  };
}

/**
 * Calls OpenRouter / DeepSeek chat completions API with strict error boundaries.
 */
async function callChatCompletions(
  provider: 'openrouter' | 'deepseek',
  messages: Array<{ role: string; content: string }>,
  modelOverride?: string
): Promise<string> {
  const isDeepSeek = provider === 'deepseek';
  let apiKey = isDeepSeek ? getDeepSeekApiKey() : getOpenRouterApiKey();

  // Fall back to the key saved in Admin → Settings when no env key exists.
  if (!apiKey) {
    try {
      const stored = await getSetting(isDeepSeek ? 'deepseek' : 'openrouter', 'api_key');
      if (stored?.trim()) apiKey = stored.trim();
    } catch {
      /* keep null → throws below */
    }
  }

  if (!apiKey) {
    throw new Error(`${isDeepSeek ? 'DeepSeek' : 'OpenRouter'} API key is not configured on the server.`);
  }

  const endpoint = isDeepSeek
    ? 'https://api.deepseek.com/v1/chat/completions'
    : 'https://openrouter.ai/api/v1/chat/completions';

  let defaultModel = isDeepSeek ? 'deepseek-chat' : (process.env.OPENROUTER_MODEL || 'deepseek/deepseek-chat');
  if (!isDeepSeek) {
    try {
      const stored = await getSetting('openrouter', 'model');
      if (stored?.trim()) defaultModel = stored.trim();
    } catch {
      /* keep env/default */
    }
  }
  const model = modelOverride || defaultModel;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      ...(isDeepSeek ? {} : { 'HTTP-Referer': 'https://preview.himalayankoh.com', 'X-Title': 'Himalayan Koh LeadOS' }),
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.2,
      max_tokens: 800,
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    throw new Error(`AI API error ${res.status}: ${res.statusText}`);
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || '';
  if (!text.trim()) throw new Error('AI API returned an empty response.');
  return text;
}

/** Calls Google Gemini (generateContent) with the owner's saved Google key. */
async function callGemini(prompt: string, modelOverride?: string): Promise<string> {
  const apiKey = await getGeminiApiKey();
  if (!apiKey) {
    throw new Error('Gemini API key is not configured on the server.');
  }
  const model = modelOverride || (await getGeminiModel());
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 800 },
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    throw new Error(`Gemini API error ${res.status}: ${res.statusText}`);
  }
  const data = await res.json();
  const parts = data.candidates?.[0]?.content?.parts;
  const text = Array.isArray(parts) ? parts.map((p: any) => String(p?.text ?? '')).join('').trim() : '';
  if (!text) throw new Error('Gemini API returned an empty response.');
  return text;
}

function orderedProviders(requested: LeadOSAIProvider): Array<'gemini' | 'openrouter' | 'deepseek'> {
  if (requested === 'gemini') return ['gemini', 'openrouter', 'deepseek'];
  if (requested === 'openrouter') return ['openrouter', 'gemini', 'deepseek'];
  if (requested === 'deepseek') return ['deepseek', 'gemini', 'openrouter'];
  return ['gemini', 'openrouter', 'deepseek'];
}

/** Runs one prompt against the first provider that answers. Remembers who answered. */
export async function runPromptWithFallback(
  prompt: string,
  provider: LeadOSAIProvider = 'auto'
): Promise<{ text: string; providerUsed: 'gemini' | 'openrouter' | 'deepseek' }> {
  let lastError: unknown = null;
  for (const candidate of orderedProviders(provider)) {
    try {
      if (candidate === 'gemini') {
        return { text: await callGemini(prompt), providerUsed: 'gemini' };
      }
      return {
        text: await callChatCompletions(candidate, [{ role: 'user', content: prompt }]),
        providerUsed: candidate,
      };
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('All AI providers failed.');
}

/**
 * AI Lead Analysis: strictly factual evaluation of verified input data.
 * Will never hallucinate metrics or contact points.
 */
export async function analyzeLeadWithAI(
  lead: NormalizedLead,
  provider: LeadOSAIProvider = 'auto'
): Promise<AIAnalysisResult> {
  const prompt = `You are an enterprise B2B lead intelligence assistant for Himalayan Koh.
Analyze this business lead strictly based on the verifiable facts provided.
CRITICAL: Do NOT invent, assume, or hallucinate metrics, review counts, revenue, employee numbers, or missing contact info.
Only reference data actually observed below.

Business: ${lead.businessName}
Category: ${lead.category}
Location: ${[lead.address, lead.city, lead.region, lead.country].filter(Boolean).join(', ')}
Website: ${lead.website || 'None listed'}
Phone: ${lead.phone || 'None listed'}
Email: ${lead.email || 'None listed'}

Return ONLY a valid JSON object:
{
  "summary": "Brief 1-2 sentence assessment of business type and suitability",
  "opportunitySignals": ["Signal 1", "Signal 2"],
  "potentialValue": "Estimated suitability level (e.g. High Wholesale Potential / Low / Specialized)",
  "confidence": "low" | "medium" | "high"
}`;

  try {
    const { text: raw } = await runPromptWithFallback(prompt, provider);
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return {
      summary: String(parsed.summary || 'Lead analyzed successfully.'),
      opportunitySignals: Array.isArray(parsed.opportunitySignals) ? parsed.opportunitySignals : [],
      potentialValue: String(parsed.potentialValue || 'Standard Wholesale Prospect'),
      confidence: (['low', 'medium', 'high'].includes(parsed.confidence) ? parsed.confidence : 'medium') as any,
    };
  } catch (err) {
    return {
      summary: `Basic business entity identified in ${lead.city || 'local market'}. AI deeper parsing unavailable.`,
      opportunitySignals: [lead.website ? 'Has website' : 'No website listed (direct outreach required)'],
      potentialValue: 'Standard Prospect',
      confidence: 'low',
    };
  }
}

/**
 * AI Project Fit Evaluation:
 * Always fails gracefully to null so deterministic scoring keeps running.
 */
export async function scoreProjectFitWithAI(
  lead: NormalizedLead,
  project: LeadOSProject,
  provider: LeadOSAIProvider = 'auto'
): Promise<ProjectFitResult | null> {
  const prompt = `Evaluate how well this business fits the project ICP.
Only use verified facts. Do not invent details.

Lead:
Name: ${lead.businessName}
Category: ${lead.category}
Location: ${[lead.city, lead.region, lead.country].filter(Boolean).join(', ')}
Website: ${lead.website || 'None'}

Target ICP:
Project: ${project.name}
Product/Service: ${project.productService || 'Wholesale Himalayan rock salt and mineral licks'}
Target Customers: ${project.targetCustomerDescription || 'Farm, feed, and equestrian stores'}
Industries: ${(project.industries || []).join(', ')}

Return ONLY valid JSON:
{
  "score": <number between 0 and 100>,
  "reasons": ["Specific reason 1", "Specific reason 2"],
  "outreachAngles": ["Actionable angle 1", "Actionable angle 2"]
}`;

  try {
    const { text: raw } = await runPromptWithFallback(prompt, provider);
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return {
      score: Math.max(0, Math.min(100, Math.round(Number(parsed.score) || 50))),
      reasons: Array.isArray(parsed.reasons) ? parsed.reasons.slice(0, 4) : [],
      outreachAngles: Array.isArray(parsed.outreachAngles) ? parsed.outreachAngles.slice(0, 3) : [],
      method: 'ai',
    };
  } catch {
    // Non-fatal fallback
    return null;
  }
}
