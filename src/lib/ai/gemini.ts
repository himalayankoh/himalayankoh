/**
 * AI Provider for Admin SEO Assistant — Server Only.
 *
 * Supports both OpenRouter (with google/gemini-2.5-flash) and direct Gemini.
 * Prioritizes the working server-side OpenRouter provider, falling back to direct
 * Gemini if configured.
 *
 * Requirements:
 * - 100% English-only copy validation (never returns Urdu or non-English text).
 * - Grounded strictly in real WooCommerce product/category facts.
 * - Structured JSON output format.
 * - Prohibited claims scanning (lib/products/claims).
 * - Safe status testing without exposing secrets.
 */

import { getSetting } from '../settings/serverSettings';
import { findProhibitedClaims, type ProhibitedClaim } from '../products/claims';

export const DEFAULT_OPENROUTER_MODEL = 'google/gemini-2.5-flash';
export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';
export const DEFAULT_DEEPSEEK_MODEL = 'deepseek-chat';
export const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';
export const DEFAULT_ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001';
export const DEFAULT_CODEX_MODEL = 'gpt-5-codex';

const OPENROUTER_API_ROOT = 'https://openrouter.ai/api/v1';
const GEMINI_API_ROOT = 'https://generativelanguage.googleapis.com/v1beta';
const OPENAI_API_ROOT = 'https://api.openai.com/v1';
const DEEPSEEK_API_ROOT = 'https://api.deepseek.com';
const ANTHROPIC_API_ROOT = 'https://api.anthropic.com/v1';
/**
 * The Codex backend the ChatGPT-subscription CLI signs in to. This is not a
 * documented public API — it is the endpoint `codex login` already authorises a
 * token for, and OpenAI may change or withdraw it. It is offered so an owner
 * with a Codex subscription can use it, and every failure here is reported as
 * "could not be reached / rejected" rather than papered over. The official,
 * supported path is an OpenAI API key on the OpenAI card.
 */
const CODEX_API_ROOT = 'https://chatgpt.com/backend-api/codex';

/**
 * Providers the server can actually call. `openrouter` and `gemini` are the
 * routing default; `deepseek`, `openai` and `anthropic` are first-class text
 * providers, and `codex` uses a ChatGPT-subscription OAuth token.
 */
export type AiProviderType = 'openrouter' | 'gemini' | 'deepseek' | 'openai' | 'anthropic' | 'codex';
export type AiKeySource = 'console' | 'environment' | 'none';

/** How a provider's chat request is shaped. */
export type ProviderKind = 'openrouter' | 'gemini' | 'openai-compatible' | 'anthropic' | 'codex';

export interface ProviderSpec {
  id: AiProviderType;
  /** Human name used in status/testing copy. */
  label: string;
  /** Settings category the owner's key is stored under. */
  category: string;
  /** process.env keys used as a fallback when nothing is stored in settings. */
  envKeys: string[];
  /** Optional process.env key for the model id. */
  modelEnvKey?: string;
  defaultModel: string;
  kind: ProviderKind;
  /** API root for the request shape (`kind`). */
  apiRoot: string;
}

/**
 * One row per callable provider — the single list the settings store, the key
 * route, the status route and the test route all read. Adding a provider is
 * adding a row here, not a fourth parallel map.
 */
