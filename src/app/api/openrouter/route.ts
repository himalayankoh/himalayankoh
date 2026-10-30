// Note: cannot use 'edge' runtime because getSetting uses Node.js globals (server-only DB client)
// export const runtime = 'edge';

import { getSetting } from '@/lib/settings/serverSettings';
import { checkRateLimit } from '@/lib/rateLimit';
import { isAllowedRequestOrigin } from '@/lib/http/originAllowlist';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

const stableFreeModels = [
  'google/gemini-2.5-flash',
  'google/gemini-2.5-flash-lite',
  'openrouter/free',
  'deepseek/deepseek-v4-flash-0731:free',
  'meta-llama/llama-3.3-70b-instruct:free',
  'qwen/qwen3-next-80b-a3b-instruct:free',
];

async function resolveModelCandidates(): Promise<string[]> {
  const dbModel = await getSetting('openrouter', 'model');
  const envModel = process.env.OPENROUTER_MODEL;
  const preferred = dbModel || envModel || 'google/gemini-2.5-flash';
  return Array.from(new Set([preferred, ...stableFreeModels].filter(Boolean))) as string[];
}

const maxMessages = 12;
const maxMessageLength = 2000;

const systemPrompt = `You are the Himalayan Koh customer support assistant.
This shop sells Himalayan pink salt and nothing else. Help customers with pink salt guidance, product comparisons, recipes and use, FAQs, and order/support questions.
Keep answers concise, practical, and safe. Do not offer medical or dietary treatment advice; suggest the customer speak to a qualified professional for health questions.
The shop's shelves are edible pink salt (fine and coarse grain, jars, pouches, bags), cooking and serving (salt blocks and plates), salt lamps and décor, and bulk and wholesale salt. Do not recommend products from outside these shelves, and never suggest a product, price or stock level that was not given to you.
When unsure about inventory, pricing, shipping, order status, or account details, tell the customer to contact support or check their account.`;

export async function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

export async function POST(request: Request) {
  const responseHeaders = corsHeaders(request);

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const rl = checkRateLimit(`openrouter:${ip}`, { limit: 5, windowMs: 60_000 });
  if (!rl.allowed) {
    return jsonResponse({ error: 'Too many requests. Please try again later.' }, 429, responseHeaders);
  }

  const contentType = request.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    return jsonResponse({ error: 'Content-Type must be application/json' }, 415, responseHeaders);
  }

  const apiKey = (await getSetting('openrouter', 'api_key'))
    || process.env.OPENROUTER_API_KEY
    || process.env.OPEN_ROUTER_API_KEY;
  if (!apiKey) {
    return jsonResponse(
      { error: 'AI assistant is not configured yet. Please add OPENROUTER_API_KEY as a Cloudflare Worker secret or server environment variable.' },
      503,
      responseHeaders
    );
  }

  let body: { messages?: ChatMessage[] };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400, responseHeaders);
  }

  const messages = (body.messages || [])
    .filter((message) => ['user', 'assistant'].includes(message.role) && message.content?.trim())
    .map((message) => ({
      role: message.role as 'user' | 'assistant',
      content: message.content.trim().slice(0, maxMessageLength),
    }))
    .slice(-maxMessages);

  if (messages.length === 0 || messages[messages.length - 1].role !== 'user') {
    return jsonResponse({ error: 'A user message is required' }, 400, responseHeaders);
  }

  const modelCandidates = await resolveModelCandidates();
  const upstream = await requestOpenRouter({
    apiKey,
    origin: request.headers.get('origin') || 'https://himalayankoh.com',
    messages,
    modelCandidates,
  });

  if (!upstream.content) {
    return jsonResponse(
      { error: friendlyAiError(upstream.error) },
      upstream.status || 502,
      responseHeaders
    );
  }

  return new Response(upstream.content, {
    headers: {
      ...responseHeaders,
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-OpenRouter-Model': upstream.model,
    },
  });
}

async function requestOpenRouter({
  apiKey,
  origin,
  messages,
  modelCandidates,
}: {
  apiKey: string;
  origin: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
  modelCandidates: string[];
}) {
  let lastError = '';
  let lastStatus = 502;

  for (const model of modelCandidates) {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': origin,
        'X-Title': 'Himalayan Koh Ecommerce Assistant',
      },
      body: JSON.stringify({
        model,
        stream: false,
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        temperature: 0.35,
        max_tokens: 750,
      }),
    });

    lastStatus = response.status || 502;

    if (response.ok) {
      const parsed = await parseOpenRouterResponse(response);
      if (parsed.content) {
        return { content: parsed.content, model, status: response.status };
      }
      lastError = parsed.error || `OpenRouter returned an empty response for ${model}`;
    } else {
      lastError = await readableOpenRouterError(response);
    }

    if (isConfigurationError(response.status, lastError)) {
      return { content: '', model, status: response.status, error: lastError };
    }
  }

  return {
    content: '',
    model: modelCandidates[modelCandidates.length - 1],
    status: lastStatus,
    error: lastError || 'No OpenRouter model is available right now.',
  };
}

async function parseOpenRouterResponse(response: Response) {
  try {
    const parsed = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
      error?: { message?: string } | string;
      message?: string;
    };
    const content = parsed.choices?.[0]?.message?.content?.trim();
    if (content) return { content };
    if (typeof parsed.error === 'string') return { error: parsed.error };
    return {
      error: parsed.error?.message || parsed.message || 'OpenRouter returned no message content.',
    };
  } catch {
    return { error: 'OpenRouter returned an invalid response.' };
  }
}

function isConfigurationError(status: number, error: string) {
  if ([401, 402, 403].includes(status)) return true;
  return /api key|auth|credit|quota|billing/i.test(error);
}

function friendlyAiError(error?: string) {
  if (!error) return 'The AI assistant is temporarily busy. Please try again in a moment.';
  if (/api key|auth/i.test(error)) {
    return 'The AI assistant is not configured correctly yet. Please contact support.';
  }
  if (/credit|quota|billing/i.test(error)) {
    return 'The AI assistant is temporarily unavailable due to provider limits. Please try again later.';
  }
  return 'The AI assistant is temporarily busy. Please try again in a moment.';
}

async function readableOpenRouterError(response: Response) {
  const fallback = `OpenRouter request failed (${response.status})`;
  try {
    const text = await response.text();
    if (!text) return fallback;
    const parsed = JSON.parse(text) as { error?: { message?: string } | string; message?: string };
    if (typeof parsed.error === 'string') return parsed.error;
    return parsed.error?.message || parsed.message || fallback;
  } catch {
    return fallback;
  }
}

function jsonResponse(body: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}

function corsHeaders(request: Request) {
  const requestOrigin = request.headers.get('origin') || '';
  // A real allowlist, not a blind reflection of whatever Origin a caller sends —
  // that pattern lets any third-party site ride this API and its rate limit and
  // cost budget. The rule itself lives in `@/lib/http/originAllowlist` so it can be
  // unit-tested and so it names no deployment (see that module for why
  // a stale-host fallback is worse than none).
  const origin = isAllowedRequestOrigin(requestOrigin, request.url) ? requestOrigin : '';
  return {
    ...(origin ? { 'Access-Control-Allow-Origin': origin } : {}),
    Vary: 'Origin',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}
