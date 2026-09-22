/**
 * A stubbed WordPress REST server for tests.
 *
 * Deliberately not a `vi.mock` of the app's WordPress client. Mocking the client
 * would skip the code most likely to be wrong — URL construction, the Basic auth
 * header, query serialisation, `x-wp-total` handling and the shape of the error
 * it raises. So this stubs the one thing the client cannot fake: the global
 * `fetch`. Everything above it is the real implementation.
 *
 * Usage:
 *   const wp = createWordPressStub([{ path: '/leados/v1/leads', body: { leads: [] } }]);
 *   globalThis.fetch = wp.fetch;
 *
 * It records every request so a test can assert what was actually sent, which is
 * usually more interesting than what came back.
 */

export interface WordPressStubCall {
  method: string;
  /** Pathname after `/wp-json`, e.g. `/leados/v1/leads`. */
  path: string;
  /** Path including the `/wp-json` root, for asserting the origin was right. */
  url: string;
  query: URLSearchParams;
  headers: Record<string, string>;
  /** Parsed JSON body, when one was sent. */
  body: unknown;
}

export interface WordPressStubRoute {
  /** Defaults to GET. A route answers every method when omitted. */
  method?: string;
  path: string | RegExp;
  status?: number;
  /** JSON body. Ignored when `raw` is set. */
  body?: unknown;
  /** Raw body, for the HTML/PHP-fatal cases the client has to detect. */
  raw?: string;
  /** Extra response headers, e.g. `x-wp-total`. */
  headers?: Record<string, string>;
}

export interface WordPressStub {
  fetch: (input: unknown, init?: unknown) => Promise<Response>;
  calls: WordPressStubCall[];
  /** Requests matching a path (and optionally a method). */
  callsTo(path: string | RegExp, method?: string): WordPressStubCall[];
  reset(): void;
}

function pathMatches(route: string | RegExp, path: string): boolean {
  return typeof route === 'string' ? route === path : route.test(path);
}

export function createWordPressStub(routes: WordPressStubRoute[]): WordPressStub {
  const calls: WordPressStubCall[] = [];

  const stub: WordPressStub = {
    calls,

    callsTo(path, method) {
      return calls.filter(
        (call) =>
          pathMatches(path, call.path) &&
          (method === undefined || call.method === method.toUpperCase())
      );
    },

    reset() {
      calls.length = 0;
    },

    async fetch(input, init) {
      const url = new URL(String(input));
      const requestInit = (init ?? {}) as {
        method?: string;
        headers?: Record<string, string>;
        body?: string;
      };

      // WordPress serves the REST API under `/wp-json`; anything before it is the
      // site's install path (e.g. `/staging`), which the client must keep.
      const marker = '/wp-json';
      const markerIndex = url.pathname.indexOf(marker);
      const path = markerIndex === -1 ? url.pathname : url.pathname.slice(markerIndex + marker.length);

      let parsedBody: unknown = undefined;
      if (typeof requestInit.body === 'string') {
        try {
          parsedBody = JSON.parse(requestInit.body);
        } catch {
          parsedBody = requestInit.body;
        }
      }

      calls.push({
        method: (requestInit.method || 'GET').toUpperCase(),
        path,
        url: url.toString(),
        query: url.searchParams,
        headers: requestInit.headers || {},
        body: parsedBody,
      });

      const route = routes.find(
        (candidate) =>
          pathMatches(candidate.path, path) &&
          (candidate.method === undefined || candidate.method.toUpperCase() === (requestInit.method || 'GET').toUpperCase())
      );

      if (!route) {
        // WordPress's own "no route" answer, which is what an inactive plugin
        // looks like from the app's side.
        return new Response(
          JSON.stringify({
            code: 'rest_no_route',
            message: 'No route was found matching the URL and request method.',
            data: { status: 404 },
          }),
          { status: 404, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...route.headers,
      };
      const body =
        route.raw !== undefined ? route.raw : JSON.stringify(route.body ?? {});

      return new Response(body, { status: route.status ?? 200, headers });
    },
  };

  return stub;
}