export const PROVIDER_SPECS: ProviderSpec[] = [
  { id: 'openrouter', label: 'OpenRouter', category: 'openrouter', envKeys: ['OPENROUTER_API_KEY', 'OPEN_ROUTER_API_KEY'], modelEnvKey: 'OPENROUTER_MODEL', defaultModel: DEFAULT_OPENROUTER_MODEL, kind: 'openrouter', apiRoot: OPENROUTER_API_ROOT },
  { id: 'gemini', label: 'Google AI Studio (Gemini)', category: 'gemini', envKeys: ['GEMINI_API_KEY'], modelEnvKey: 'GEMINI_MODEL', defaultModel: DEFAULT_GEMINI_MODEL, kind: 'gemini', apiRoot: GEMINI_API_ROOT },
  { id: 'deepseek', label: 'DeepSeek', category: 'deepseek', envKeys: ['DEEPSEEK_API_KEY'], modelEnvKey: 'DEEPSEEK_MODEL', defaultModel: DEFAULT_DEEPSEEK_MODEL, kind: 'openai-compatible', apiRoot: DEEPSEEK_API_ROOT },
  { id: 'openai', label: 'OpenAI', category: 'openai', envKeys: ['OPENAI_API_KEY'], modelEnvKey: 'OPENAI_MODEL', defaultModel: DEFAULT_OPENAI_MODEL, kind: 'openai-compatible', apiRoot: OPENAI_API_ROOT },
  { id: 'anthropic', label: 'Anthropic Claude', category: 'anthropic', envKeys: ['ANTHROPIC_API_KEY'], modelEnvKey: 'ANTHROPIC_MODEL', defaultModel: DEFAULT_ANTHROPIC_MODEL, kind: 'anthropic', apiRoot: ANTHROPIC_API_ROOT },
  { id: 'codex', label: 'OpenAI Codex', category: 'codex', envKeys: ['CHATGPT_OAUTH_TOKEN', 'CODEX_AUTH_TOKEN'], modelEnvKey: 'CODEX_MODEL', defaultModel: DEFAULT_CODEX_MODEL, kind: 'codex', apiRoot: CODEX_API_ROOT },
];

export const PROVIDER_SPEC_BY_ID: Record<AiProviderType, ProviderSpec> = Object.fromEntries(
  PROVIDER_SPECS.map((spec) => [spec.id, spec]),
) as Record<AiProviderType, ProviderSpec>;

export const AI_PROVIDER_IDS: AiProviderType[] = PROVIDER_SPECS.map((spec) => spec.id);

/** True when a string names a provider the server can call. */
export function isCallableProvider(value: unknown): value is AiProviderType {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(PROVIDER_SPEC_BY_ID, value);
}

export interface AiSeoConfig {
  provider: AiProviderType;
  apiKey: string;
  model: string;
  keySource: AiKeySource;
}

export type AiSeoState =
  | 'CONNECTED'
  | 'NOT CONFIGURED'
  | 'INVALID KEY'
  | 'QUOTA/RATE LIMITED'
  | 'MODEL UNAVAILABLE'
  | 'SERVER ERROR';

export interface AiSeoStatus {
  state: AiSeoState;
  model: string;
  provider: AiProviderType;
  keySource: AiKeySource;
  detail: string;
}

/** Legacy type alias for backwards compatibility */
export type GeminiConfig = AiSeoConfig;
export type GeminiKeySource = AiKeySource;
export type GeminiState = AiSeoState;
export type GeminiStatus = AiSeoStatus;

/**
 * Resolves the active AI SEO provider and model without exposing secrets.
 */
export async function resolveAiSeoConfig(): Promise<AiSeoConfig> {
  // Check OpenRouter first (active verified staging provider)
  const orDbKey = (await getSetting('openrouter', 'api_key'))?.trim() || '';
  const orEnvKey = (process.env.OPENROUTER_API_KEY || process.env.OPEN_ROUTER_API_KEY)?.trim() || '';
  const orKey = orDbKey || orEnvKey;

  const orDbModel = (await getSetting('openrouter', 'model'))?.trim() || '';
  const orEnvModel = process.env.OPENROUTER_MODEL?.trim() || '';
  const orModel = orDbModel || orEnvModel || DEFAULT_OPENROUTER_MODEL;

  if (orKey) {
    return {
      provider: 'openrouter',
      apiKey: orKey,
      model: orModel,
      keySource: orDbKey ? 'console' : 'environment',
    };
  }

  // Fallback to direct Gemini
  const geminiDbKey = (await getSetting('gemini', 'api_key'))?.trim() || '';
  const geminiEnvKey = process.env.GEMINI_API_KEY?.trim() || '';
  const geminiKey = geminiDbKey || geminiEnvKey;

  const geminiDbModel = (await getSetting('gemini', 'model'))?.trim() || '';
  const geminiEnvModel = process.env.GEMINI_MODEL?.trim() || '';
  const geminiModel = geminiDbModel || geminiEnvModel || DEFAULT_GEMINI_MODEL;

  return {
    provider: 'gemini',
    apiKey: geminiKey,
    model: geminiModel,
    keySource: geminiDbKey ? 'console' : geminiEnvKey ? 'environment' : 'none',
  };
}

