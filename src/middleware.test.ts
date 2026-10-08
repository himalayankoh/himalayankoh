import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it } from 'vitest';
import { config, middleware } from './middleware';

/**
 * The edge rules, exercised on real URLs.
 *
 * These cases are the measured leaks, not invented ones: each redirect below
 * stands for a URL that, on the running build, answered 200 and repeated an
 * animal-product term back into its own raw HTML before this rule existed.
 */

function run(url: string) {
  const response = middleware(new NextRequest(new URL(url, 'https://himalayankoh.com')));
  const rewrite = response.headers.get('x-middleware-rewrite');
  return {
    passesThrough: response.headers.get('x-middleware-next') === '1',
    status: response.status,
    location: response.headers.get('location'),
    /** The internal path a rewrite answers on, or null when nothing was rewritten. */
    rewriteTo: rewrite ? new URL(rewrite).pathname : null,
    /** The query the rewritten request kept, so the browser URL is unchanged. */
    rewriteSearch: rewrite ? new URL(rewrite).search : null,
  };
}

describe('middleware — content URLs that name something off-niche', () => {
  it('leaves a product URL to the route that resolves the product', () => {
    // A product slug is no longer judged by its text at the edge. The owner can
    // approve an animal-named product from the console (a fact no URL rule can
    // know), so the decision moved to the PDP: it withholds a record and redirects
    // its URL (an empty-bodied 308, so the slug is still never serialised), and
    // 404s a slug that was never a product.
    for (const url of ['/products/salt-licks-for-horses', '/products/salt-block-for-deer', '/products/horse%2Dsalt', '/products/salt-licks']) {
      expect(run(url).passesThrough, url).toBe(true);
    }
  });

  it('decodes the segment before judging it', () => {
    expect(run('/blog/horse%2Dsalt').status).toBe(308);
  });

  it('retires a livestock article URL rather than rendering its slug', () => {
    expect(run('/blog/why-do-dairy-cows-need-trace-minerals')).toEqual({
      passesThrough: false,
      status: 308,
      location: 'https://himalayankoh.com/blog',
      rewriteTo: null,
      rewriteSearch: null,
    });
  });

  it('leaves real product and article URLs alone', () => {
    expect(run('/products/himalayan-koh-edible-salt-grain').passesThrough).toBe(true);
    expect(run('/blog/himalayan-pink-salt-vs-white-salt-farmers').passesThrough).toBe(true);
  });

  it('does not touch routes that carry session or payment parameters', () => {
    for (const url of ['/checkout?token=abc', '/track?order=42', '/admin?search=horses', '/account']) {
      expect(run(url).passesThrough).toBe(true);
    }
  });
});

