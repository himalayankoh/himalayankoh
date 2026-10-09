import { describe, expect, it } from 'vitest';
import {
  assertProductionConfig,
  EXPECTED_VARS,
  readProductionOverlay,
} from '../../../scripts/assert-production-config.mjs';

function config(flags = ['nodejs_compat', 'global_fetch_strictly_public']) {
  return {
    name: 'himalayan-koh-ecommerce-prod',
    main: 'index.js',
    assets: { directory: '../client' },
    vars: { ...EXPECTED_VARS },
    compatibility_flags: flags,
  };
}

describe('production webhook probe routing', () => {
  it('accepts a Worker whose self-fetch reaches the public endpoint', () => {
    expect(assertProductionConfig(config())).toBe(true);
  });
  it('refuses a deployment that would bypass the webhook and reach WordPress', () => {
    expect(() => assertProductionConfig(config(['nodejs_compat']))).toThrow(/global_fetch_strictly_public/);
  });
  it('refuses conflicting origin routing even when the public flag is present', () => {
    expect(() => assertProductionConfig(config([
      'nodejs_compat', 'global_fetch_strictly_public', 'global_fetch_private_origin',
    ]))).toThrow(/global_fetch_private_origin/);
  });
  it('carries public routing from the production overlay into the artifact', () => {
    expect(readProductionOverlay().compatibility_flags).toContain('global_fetch_strictly_public');
  });
});