/** Legacy function alias */
export const resolveGeminiConfig = resolveAiSeoConfig;

/**
 * Resolve the key + model for one specific provider.
 *
 * `resolveAiSeoConfig()` answers "which provider will a generation use", which is
 * not the same question as "can this provider connect" — the AI Hub tests each
 * provider on its own card, so it needs that provider's own key rather than the
 * one routing would pick.
 */
export async function resolveConfigFor(provider: AiProviderType, modelOverride?: string): Promise<AiSeoConfig> {
  const spec = PROVIDER_SPEC_BY_ID[provider] || PROVIDER_SPEC_BY_ID.openrouter;
  const dbKey = (await getSetting(spec.category, 'api_key'))?.trim() || '';
  const envKey = spec.envKeys.map((key) => process.env[key]?.trim() || '').find(Boolean) || '';
  const dbModel = (await getSetting(spec.category, 'model'))?.trim() || '';
  const envModel = spec.modelEnvKey ? process.env[spec.modelEnvKey]?.trim() || '' : '';
  return {
    provider: spec.id,
    apiKey: dbKey || envKey,
    model: modelOverride || dbModel || envModel || spec.defaultModel,
    keySource: dbKey ? 'console' : envKey ? 'environment' : 'none',
  };
}

/**
 * Tests connection to the configured AI provider with 0 or minimal tokens.
 */
/**
 * Headers the Codex backend expects. The OAuth token is the bearer credential;
 * `originator` names the client the endpoint was built for.
 */
function codexHeaders(accessToken: string): Record<string, string> {
  return {
    'content-type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
    'OpenAI-Beta': 'responses=experimental',
    originator: 'codex_cli_rs',
  };
}

/** Map an authenticated probe's HTTP status onto the shared state vocabulary. */
function statusFromResponse(response: Response, config: AiSeoConfig, label: string): AiSeoStatus {
  const base = { model: config.model, provider: config.provider, keySource: config.keySource };
  if (response.ok) {
    return { ...base, state: 'CONNECTED', detail: `${PROVIDER_SPEC_BY_ID[config.provider].label} accepted the key. Model: "${config.model}".` };
  }
  if (response.status === 400 || response.status === 401 || response.status === 403) {
    return { ...base, state: 'INVALID KEY', detail: `${PROVIDER_SPEC_BY_ID[config.provider].label} rejected the ${label === 'token' ? 'token' : 'key'}.` };
  }
  if (response.status === 402) {
    return { ...base, state: 'QUOTA/RATE LIMITED', detail: `${PROVIDER_SPEC_BY_ID[config.provider].label} reports no credit for this account.` };
  }
  if (response.status === 404) {
    return { ...base, state: 'MODEL UNAVAILABLE', detail: `The model "${config.model}" is not available on this ${PROVIDER_SPEC_BY_ID[config.provider].label} key.` };
  }
  if (response.status === 429) {
    return { ...base, state: 'QUOTA/RATE LIMITED', detail: `${PROVIDER_SPEC_BY_ID[config.provider].label} rate limit or quota exceeded.` };
  }
  return { ...base, state: 'SERVER ERROR', detail: `${PROVIDER_SPEC_BY_ID[config.provider].label} responded with HTTP ${response.status}.` };
}