describe('middleware — browse query strings', () => {
  it('drops a search term that names an animal product', () => {
    expect(run('/products?search=horses').location).toBe('https://himalayankoh.com/products');
    expect(run('/products?search=livestock').status).toBe(308);
  });

  it('keeps the rest of the request while dropping the offending filter', () => {
    expect(run('/products?search=cat&category=bulk').location).toBe(
      'https://himalayankoh.com/products?category=bulk'
    );
  });

  it('drops a retired shelf value', () => {
    expect(run('/products?category=salt-lick-horses').location).toBe(
      'https://himalayankoh.com/products'
    );
    expect(run('/products?category=animal-feed').status).toBe(308);
  });

  it('normalises a live shelf addressed with padding or different casing', () => {
    expect(run('/products?category=Bulk').location).toBe('https://himalayankoh.com/products?category=bulk');
  });

  it('keeps a category slug the edge does not know, so a new WooCommerce category works', () => {
    // The shop's categories are built from its products, and the edge has no
    // catalogue — so a well-formed slug is passed through and the page resolves it
    // against the products it is showing.
    const res = run('/products?category=gift-sets-and-samplers');
    expect(res.passesThrough).toBe(false);
    expect(res.rewriteTo).toBe('/products/shelf/gift-sets-and-samplers');
    expect(res.rewriteSearch).toBe('?category=gift-sets-and-samplers');
  });

  it('passes the bare catalogue through untouched, so it stays prerenderable', () => {
    // `/products` is the page that must remain free of `searchParams`: it is
    // prerendered and edge-cached, and any query string is answered by the shelf
    // route below instead. See src/app/(main)/products/page.tsx.
    const bare = run('/products');
    expect(bare.passesThrough).toBe(true);
    expect(bare.rewriteTo).toBe(null);
  });

  it('answers a query-bearing catalogue request on the shelf route, without changing the URL', () => {
    // A rewrite, not a redirect: the shopper's address bar keeps
    // `/products?category=bulk`, which is the URL the canonical names, while the
    // shelf route renders the per-shelf title and breadcrumb.
    const shelf = run('/products?category=bulk');
    expect(shelf.passesThrough).toBe(false);
    expect(shelf.status).toBe(200);
    expect(shelf.rewriteTo).toBe('/products/shelf/bulk');
    // The query rides along, so the client still reads the shelf off the URL it
    // was given and the address bar is untouched.
    expect(shelf.rewriteSearch).toBe('?category=bulk');

    // Anything else — a search, a sort, a page — is the whole catalogue under the
    // plain `/products` metadata, so it lands on `all` rather than creating one
    // edge cache entry per term.
    expect(run('/products?page=2&sort=price').rewriteTo).toBe('/products/shelf/all');
    expect(run('/products?search=salt').rewriteTo).toBe('/products/shelf/all');
  });

  it('applies the same rule to the blog index', () => {
    expect(run('/blog?search=cows').location).toBe('https://himalayankoh.com/blog');
    expect(run('/blog?page=2').passesThrough).toBe(true);
  });
});
/* ------------------------------------------------------------------ */
/* The pre-cutover access gate                                        */
/* ------------------------------------------------------------------ */

/**
 * The gate as it is actually enforced. `previewAccess.ts` owns the judgement and has its
 * own unit tests; this section proves the middleware wires it to real requests and adds the
 * two behaviours the judgement cannot express on its own — the cookie exchange, and leaving
 * everything untouched when the gate is off.
 *
 * Every case above this section runs on a production host and no token, which is why the
 * gate does not alter any of them. That is worth stating rather than leaving implicit: it is
 * the property the cutover depends on.
 */

const GATE_TOKEN = 'preview-token-0123456789abcdef';
const GATE_HOST = 'https://himalayan-koh-ecommerce-prod.himalayankoh-pk.workers.dev';

function gateRequest(url: string, headers: Record<string, string> = {}) {
  // `NextRequest` does not synthesise a Host header, and the gate keys on it. A real request
  // always carries one, so the helper supplies it rather than letting every gated case pass
  // for the accidental reason of a missing host.
  return new NextRequest(url, { headers: { host: new URL(url).host, ...headers } });
}

describe('middleware — the pre-cutover access gate is off where it must be', () => {
  it('serves the storefront normally when no token is configured', () => {
    const response = middleware(gateRequest(`${GATE_HOST}/products`));
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });

  it('does not touch an API route when no token is configured', () => {
    const response = middleware(gateRequest(`${GATE_HOST}/api/shippo/rates`));
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });
});

