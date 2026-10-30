import { readFileSync, mkdtempSync, mkdirSync, cpSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('production artifact safety', () => {
  it('retains public webhook fetching, live order gates, and routing protection', () => {
    const output = execFileSync(process.execPath, ['--input-type=module', '-e', `
      import { assertProductionConfig, readProductionOverlay } from './scripts/assert-production-config.mjs';
      const config = { ...readProductionOverlay(), main: 'index.js', assets: { directory: '../client' } };
      const refusal = patch => { try { assertProductionConfig({ ...config, ...patch }); return null; } catch (e) { return e.message; } };
      console.log(JSON.stringify({ vars: config.vars, accepted: assertProductionConfig(config),
        flagError: refusal({ compatibility_flags: ['nodejs_compat'] }), routeError: refusal({ routes: ['himalayankoh.com/*'] }) }));
    `], { encoding: 'utf8' });
    const result = JSON.parse(output);
    expect(result.vars.STOREFRONT_ORDERS_PAUSED).toBe('false');
    expect(result.vars.NEXT_PUBLIC_ORDERS_PAUSED).toBe('false');
    expect(result.accepted).toBe(true);
    expect(result.flagError).toContain('global_fetch_strictly_public');
    expect(result.routeError).toContain('routes');
  });
  it('applies production flags to the actual generated artifact without losing build flags', () => {
    const root = mkdtempSync(join(tmpdir(), 'hk-artifact-test-'));
    try {
      mkdirSync(join(root, 'scripts'));
      mkdirSync(join(root, 'dist/server'), { recursive: true });
      for (const name of ['apply-production-config.mjs', 'assert-production-config.mjs', 'production-target.mjs']) cpSync(join(process.cwd(), 'scripts', name), join(root, 'scripts', name));
      cpSync(join(process.cwd(), 'wrangler.production.jsonc'), join(root, 'wrangler.production.jsonc'));
      writeFileSync(join(root, 'dist/server/wrangler.json'), JSON.stringify({ name: 'staging', main: 'index.js', assets: { directory: '../client' }, compatibility_flags: ['nodejs_compat', 'extra_build_flag'], vars: {} }));
      execFileSync(process.execPath, [join(root, 'scripts/apply-production-config.mjs')], { encoding: 'utf8' });
      const built = JSON.parse(readFileSync(join(root, 'dist/server/wrangler.json'), 'utf8'));
      expect(built.compatibility_flags).toEqual(['nodejs_compat', 'extra_build_flag', 'global_fetch_strictly_public']);
      expect(built.name).toBe('himalayan-koh-ecommerce-prod');
      expect(built.routes).toBeUndefined();
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