export async function testAiSeoConnection(
  opts: { timeoutMs?: number; provider?: AiProviderType; model?: string } = {},
): Promise<AiSeoStatus> {
  const timeoutMs = opts.timeoutMs ?? 12_000;
  // Test the provider the caller names (one card, one provider), or the routing
  // default when no provider is given — the existing no-arg callers keep working.
  const config = opts.provider ? await resolveConfigFor(opts.provider, opts.model) : await resolveAiSeoConfig();

  if (!config.apiKey) {
    return {
      state: 'NOT CONFIGURED',
      model: config.model,
      provider: config.provider,
      keySource: 'none',
      detail:
        PROVIDER_SPEC_BY_ID[config.provider].kind === 'codex'
          ? 'No Codex token is configured. Paste the ChatGPT subscription token (from `codex login`) in AI Hub → OpenAI Codex, or use an OpenAI API key on the OpenAI card.'
          : `No API key is configured for ${PROVIDER_SPEC_BY_ID[config.provider].label}. Add one in the AI Hub or the server environment.`,
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    if (config.provider === 'deepseek' || config.provider === 'openai') {
      // OpenAI-compatible providers: listing models is authenticated and costs no tokens.
      const response = await fetch(`${PROVIDER_SPEC_BY_ID[config.provider].apiRoot}/models`, {
        headers: { Authorization: `Bearer ${config.apiKey}` },
        signal: controller.signal,
      });
      return statusFromResponse(response, config, 'models');
    }

    if (config.provider === 'anthropic') {
      // A single-token message is the cheapest authenticated call Anthropic exposes.
      const response = await fetch(`${ANTHROPIC_API_ROOT}/messages`, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'content-type': 'application/json', 'x-api-key': config.apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: config.model, max_tokens: 1, messages: [{ role: 'user', content: 'ping' }] }),
      });
      return statusFromResponse(response, config, 'key');
    }

    if (config.provider === 'codex') {
      const response = await fetch(`${CODEX_API_ROOT}/responses`, {
        method: 'POST',
        signal: controller.signal,
        headers: codexHeaders(config.apiKey),
        body: JSON.stringify({
          model: config.model,
          input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: 'ping' }] }],
          store: false,
          stream: false,
          max_output_tokens: 16,
        }),
      });
      return statusFromResponse(response, config, 'token');
    }

    if (config.provider === 'openrouter') {
      const response = await fetch(`${OPENROUTER_API_ROOT}/auth/key`, {
        headers: { Authorization: `Bearer ${config.apiKey}` },
        signal: controller.signal,
      });

      if (response.ok) {
        return {
          state: 'CONNECTED',
          model: config.model,
          provider: 'openrouter',
          keySource: config.keySource,
          detail: `Connected to OpenRouter. Model: "${config.model}".`,
        };
      }

      if (response.status === 401 || response.status === 403) {
        return {
          state: 'INVALID KEY',
          model: config.model,
          provider: 'openrouter',
          keySource: config.keySource,
          detail: 'OpenRouter rejected the API key.',
        };
      }

      if (response.status === 429) {
        return {
          state: 'QUOTA/RATE LIMITED',
          model: config.model,
          provider: 'openrouter',
          keySource: config.keySource,
          detail: 'OpenRouter rate limit or quota exceeded.',
        };
      }

      return {
        state: 'SERVER ERROR',
        model: config.model,
        provider: 'openrouter',
        keySource: config.keySource,
        detail: `OpenRouter responded with HTTP ${response.status}.`,
      };
    }

    // Direct Gemini
    const response = await fetch(
      `${GEMINI_API_ROOT}/models/${encodeURIComponent(config.model)}`,
      {
        headers: { 'x-goog-api-key': config.apiKey },
        signal: controller.signal,
      }
    );

    if (response.ok) {
      return {
        state: 'CONNECTED',
        model: config.model,
        provider: 'gemini',
        keySource: config.keySource,
        detail: `Connected to Google Gemini. Model: "${config.model}".`,
      };
    }

    if (response.status === 400 || response.status === 401 || response.status === 403) {
      return {
        state: 'INVALID KEY',
        model: config.model,
        provider: 'gemini',
        keySource: config.keySource,
        detail: 'Gemini rejected the API key.',
      };
    }

    if (response.status === 429) {
      return {
        state: 'QUOTA/RATE LIMITED',
        model: config.model,
        provider: 'gemini',
        keySource: config.keySource,
        detail: 'Gemini rate limit or quota exceeded.',
      };
    }

    if (response.status === 404) {
      return {
        state: 'MODEL UNAVAILABLE',
        model: config.model,
        provider: 'gemini',
        keySource: config.keySource,
        detail: `The model "${config.model}" is not available on this Gemini key.`,
      };
    }

    return {
      state: 'SERVER ERROR',
      model: config.model,
      provider: 'gemini',
      keySource: config.keySource,
      detail: `Gemini responded with HTTP ${response.status}.`,
    };
  } catch (error) {
    const isAbort = error instanceof Error && error.name === 'AbortError';
    return {
      state: 'SERVER ERROR',
      model: config.model,
      provider: config.provider,
      keySource: config.keySource,
      detail: isAbort ? 'Connection test timed out.' : 'AI provider could not be reached.',
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Legacy function alias */
export const testGeminiConnection = testAiSeoConnection;

/** Turn a provider HTTP status into an error that names the provider, not its body. */
function providerRequestError(config: AiSeoConfig, status: number): GeminiError {
  const label = PROVIDER_SPEC_BY_ID[config.provider].label;
  if (status === 401 || status === 403) return new GeminiError(`${label} rejected the API key.`, 401);
  if (status === 402) return new GeminiError(`${label} has no credit for this request.`, 402);
  if (status === 429) return new GeminiError(`${label} is rate-limiting this request. Please wait a moment.`, 429);
  if (status === 404) return new GeminiError(`The model "${config.model}" is not available on this ${label} account.`, 404);
  return new GeminiError(`${label} responded with HTTP ${status}.`, status);
}

/** Pull the assistant text out of a Codex `responses` payload. */
function extractCodexText(payload: unknown): string {
  const body = (payload || {}) as {
    output_text?: string;
    output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
  };
  if (typeof body.output_text === 'string' && body.output_text.trim()) return body.output_text.trim();
  return (body.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((part) => part.type === 'output_text' || typeof part.text === 'string')
    .map((part) => part.text ?? '')
    .join('')
    .trim();
}

export interface ChatCompletionRequest {
  user: string;
  system?: string;
  maxTokens?: number;
  temperature?: number;
  /** Ask for a JSON object response where the provider supports it. */
  json?: boolean;
}

/**
 * One chat completion, against whichever provider `config` names.
 *
 * This is the single outbound text call the server makes. It used to exist three
 * times — once in the SEO module, once in `askModel`, once in the generate route
 * — which is why the providers added later (DeepSeek, OpenAI, Anthropic, Codex)
 * could be listed in the console but never actually called: each call site knew
 * only two providers. They now differ by request shape, not by copy.
 *
 * Returns the assistant text, or throws a `GeminiError` carrying the mapped
 * status. The key and the raw provider body never leave this function.
 */
export async function chatComplete(
  config: AiSeoConfig,
  request: ChatCompletionRequest,
  signal?: AbortSignal,
): Promise<string> {
  if (!config.apiKey) throw new GeminiError(`No API key is configured for ${PROVIDER_SPEC_BY_ID[config.provider].label}.`, 503);
  const spec = PROVIDER_SPEC_BY_ID[config.provider];
  const maxTokens = request.maxTokens ?? 1000;
  const temperature = request.temperature ?? 0.2;

  if (spec.kind === 'gemini') {
    const response = await fetch(`${GEMINI_API_ROOT}/models/${encodeURIComponent(config.model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.apiKey },
      signal,
      body: JSON.stringify({
        ...(request.system ? { systemInstruction: { parts: [{ text: request.system }] } } : {}),
        contents: [{ role: 'user', parts: [{ text: request.user }] }],
        generationConfig: {
          temperature,
          maxOutputTokens: maxTokens,
          ...(request.json ? { responseMimeType: 'application/json' } : {}),
        },
      }),
    });
    if (!response.ok) throw providerRequestError(config, response.status);
    const payload = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      promptFeedback?: { blockReason?: string };
    };
    if (payload.promptFeedback?.blockReason) {
      throw new GeminiError(`Gemini refused the request (${payload.promptFeedback.blockReason}).`, 422);
    }
    return payload.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('').trim() || '';
  }

  if (spec.kind === 'anthropic') {
    const response = await fetch(`${ANTHROPIC_API_ROOT}/messages`, {
      method: 'POST',
      signal,
      headers: { 'content-type': 'application/json', 'x-api-key': config.apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: config.model,
        max_tokens: maxTokens,
        temperature,
        ...(request.system ? { system: request.system } : {}),
        messages: [{ role: 'user', content: request.user }],
      }),
    });
    if (!response.ok) throw providerRequestError(config, response.status);
    const payload = (await response.json()) as { content?: Array<{ type?: string; text?: string }> };
    return (payload.content ?? []).filter((block) => block.type === 'text').map((block) => block.text ?? '').join('').trim();
  }

  if (spec.kind === 'codex') {
    const response = await fetch(`${CODEX_API_ROOT}/responses`, {
      method: 'POST',
      signal,
      headers: codexHeaders(config.apiKey),
      body: JSON.stringify({
        model: config.model,
        ...(request.system ? { instructions: request.system } : {}),
        input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: request.user }] }],
        store: false,
        stream: false,
        max_output_tokens: maxTokens,
        temperature,
      }),
    });
    if (!response.ok) throw providerRequestError(config, response.status);
    return extractCodexText(await response.json());
  }

  // OpenRouter and the OpenAI-compatible providers (OpenAI, DeepSeek).
  const response = await fetch(`${spec.apiRoot}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
      ...(spec.kind === 'openrouter' ? { 'HTTP-Referer': 'https://preview.himalayankoh.com', 'X-Title': 'Himalayan Koh Admin' } : {}),
    },
    signal,
    body: JSON.stringify({
      model: config.model,
      messages: [
        ...(request.system ? [{ role: 'system', content: request.system }] : []),
        { role: 'user', content: request.user },
      ],
      temperature,
      max_tokens: maxTokens,
      ...(request.json ? { response_format: { type: 'json_object' } } : {}),
    }),
  });
  if (!response.ok) throw providerRequestError(config, response.status);
  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  };
  if (payload.error?.message) throw new GeminiError(`${spec.label} could not complete this request.`, 502);
  return payload.choices?.[0]?.message?.content?.trim() || '';
}

export interface SeoDraftInput {
  subject: 'product' | 'category' | 'page';
  name: string;
  facts: {
    sku?: string | null;
    price?: string | null;
    weight?: string | null;
    category?: string | null;
    grainSize?: string | null;
    description?: string | null;
    currentTitle?: string | null;
    currentMeta?: string | null;
  };
  keywords?: string[];
}

export interface SeoDraftField {
  value: string;
  blocked: ProhibitedClaim[];
}

export interface SeoDraft {
  language: 'en';
  seoTitle: string;
  metaDescription: string;
  primaryKeyword: string;
  secondaryKeywords: string[];
  imageAltSuggestions: string[];
  shortSeoCopy: string;
  notes: string[];
  // Legacy / compatibility fields:
  title: SeoDraftField;
  metaDescriptionField?: SeoDraftField;
  description: SeoDraftField;
  keywords: string[];
  model: string;
  provider: AiProviderType;
  warnings: string[];
}

export class GeminiError extends Error {
  readonly status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.name = 'GeminiError';
    this.status = status;
  }
}

