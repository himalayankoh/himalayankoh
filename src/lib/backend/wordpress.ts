/**
 * Minimal WordPress/WooCommerce REST client.
 *
 * Two things this client does that a bare `fetch` does not, and both matter
 * for this migration:
 *
 *  1. A WordPress PHP fatal comes back as HTTP 500 with an HTML error page, not
 *     JSON. Parsing that as JSON produces a baffling "Unexpected token '<'",
 *     which hides the real problem. We detect the fatal page and raise a typed
 *     error naming the endpoint that died.
 *  2. Timeouts are explicit. A hung staging origin must not hang a page render.
 */

import { backendConfig } from './config';
import { wooCredentials } from './credentials';
import { looksLikeHtml, looksLikeWordPressFatal } from './wordpressFatal.mjs';

/** A structured backend failure. Never wraps the raw HTML body in the message. */
export class WordPressApiError extends Error {
  readonly status: number;
  readonly path: string;
  readonly code: string | null;
  /** Short, already-sanitised excerpt of the response body for diagnostics. */
  readonly bodySnippet: string | null;
  /** True when the body looked like a WordPress PHP fatal error page. */
  readonly isWordPressFatal: boolean;
  /** True when the body looked like an HTML page rather than the expected JSON. */
  readonly isHtmlResponse: boolean;

  constructor(init: {
    message: string;
    path: string;
    status: number;
    code?: string | null;
    bodySnippet?: string | null;
    isWordPressFatal?: boolean;
    isHtmlResponse?: boolean;
  }) {
    super(init.message);
    this.name = 'WordPressApiError';
    this.path = init.path;
    this.status = init.status;
    this.code = init.code ?? null;
    this.bodySnippet = init.bodySnippet ?? null;
    this.isWordPressFatal = init.isWordPressFatal ?? false;
    this.isHtmlResponse = init.isHtmlResponse ?? false;
  }
}

export type QueryValue = string | number | boolean | undefined | null | Array<string | number>;

/**
 * The most rows the WordPress REST API returns in one request (`per_page`
 * ceiling, enforced by WordPress itself). Callers that need a whole collection
 * read at this width and must say so when they hit it, rather than presenting a
 * truncated collection as the complete one.
 */
export const WORDPRESS_MAX_PER_PAGE = 100;

export interface WordPressRequestOptions {
  /** Query string params. Arrays become `key[]` params. Undefined/null are dropped. */
  params?: Record<string, QueryValue>;
  /** Abort after this many ms. Defaults to backendConfig.requestTimeoutMs. */
  timeoutMs?: number;
  /** Next.js revalidate window in seconds. */
  revalidate?: number;
  /** Caller-provided abort signal, composed with the timeout signal. */
  signal?: AbortSignal;
  /**
   * Basic-auth credentials for the WooCommerce admin API. Server-only.
   * Defaults to the configured consumer key/secret when `useCredentials` is set.
   */
  credentials?: { username: string; password: string } | null;
  /** Shorthand: use the configured WooCommerce consumer key/secret. */
  useCredentials?: boolean;
  /** HTTP method. Anything other than GET is a write and is never cached. */
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** JSON request body, for writes. */
  body?: unknown;
  headers?: Record<string, string>;
}

/** Collapses a response body into a short single-line excerpt safe to log. */
export function toBodySnippet(body: string, maxLength = 220): string {
  const collapsed = body.replace(/\s+/g, ' ').trim();
  return collapsed.length > maxLength ? `${collapsed.slice(0, maxLength)}…` : collapsed;
}

/**
 * Fatal/HTML detection lives in `wordpressFatal.mjs` so this client and
 * `scripts/check-wordpress-setup.mjs` share one implementation instead of two
 * that drift. See that module for the response shape it recognises.
 */

/**
 * Serialises params the way the WordPress REST API expects.
 *
 * An array becomes `key[]=a&key[]=b`, **not** `key=a&key=b`. WordPress reads the
 * query through PHP, and PHP keeps only the last value of a repeated key, so the
 * repeated form silently truncates a multi-value filter to its final value instead
 * of failing. That is how it failed here: `/wc/v3/products?include=2721&include=2752`
 * came back with one product, so every other product in the request was graded as an
 * unknown product. The bracketed form is what WordPress parses back into an array,
 * and both forms were measured against the store itself before this was changed.
 */
export function buildQueryString(params: Record<string, QueryValue> = {}): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      for (const item of value) search.append(`${key}[]`, String(item));
    } else {
      search.append(key, String(value));
    }
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

