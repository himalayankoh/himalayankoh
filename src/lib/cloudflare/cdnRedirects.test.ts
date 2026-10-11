import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { preserveCdnStageRedirects } from './cdnRedirects';

const adapterPath = `${process.cwd()}/node_modules/@vinext/cloudflare/dist/cache/cdn-adapter.worker.js`;
const installedAdapter = readFileSync(adapterPath, 'utf8');

function transform(code: string, id = adapterPath): { code: string } | null {
  const hook = preserveCdnStageRedirects().transform;
  if (typeof hook !== 'function') throw new Error('Missing transform');
  return hook.call({} as never, code, id) as { code: string } | null;
}

// Execute the installed adapter in workerd, with only its app-stage imports
// replaced by a disposable OAuth fixture. No credentials or live API calls.
function fixture(adapter: string) {
  return `
const VINEXT_CDN_BUILD_ID_HEADER = 'X-Vinext-Build-Id';
const getVinextCdnBuildIdentity = () => 'fixture-build';
const NEXTJS_CACHE_HEADER = 'x-nextjs-cache';
const VINEXT_CACHE_HEADER = 'x-vinext-cache';
const VINEXT_PRERENDER_READINESS_PATH = '/fixture-readiness';
const VINEXT_RSC_VARY_HEADER = 'rsc';
const isNonCacheableCacheControl = value => /no-store/.test(value);
let exchanges = 0;
const loadVinextRequestStage = async () => ({
  handleRequestStage: (request, env, context, dispatch) =>
    dispatch(request, { fixture: true }, { cache: 'bypass' })
});
const loadVinextResponseStage = async () => ({
  handleResponseStage: async request => {
    if (request.method === 'POST') return new Response(await request.text(), { status: 200 });
    exchanges++;
    if (exchanges > 1) return Response.json({ error: 'invalid_grant' }, { status: 502 });
    return new Response(null, { status: 307, headers: {
      Location: 'https://fixture.invalid/admin/settings?google=connected',
      'Set-Cookie': '__Secure-hk-google-oauth=; Path=/api/admin/google-auth/callback; Max-Age=0; Secure; HttpOnly',
      'Cache-Control': 'no-store'
    }});
  }
});
${adapter.replace(/^import .* from "(?!cloudflare:workers)[^"]+";\r?\n/gm, '')}
const originalFetch = cdn_adapter_worker_default.fetch;
cdn_adapter_worker_default.fetch = (request, env, ctx) => {
  if (new URL(request.url).pathname === '/probe') return Response.json({ exchanges });
  // Reproduce the redirect-following request observed at the live gateway.
  return originalFetch(new Request(request, { redirect: 'follow' }), env, ctx);
};
`;
}

async function run(adapter: string, post = false) {
  const runtimeModule = 'miniflare';
  const { Miniflare } = await import(runtimeModule);
  const mf = new Miniflare({ workers: [{ config: {
    name: 'redirect-fixture', type: 'worker', compatibilityDate: '2026-09-18',
    manifest: { mainModule: 'fixture.js', modules: { 'fixture.js': { type: 'esm', contents: fixture(adapter) } } },
  } }] });
  try {
    const response = await mf.dispatchFetch('https://fixture.invalid/api/admin/google-auth/callback?code=fixture', {
      redirect: 'manual', ...(post ? { method: 'POST', body: 'fixture-body' } : {}),
    });
    const proof = { status: response.status, location: response.headers.get('location'), cookie: response.headers.get('set-cookie'), body: await response.text() };
    const probe = await mf.dispatchFetch('https://fixture.invalid/probe');
    return { ...proof, exchanges: (await probe.json() as { exchanges: number }).exchanges };
  } finally { await mf.dispose(); }
}

describe('Cloudflare response-stage redirects', () => {
  it('reproduces the installed adapter redeeming a code again after following its success redirect', async () => {
    const result = await run(installedAdapter);
    expect(result.status).toBe(502);
    expect(result.exchanges).toBe(2);
    expect(result.cookie).toBeNull();
  }, 30_000);
  it('returns the success redirect and cookie without a second exchange', async () => {
    const result = await run(transform(installedAdapter)!.code);
    expect(result.status).toBe(307);
    expect(result.location).toBe('https://fixture.invalid/admin/settings?google=connected');
    expect(result.cookie).toContain('Max-Age=0');
    expect(result.exchanges).toBe(1);
  }, 30_000);
  it('preserves a POST body through the response binding', async () => {
    const result = await run(transform(installedAdapter)!.code, true);
    expect(result.status).toBe(200);
    expect(result.body).toBe('fixture-body');
  }, 30_000);
  it('leaves unrelated modules untouched and refuses an unreviewed adapter change', () => {
    expect(transform(installedAdapter, '/other/worker.js')).toBeNull();
    expect(() => transform(installedAdapter.replace('binding.fetch(entrypointRequest)', 'binding.fetch(changedRequest)'))).toThrow('adapter changed');
  });
});