const SYSTEM_INSTRUCTION = `You are an expert SEO copywriter for Himalayan Koh, a store selling Himalayan pink salt, cooking salt blocks, and mineral salt blocks/licks.

STRICT REQUIREMENTS:
1. LANGUAGE: ENGLISH ONLY. All generated titles, meta descriptions, copy, keywords, and notes MUST be in natural, grammatically correct, professional English. Never output Urdu, Roman Urdu, Hindi, or any non-English script.
2. FACTUAL INTEGRITY: Use ONLY the verified product/category facts provided. Never invent certifications, lab results, medical claims, cures, veterinary claims, stock figures, discounts, or shipping promises.
3. PROHIBITED CLAIMS: Never claim that pink salt cures, treats, heals, prevents, or detoxifies. Never claim "FDA approved", "USDA organic", "clinically proven", or "veterinarian approved".
4. STRUCTURE: Respond with valid JSON only matching the schema exactly.`;

function buildPrompt(input: SeoDraftInput): string {
  const facts = Object.entries(input.facts)
    .filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== '')
    .map(([key, value]) => `- ${key}: ${String(value).trim()}`)
    .join('\n');

  return `Write SEO copy for this ${input.subject}.

Name: ${input.name}
${facts ? `Known facts (the only facts you may use):\n${facts}` : 'No verified facts were supplied: write only what the name itself supports.'}
${input.keywords?.length ? `Target keywords: ${input.keywords.join(', ')}` : ''}

Respond with a JSON object matching this schema:
{
  "language": "en",
  "seoTitle": "SEO title, maximum 60 characters",
  "metaDescription": "meta description, maximum 155 characters",
  "primaryKeyword": "primary target keyword",
  "secondaryKeywords": ["2 to 4 secondary keywords"],
  "imageAltSuggestions": ["1 to 2 descriptive image alt texts"],
  "shortSeoCopy": "2 to 3 factual sentences in plain English",
  "notes": ["1 to 2 concise factual notes"]
}`;
}