/** Resolves the absolute URL for a WordPress REST path. */
export function buildWordPressUrl(path: string, base = backendConfig.wordpressApiRoot): string {
  const normalisedPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalisedPath}`;
}

/**
 * The same request, with the response envelope kept.
 *
 * Paginated admin reads need WordPress's own row counts (`X-WP-Total` /
 * `X-WP-TotalPages`) to render "page 2 of 7" honestly. Those live in headers, so
 * the plain `wordpressRequest` throws them away and every caller that needed a
 * count would have had to re-implement this client — including its fatal-page
 * detection and timeout. Callers that only want the body use the wrapper below.
 */
export interface WordPressResponse<T> {
  data: T;
  status: number;
  /** `X-WP-Total`: rows matching the query, not rows in this page. Null when absent. */
  total: number | null;
  /** `X-WP-TotalPages`. Null when absent. */
  totalPages: number | null;
}

function headerCount(headers: Headers, name: string): number | null {
  const raw = headers.get(name);
  if (raw === null || raw === '') return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Performs a JSON read against the WordPress/WooCommerce REST API, keeping counts. */
export async function wordpressRequestWithMeta<T>(
  path: string,
  options: WordPressRequestOptions = {}
): Promise<WordPressResponse<T>> {
  const { params, revalidate, signal, headers } = options;
  const method = options.method ?? 'GET';
  const isWrite = method !== 'GET';
  const timeoutMs = options.timeoutMs ?? backendConfig.requestTimeoutMs;
  const base = backendConfig.wordpressApiRoot;

  if (!base) {
    throw new WordPressApiError({
      message: 'WordPress is not configured (WORDPRESS_BASE_URL is empty).',
      path,
      status: 0,
    });
  }

  const url = `${buildWordPressUrl(path, base)}${buildQueryString(params)}`;

  // Compose caller signal with a timeout so neither can be forgotten, and both
  // abort paths are distinguishable via the error we raise below.
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', onAbort, { once: true });
  }
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const credentials =
    options.credentials ?? (options.useCredentials ? wooCredentials() : null);

  const requestHeaders: Record<string, string> = {
    Accept: 'application/json',
    ...headers,
  };
  if (credentials) {
    const token = Buffer.from(`${credentials.username}:${credentials.password}`).toString('base64');
    requestHeaders.Authorization = `Basic ${token}`;
  }

  const requestBody =
    options.body === undefined ? undefined : JSON.stringify(options.body);
  if (requestBody !== undefined) requestHeaders['Content-Type'] = 'application/json';

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: requestHeaders,
      signal: controller.signal,
      // A write is never cached, and never revalidated into a cache entry: the
      // next read must see the store's own answer, not ours.
      ...(isWrite || revalidate === undefined
        ? { cache: 'no-store' as RequestCache }
        : { next: { revalidate } }),
      ...(requestBody === undefined ? {} : { body: requestBody }),
    });
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError';
    throw new WordPressApiError({
      message: aborted
        ? `WordPress request timed out after ${timeoutMs}ms (${path}).`
        : `WordPress request failed for ${path}: ${error instanceof Error ? error.message : String(error)}`,
      path,
      status: 0,
    });
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onAbort);
  }

  const rawBody = await response.text().catch(() => '');
  const isFatal = looksLikeWordPressFatal(rawBody);
  const isHtml = looksLikeHtml(rawBody);

  if (!response.ok) {
    // Prefer the API's own machine-readable error code/message when present.
    let code: string | null = null;
    let message = `WordPress returned HTTP ${response.status} for ${path}.`;
    if (!isHtml) {
      try {
        const parsed = JSON.parse(rawBody) as { code?: string; message?: string };
        code = parsed.code ?? null;
        if (parsed.message) message = `WordPress error ${parsed.code ?? response.status}: ${parsed.message}`;
      } catch {
        /* body was neither HTML nor JSON — fall through to the generic message */
      }
    }
    if (isFatal) {
      message =
        `WordPress threw a PHP fatal error (HTTP ${response.status}) on ${path}. ` +
        'The endpoint is broken on the origin — this is a server-side WordPress problem, not a client bug.';
    }

    throw new WordPressApiError({
      message,
      path,
      status: response.status,
      code,
      bodySnippet: toBodySnippet(rawBody),
      isWordPressFatal: isFatal,
      isHtmlResponse: isHtml,
    });
  }

  if (isFatal) {
    throw new WordPressApiError({
      message:
        `WordPress returned HTTP ${response.status} but the body is a PHP fatal error page (${path}).`,
      path,
      status: response.status,
      bodySnippet: toBodySnippet(rawBody),
      isWordPressFatal: true,
      isHtmlResponse: true,
    });
  }

  try {
    return {
      data: JSON.parse(rawBody) as T,
      status: response.status,
      total: headerCount(response.headers, 'x-wp-total'),
      totalPages: headerCount(response.headers, 'x-wp-totalpages'),
    };
  } catch {
    throw new WordPressApiError({
      message: `WordPress returned HTTP ${response.status} for ${path} but the body was not valid JSON.`,
      path,
      status: response.status,
      bodySnippet: toBodySnippet(rawBody),
      isHtmlResponse: isHtml,
    });
  }
}

/**
 * Performs a JSON read against the WordPress/WooCommerce REST API.
 * Throws WordPressApiError on any non-2xx, timeout, fatal page or bad payload.
 */
export async function wordpressRequest<T>(
  path: string,
  options: WordPressRequestOptions = {}
): Promise<T> {
  return (await wordpressRequestWithMeta<T>(path, options)).data;
}

/**
 * Read that never throws: returns the data, or null plus a readable error.
 * Used by the catalog adapter, which must degrade rather than blank a page.
 */
export async function wordpressRequestSafe<T>(
  path: string,
  options: WordPressRequestOptions = {}
): Promise<{ data: T | null; error: string | null }> {
  try {
    return { data: await wordpressRequest<T>(path, options), error: null };
  } catch (error) {
    if (error instanceof WordPressApiError) {
      return { data: null, error: `${error.message}${error.code ? ` [${error.code}]` : ''}` };
    }
    return { data: null, error: error instanceof Error ? error.message : String(error) };
  }
}
