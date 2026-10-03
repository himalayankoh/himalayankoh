/**
 * One generic server-side model call, for the jobs that are not SEO copy.
 *
 * The provider, API key, model and key-source all come from
 * `resolveAiSeoConfig()` — the same resolution the SEO assistant uses, so the
 * console's single key setting drives both and no second key path exists. The
 * request shapes mirror `gemini.ts` deliberately: OpenRouter first
 * (`google/gemini-2.5-flash`), direct Gemini second.
 *
 * Keys never leave the server: this module is server-only by usage (imported
 * from route handlers), returns text, and never echoes the key or the raw
 * provider error body.
 */

import { resolveAiSeoConfig } from './gemini';

export class AiAskError extends Error {
  readonly status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.name = 'AiAskError';
    this.status = status;
  }
}

export interface AskModelResult {
  text: string;
  provider: string;
  model: string;
  sources?: Array<{ url: string; title: string }>;
}

export async function askModel(options: {
  prompt: string;
  system?: string;
  /** Ask the provider for a JSON object response where it supports it. */
  json?: boolean;
  timeoutMs?: number;
  maxTokens?: number;
  /** Always run a real search; citations are returned separately from model copy. */
  webSearch?: boolean;
}): Promise<AskModelResult> {
  const config = await resolveAiSeoConfig();
  if (!config.apiKey) {
    throw new AiAskError('AI assistant is not configured. Add an API key in Admin Settings or the server environment.', 503);
  }
  if (options.webSearch && config.provider !== 'openrouter') {
    throw new AiAskError('Market research requires the configured OpenRouter web search integration. Configure OpenRouter in Admin Settings.', 503);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 30_000);
  const maxTokens = options.maxTokens ?? 700;

  try {
    if (config.provider === 'openrouter') {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://preview.himalayankoh.com',
          'X-Title': 'Himalayan Koh Admin',
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: config.model,
          messages: [
            ...(options.system ? [{ role: 'system', content: options.system }] : []),
            { role: 'user', content: options.prompt },
          ],
          temperature: 0.1,
          max_tokens: maxTokens,
          ...(options.webSearch ? { plugins: [{ id: 'web', engine: 'exa', max_results: 3 }] } : {}),
        }),
      });
      if (!response.ok) throw providerError('AI provider', response.status);
      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string; annotations?: Array<{ type?: string; url_citation?: { url?: string; title?: string } }> } }>;
        error?: { message?: string };
      };
      if (payload.error) throw new AiAskError('AI provider could not complete this request.');
      const sources = (payload.choices?.[0]?.message?.annotations ?? [])
        .filter((annotation) => annotation.type === 'url_citation' && /^https?:\/\//i.test(annotation.url_citation?.url ?? ''))
        .map((annotation) => ({ url: annotation.url_citation!.url!, title: annotation.url_citation?.title || annotation.url_citation!.url! }));
      if (options.webSearch && !sources.length) {
        throw new AiAskError('Web search returned no cited evidence. SEO generation was stopped; retry research or turn research off to use product facts only.', 502);
      }
      return {
        text: payload.choices?.[0]?.message?.content?.trim() || '',
        provider: config.provider,
        model: config.model,
        ...(options.webSearch ? { sources } : {}),
      };
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.apiKey },
        signal: controller.signal,
        body: JSON.stringify({
          ...(options.system ? { systemInstruction: { parts: [{ text: options.system }] } } : {}),
          contents: [{ role: 'user', parts: [{ text: options.prompt }] }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: maxTokens,
            ...(options.json ? { responseMimeType: 'application/json' } : {}),
          },
        }),
      }
    );
    if (!response.ok) throw providerError('Gemini', response.status);
    const payload = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      promptFeedback?: { blockReason?: string };
    };
    if (payload.promptFeedback?.blockReason) {
      throw new AiAskError(`Gemini refused the request (${payload.promptFeedback.blockReason}).`, 422);
    }
    return {
      text: payload.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('').trim() || '',
      provider: config.provider,
      model: config.model,
    };
  } catch (error) {
    if (error instanceof AiAskError) throw error;
    const aborted = error instanceof Error && error.name === 'AbortError';
    throw new AiAskError(
      aborted ? 'AI request timed out. Please try again.' : `AI request failed: ${error instanceof Error ? error.message : String(error)}`
    );
  } finally {
    clearTimeout(timer);
  }
}

/** Turn a provider status into a message that says what happened, not the body. */
function providerError(label: string, status: number): AiAskError {
  if (status === 401 || status === 403) return new AiAskError(`${label} rejected the API key.`, 401);
  if (status === 429) return new AiAskError(`${label} is rate-limiting this request. Please wait a moment.`, 429);
  if (status === 402) return new AiAskError(`${label} has no credit for this request.`, 402);
  return new AiAskError(`${label} responded with HTTP ${status}.`, status);
}

/** Parse a JSON object out of a model response, tolerating code fences. */
export function extractJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = (text || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
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