function extractJson(text: string): Record<string, unknown> | null {
  const trimmed = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start === -1 || end <= start) return null;
    try {
      return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}

function validateEnglishOnly(text: string): boolean {
  // Disallow Arabic, Urdu, Devanagari, and non-Latin character sets
  return !/[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF\u0900-\u097F]/.test(text);
}

function field(value: unknown): SeoDraftField {
  const text = typeof value === 'string' ? value.trim() : '';
  return { value: text, blocked: findProhibitedClaims(text) };
}

/**
 * Models often repeat brand-level context as if it were a fact about the
 * selected product. Remove those unsupported additions before the draft is
 * returned: Generate is allowed to be useful, but it must never turn a missing
 * fact into a customer-facing promise.
 */
function sanitizeUnsupportedFacts(text: string, input: SeoDraftInput): { value: string; changed: boolean } {
  const known = [input.name, ...Object.values(input.facts), ...(input.keywords || [])]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase();
  let value = text.trim();
  const original = value;
  const unsupported = (term: string) => !known.includes(term);

  if (unsupported('houston') || unsupported('texas')) {
    value = value
      .replace(/,?\s*(?:packed|packaged)\s+and\s+shipped\s+from\s+Houston,?\s*Texas\.?/gi, '')
      .replace(/,?\s*(?:packed|packaged)\s+and\s+shipped\s+from\s+Houston\.?/gi, '')
      .replace(/\b(?:from|in)\s+Houston,?\s*Texas\b/gi, '')
      .replace(/\bHouston,?\s*Texas\b/gi, '');
  }
  if (unsupported('pure')) value = value.replace(/\bpure\s+/gi, '');
  if (unsupported('natural')) value = value.replace(/\bnatural\s+/gi, '');
  if (unsupported('essential minerals')) value = value.replace(/\bproviding\s+(?:a\s+)?substantial\s+source\s+of\s+essential\s+minerals\b/gi, '');
  if (unsupported('substantial source')) value = value.replace(/\bproviding\s+(?:a\s+)?substantial\s+source\s+of\s+(?:pure\s+)?Himalayan salt\b/gi, '');

  return { value: value.replace(/\s{2,}/g, ' ').replace(/\s+([,.])/g, '$1').trim(), changed: value !== original };
}

