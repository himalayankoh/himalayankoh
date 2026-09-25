import { describe, it, expect } from 'vitest';
import { assertStagingConfig } from '../../scripts/assert-staging-config.mjs';
const config = { name: 'himalayan-koh-ecommerce', vars: { NEXT_PUBLIC_SITE_URL: 'https://preview.himalayankoh.com', NEXT_PUBLIC_WORDPRESS_BASE_URL: 'https://himalayankoh.com/staging', NEXT_PUBLIC_WOOCOMMERCE_BASE_URL: 'https://himalayankoh.com/staging', NEXT_PUBLIC_DATA_SOURCE: 'woocommerce' } };
describe('staging deployment boundary', () => {
  it('accepts the staging worker and backend', () => expect(() => assertStagingConfig(config)).not.toThrow());
  it.each(['NEXT_PUBLIC_SITE_URL', 'NEXT_PUBLIC_WORDPRESS_BASE_URL', 'NEXT_PUBLIC_WOOCOMMERCE_BASE_URL'])('refuses a production %s', key => expect(() => assertStagingConfig({ ...config, vars: { ...config.vars, [key]: 'https://himalayankoh.com' } })).toThrow());
  it('refuses production routes', () => expect(() => assertStagingConfig({ ...config, routes: ['himalayankoh.com/*'] })).toThrow());
  it('refuses an alternate worker', () => expect(() => assertStagingConfig({ ...config, name: 'production' })).toThrow());
});
