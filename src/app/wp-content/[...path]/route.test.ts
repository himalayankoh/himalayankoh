import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The passthrough exists because the cutover moves `/wp-content/uploads/…` from
 * WordPress to this Worker while every image URL in the live catalogue stays
 * absolute to the apex. Four things have to hold, and each one is a way the
 * storefront would break rather than a style preference:
 *
 *  1. the file is fetched from the **configured backend origin**, never from the
 *     origin the request arrived on — otherwise post-cutover every image is the
 *     Worker calling itself;
 *  2. no crafted path can resolve outside `/wp-content/` on that backend;
 *  3. a redirect is refused, never followed, because that is how a proxy loops;
 *  4. WordPress's cookies are not forwarded onto the shopping domain.
 */

const BACKEND = 'https://backend.test';
const APPEX = 'https://himalayankoh.com';

const mockBackendConfig = { wordpressBaseUrl: BACKEND };

vi.mock('@/lib/backend/config', () => ({ backendConfig: mockBackendConfig }));

const calls: Array<{ url: string; method: string; headers: Record<string, string>; redirect?: string }> = [];

type Upstream = { status: number; body?: BodyInit | null; headers?: Record<string, string> };

let nextUpstream: Upstream = { status: 200, body: 'image-bytes', headers: { 'content-type': 'image/jpeg' } };

function stubFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({
        url: String(input),
        method: String(init?.method ?? 'GET'),
        headers: (init?.headers ?? {}) as Record<string, string>,
        redirect: init?.redirect,
      });
      return new Response(nextUpstream.body ?? null, {
        status: nextUpstream.status,
        headers: nextUpstream.headers ?? {},
      });
    })
  );
}

const { GET, HEAD } = await import('./route');
// Imported from the module the route itself uses: the helper cannot live in the
// route file, because Next validates that a `route.ts` exports only handlers.
const { safeWpContentPath } = await import('@/lib/images/wpContentPath');

/** What Next hands the handler for `/wp-content/…`: the segments after the mount point. */
function pathParts(path: string): string[] {
  return path
    .split('?')[0]
    .replace(/^\/wp-content\/?/, '')
    .split('/')
    .filter((segment) => segment !== '');
}

async function call(handler: typeof GET, path: string, init?: RequestInit) {
  return handler(new Request(`${APPEX}${path}`, init), {
    params: Promise.resolve({ path: pathParts(path) }),
  });
}

/**
 * Where a crafted path actually lands, which is the property that matters — an
 * assertion about the returned string would only restate the implementation.
 */
function resolvedPathname(segments: string[]): string | null {
  const safe = safeWpContentPath(segments);
  return safe === null ? null : new URL(`${BACKEND}/${safe}`).pathname;
}

beforeEach(() => {
  calls.length = 0;
  mockBackendConfig.wordpressBaseUrl = BACKEND;
  nextUpstream = { status: 200, body: 'image-bytes', headers: { 'content-type': 'image/jpeg' } };
  stubFetch();
});

describe('safeWpContentPath', () => {
  it('accepts the shapes WordPress actually stores', () => {
    expect(safeWpContentPath(['uploads', '2022', '08', 'logo.png'])).toBe('wp-content/uploads/2022/08/logo.png');
    expect(safeWpContentPath(['uploads', '2024', '08', 'WhatsApp-Image-2024-08-02-at-11.31.07-PM-500x500.jpeg'])).toBe(
      'wp-content/uploads/2024/08/WhatsApp-Image-2024-08-02-at-11.31.07-PM-500x500.jpeg'
    );
    expect(safeWpContentPath(['plugins', 'woocommerce', 'assets', 'css', 'woocommerce.css'])).toBe(
      'wp-content/plugins/woocommerce/assets/css/woocommerce.css'
    );
  });

  it('supplies the prefix itself, so no caller can name a path outside it', () => {
    // Whatever arrives, the resolved path is under /wp-content/ — including the
    // interesting cases where the caller names somewhere else entirely.
    for (const segments of [
      ['wp-admin', 'admin.php'],
      ['wp-json', 'wp', 'v2', 'users'],
      ['a%2e%2e%2fb.jpg'],
      ['uploads', 'x.jpg?a=b'],
      ['uploads', 'x.jpg#frag'],
    ]) {
      const resolved = resolvedPathname(segments);
      expect(resolved, segments.join('/')).not.toBeNull();
      expect(resolved!.startsWith('/wp-content/'), segments.join('/')).toBe(true);
      expect(resolved, segments.join('/')).not.toContain('..');
    }
  });

  it('refuses a traversal segment outright', () => {
    expect(safeWpContentPath(['uploads', '..', '..', 'wp-config.php'])).toBeNull();
    expect(safeWpContentPath(['..', 'wp-content', 'uploads', 'x.jpg'])).toBeNull();
    expect(safeWpContentPath(['uploads', '.', 'x.jpg'])).toBeNull();
    expect(safeWpContentPath([])).toBeNull();
    expect(safeWpContentPath([''])).toBeNull();
    // A segment carrying a decoded separator, which the router never produces.
    expect(safeWpContentPath(['../..', 'wp-config.php'])).toBeNull();
    expect(safeWpContentPath(['uploads', 'a/../b.jpg'])).toBeNull();
  });

  it('neutralises the characters that would be re-parsed as structure', () => {
    // A `?` inside a segment must not become a query string, and a `#` must not
    // become a fragment — encoding is what makes that true rather than a guess
    // about which characters WordPress allows.
    expect(safeWpContentPath(['uploads', 'x.jpg?a=b'])).toBe('wp-content/uploads/x.jpg%3Fa%3Db');
    expect(safeWpContentPath(['uploads', 'x.jpg#frag'])).toBe('wp-content/uploads/x.jpg%23frag');
    expect(safeWpContentPath(['uploads', 'x.jpg\\..\\wp-config.php'])).toBeNull();
    expect(safeWpContentPath(['uploads', 'x.jpg\u0000.php'])).toBeNull();
  });
});