/**
 * Generates an SEO draft using the configured server-side AI provider.
 * Enforces English-only copy, factual grounding, and structured JSON output.
 */
export async function generateSeoDraft(
  input: SeoDraftInput,
  options: { timeoutMs?: number } = {}
): Promise<SeoDraft> {
  const config = await resolveAiSeoConfig();
  if (!config.apiKey) {
    throw new GeminiError(
      'AI assistant is not configured. Add an API key in server environment or Admin Settings.',
      503
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 45_000);

  try {
    const rawText = await chatComplete(
      config,
      { user: buildPrompt(input), system: SYSTEM_INSTRUCTION, maxTokens: 1000, temperature: 0.2, json: true },
      controller.signal,
    );

    const parsed = extractJson(rawText);
    if (!parsed) {
      throw new GeminiError('The AI model returned an invalid response shape. Please retry.');
    }

    const rawSeoTitle = typeof parsed.seoTitle === 'string' ? parsed.seoTitle.trim() : typeof parsed.title === 'string' ? parsed.title.trim() : '';
    const rawMetaDescription = typeof parsed.metaDescription === 'string' ? parsed.metaDescription.trim() : '';
    const rawShortSeoCopy = typeof parsed.shortSeoCopy === 'string' ? parsed.shortSeoCopy.trim() : typeof parsed.description === 'string' ? parsed.description.trim() : '';
    const cleanTitle = sanitizeUnsupportedFacts(rawSeoTitle, input);
    const cleanMeta = sanitizeUnsupportedFacts(rawMetaDescription, input);
    const cleanShort = sanitizeUnsupportedFacts(rawShortSeoCopy, input);
    const seoTitle = cleanTitle.value;
    const metaDescription = cleanMeta.value;
    const shortSeoCopy = cleanShort.value;
    const primaryKeyword = typeof parsed.primaryKeyword === 'string' ? parsed.primaryKeyword.trim() : '';
    const secondaryKeywords = (Array.isArray(parsed.secondaryKeywords)
      ? parsed.secondaryKeywords.map((s) => String(s).trim()).filter(Boolean)
      : Array.isArray(parsed.keywords)
        ? parsed.keywords.map((s) => String(s).trim()).filter(Boolean)
        : []).map((keyword) => sanitizeUnsupportedFacts(keyword, input).value).filter(Boolean);
    const imageAltSuggestions = Array.isArray(parsed.imageAltSuggestions)
      ? parsed.imageAltSuggestions.map((s) => String(s).trim()).filter(Boolean)
      : [];
    const notes = Array.isArray(parsed.notes)
      ? parsed.notes.map((s) => String(s).trim()).filter(Boolean)
      : [];

    // English-only validation
    const fullDraftText = `${seoTitle} ${metaDescription} ${shortSeoCopy} ${primaryKeyword} ${secondaryKeywords.join(' ')}`;
    if (!validateEnglishOnly(fullDraftText)) {
      throw new GeminiError('AI generated copy contained non-English text. Generation rejected.', 422);
    }

    const warnings: string[] = [];
    const sanitizedCount = [cleanTitle, cleanMeta, cleanShort].filter((entry) => entry.changed).length;
    if (sanitizedCount > 0) warnings.push('Unsupported provider-added facts were removed; review the draft before applying it.');
    const blockedTotal = [field(seoTitle), field(metaDescription), field(shortSeoCopy)]
      .flatMap((entry) => entry.blocked).length;

    if (blockedTotal > 0) {
      warnings.push('The draft contains claims this store cannot support. Those fields are marked blocked.');
    }

    return {
      language: 'en',
      seoTitle,
      metaDescription,
      primaryKeyword,
      secondaryKeywords,
      imageAltSuggestions,
      shortSeoCopy,
      notes,
      title: field(seoTitle),
      description: field(shortSeoCopy),
      keywords: [primaryKeyword, ...secondaryKeywords].filter(Boolean).slice(0, 6),
      model: config.model,
      provider: config.provider,
      warnings,
    };
  } catch (error) {
    if (error instanceof GeminiError) throw error;
    const aborted = error instanceof Error && error.name === 'AbortError';
    throw new GeminiError(
      aborted
        ? 'AI request timed out. Please try again.'
        : `SEO generation failed: ${error instanceof Error ? error.message : String(error)}`
    );
  } finally {
    clearTimeout(timer);
  }
}
