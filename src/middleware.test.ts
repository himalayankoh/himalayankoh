import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { middleware } from './middleware';

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
  it('retires a livestock product slug instead of echoing it', () => {
    expect(run('/products/salt-licks-for-horses')).toEqual({
      passesThrough: false,
      status: 308,
      location: 'https://himalayankoh.com/products',
      rewriteTo: null,
      rewriteSearch: null,
    });
    expect(run('/products/salt-block-for-deer').status).toBe(308);
  });

  it("serves the shop's own Salt Licks line rather than retiring it", () => {
    // 'lick'/'licks' used to be denylist terms, which retired the URL of a product
    // the owner sells. The animal-feed trade is still refused, because those
    // records name their animal — so the word alone must not cost a real page.
    expect(run('/products/salt-licks').status).toBe(200);
    expect(run('/products/salt%2Dlicks').status).toBe(200);
  });

  it('decodes the segment before judging it', () => {
    expect(run('/products/horse%2Dsalt').status).toBe(308);
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