describe('middleware — the pre-cutover access gate', () => {
  afterEach(() => {
    delete process.env.PREVIEW_ACCESS_TOKEN;
    delete process.env.NEXT_PHASE;
  });

  function withToken(url: string, headers: Record<string, string> = {}) {
    process.env.PREVIEW_ACCESS_TOKEN = GATE_TOKEN;
    return middleware(gateRequest(url, headers));
  }

  it('refuses an unauthenticated page, and the refusal leaks nothing', async () => {
    const response = withToken(`${GATE_HOST}/products`);

    expect(response.status).toBe(401);
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('www-authenticate')).toBe('Bearer');

    const body = await response.text();
    expect(body).not.toContain(GATE_TOKEN);
    expect(body).not.toContain('workers.dev');
  });

  it('refuses an unauthenticated API request too — that is where the credentials are', () => {
    expect(withToken(`${GATE_HOST}/api/shippo/rates`).status).toBe(401);
    expect(withToken(`${GATE_HOST}/api/version`).status).toBe(401);
  });

  it('admits a bearer token, which is what a script or a probe sends', () => {
    const response = withToken(`${GATE_HOST}/api/version`, { authorization: `Bearer ${GATE_TOKEN}` });
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });

  it('exchanges a correct ?hk_preview= for a cookie and redirects without the parameter', () => {
    const response = withToken(`${GATE_HOST}/products?hk_preview=${GATE_TOKEN}`);

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe(`${GATE_HOST}/products`);

    const cookie = response.headers.get('set-cookie') || '';
    expect(cookie).toContain('hk_preview=');
    expect(cookie.toLowerCase()).toContain('httponly');
    expect(cookie.toLowerCase()).toContain('secure');
    expect(cookie.toLowerCase()).toContain('samesite=lax');
  });

  it('admits the cookie the exchange just set, so the browser is not asked again', () => {
    const response = withToken(`${GATE_HOST}/products`, { cookie: `hk_preview=${GATE_TOKEN}` });
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });

  it('refuses a wrong or empty ?hk_preview= instead of redirecting on it', () => {
    expect(withToken(`${GATE_HOST}/products?hk_preview=wrong`).status).toBe(401);
    expect(withToken(`${GATE_HOST}/products?hk_preview=`).status).toBe(401);
    expect(withToken(`${GATE_HOST}/products?hk_preview=${GATE_TOKEN.slice(0, -1)}`).status).toBe(401);
  });

  it('leaves the production hosts open, which is what the cutover depends on', () => {
    for (const host of ['himalayankoh.com', 'www.himalayankoh.com']) {
      const response = withToken(`https://${host}/products`);
      expect(response.headers.get('x-middleware-next'), host).toBe('1');
    }
  });

  it('keeps the URL rules working for an authenticated request', () => {
    // The gate must not have replaced the normalisation it runs in front of.
    const response = withToken(`${GATE_HOST}/blog/why-do-dairy-cows-need-trace-minerals`, {
      authorization: `Bearer ${GATE_TOKEN}`,
    });
    expect(response.status).toBe(308);
  });

});

describe('middleware — the gate stays out of the build’s and the developer’s way', () => {
  afterEach(() => {
    delete process.env.PREVIEW_ACCESS_TOKEN;
    delete process.env.NEXT_PHASE;
  });

  it('is inert for a request with no host — which is how a build reaches it', () => {
    process.env.PREVIEW_ACCESS_TOKEN = GATE_TOKEN;
    // No `host` header at all. This is the shape `next build` uses to prerender
    // `/_not-found` through the middleware, and gating it failed the build with an opaque
    // webpack-runtime `TypeError` — measured, then fixed here.
    const response = middleware(new NextRequest(`${GATE_HOST}/products`));
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });

  it('is inert during a production build, so a prerender is never gated', () => {
    process.env.PREVIEW_ACCESS_TOKEN = GATE_TOKEN;
    process.env.NEXT_PHASE = 'phase-production-build';
    const response = middleware(gateRequest(`${GATE_HOST}/products`));
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });

  it('is inert on loopback, so a developer holding the deploy token can still run next dev', () => {
    process.env.PREVIEW_ACCESS_TOKEN = GATE_TOKEN;
    for (const url of ['http://localhost:3000/products', 'http://127.0.0.1:8787/api/version']) {
      const response = middleware(new NextRequest(url, { headers: { host: new URL(url).host } }));
      expect(response.headers.get('x-middleware-next'), `expected ${url} to be served`).toBe('1');
    }
  });

  it('and yet a real public host with no token is still refused', () => {
    // The three exemptions above must not add up to a bypass: this is the case the gate is for.
    process.env.PREVIEW_ACCESS_TOKEN = GATE_TOKEN;
    expect(middleware(gateRequest(`${GATE_HOST}/products`)).status).toBe(401);
  });
});

describe('middleware — the matcher', () => {
  it('covers every route, not only the two browse paths it used to', () => {
    const [pattern] = config.matcher;
    expect(pattern).toBe('/((?!_next/static|_next/image|favicon.ico).*)');
    // The gate's own assets can never be behind the gate, or a 401 renders blank.
    for (const asset of ['_next/static', '_next/image', 'favicon.ico']) expect(pattern).toContain(asset);
  });
});
