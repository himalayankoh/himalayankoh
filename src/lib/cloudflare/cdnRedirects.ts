import type { Plugin } from 'vite';

/**
 * The response stage must return redirects (and Set-Cookie) to the browser.
 * Following one inside the binding keeps the original invocation props and can
 * redeem an OAuth code again while rendering its success destination.
 * Keep this workaround narrow and fail the build if the adapter changes.
 */
export function preserveCdnStageRedirects(): Plugin {
  return {
    name: 'hk-cdn-stage-redirects',
    enforce: 'pre',
    apply: 'build',
    transform(code, id) {
      if (!id.split('?')[0].replace(/\\/g, '/').endsWith('/@vinext/cloudflare/dist/cache/cdn-adapter.worker.js')) return null;
      const call = 'binding.fetch(entrypointRequest)';
      if (code.split(call).length !== 2) {
        throw new Error('Cloudflare CDN adapter changed; review response-stage redirect handling before deployment.');
      }
      return { code: code.replace(call, 'binding.fetch(entrypointRequest, { redirect: "manual" })'), map: null };
    },
  };
}