describe('GET /wp-content/*', () => {
  it('streams the file from the configured backend, not from the request origin', async () => {
    const response = await call(GET, '/wp-content/uploads/2022/08/logo.png');

    expect(calls).toHaveLength(1);
    // The whole point: the apex is where the *browser* asked, the backend is
    // where the file is. Pre-cutover these are different hosts; post-cutover the
    // difference is what stops the Worker looping into itself.
    expect(calls[0].url).toBe(`${BACKEND}/wp-content/uploads/2022/08/logo.png`);
    expect(calls[0].url).not.toContain(APPEX);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/jpeg');
    expect(await response.text()).toBe('image-bytes');
  });

  it('keeps the cache-busting query string', async () => {
    await call(GET, '/wp-content/uploads/2026/10/rock.webp?ver=2');
    expect(calls[0].url).toBe(`${BACKEND}/wp-content/uploads/2026/10/rock.webp?ver=2`);
  });

  it('forwards validators and range, and nothing that carries a session', async () => {
    await call(GET, '/wp-content/uploads/x.jpg', {
      headers: { 'if-none-match': 'W/"abc"', range: 'bytes=0-99', cookie: 'PHPSESSID=secret' },
    });

    expect(calls[0].headers['if-none-match']).toBe('W/"abc"');
    expect(calls[0].headers.range).toBe('bytes=0-99');
    expect(calls[0].headers.cookie).toBeUndefined();
  });

  it('never hands the shopping domain a WordPress cookie', async () => {
    nextUpstream = {
      status: 200,
      body: 'bytes',
      headers: { 'content-type': 'image/png', 'set-cookie': 'wordpress_logged_in=abc; Path=/' },
    };
    const response = await call(GET, '/wp-content/uploads/x.png');
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('inherits the upstream cache policy, and supplies one when it is absent', async () => {
    nextUpstream = { status: 200, body: 'b', headers: { 'content-type': 'image/png', 'cache-control': 'max-age=60' } };
    expect((await call(GET, '/wp-content/uploads/a.png')).headers.get('cache-control')).toBe('max-age=60');

    nextUpstream = { status: 200, body: 'b', headers: { 'content-type': 'image/png' } };
    expect((await call(GET, '/wp-content/uploads/b.png')).headers.get('cache-control')).toContain('max-age=');
  });

  it('passes a 304 straight back', async () => {
    nextUpstream = { status: 304, body: null, headers: { etag: 'W/"abc"' } };
    const response = await call(GET, '/wp-content/uploads/x.jpg');
    expect(response.status).toBe(304);
    expect(calls).toHaveLength(1);
  });

  it('turns a redirect into a 404 instead of following it', async () => {
    nextUpstream = { status: 301, body: null, headers: { location: `${APPEX}/wp-content/uploads/x.jpg` } };
    const response = await call(GET, '/wp-content/uploads/x.jpg');

    // Exactly one request: had the redirect been followed there would be a
    // second, and on cutover day that second request is the Worker's own URL.
    expect(calls).toHaveLength(1);
    expect(calls[0].redirect).toBe('manual');
    expect(response.status).toBe(404);
  });

  it('reports a missing file as a 404 and an unreachable backend as a 502', async () => {
    nextUpstream = { status: 404, body: 'nope' };
    expect((await call(GET, '/wp-content/uploads/missing.jpg')).status).toBe(404);

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNREFUSED');
      })
    );
    expect((await call(GET, '/wp-content/uploads/x.jpg')).status).toBe(502);
  });

  it('refuses a traversal path without making any request at all', async () => {
    const response = await call(GET, '/wp-content/../../wp-config.php');
    expect(response.status).toBe(404);
    expect(calls).toHaveLength(0);
  });

  it('is inert when no backend is configured', async () => {
    mockBackendConfig.wordpressBaseUrl = '';
    const response = await call(GET, '/wp-content/uploads/x.jpg');
    expect(response.status).toBe(404);
    expect(calls).toHaveLength(0);
  });
});

describe('HEAD /wp-content/*', () => {
  it('asks upstream for headers only and returns no body', async () => {
    const response = await call(HEAD, '/wp-content/uploads/2022/08/logo.png');
    expect(calls[0].method).toBe('HEAD');
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('');
  });
});
