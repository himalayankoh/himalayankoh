import { describe, expect, it } from 'vitest';
import { adsenseEnabledForHost, adsTxtEntry, adsenseScriptSrc, hasValidPublisherId } from './config';

const CLIENT = 'ca-pub-5473713135927706';
const on = { flagEnabled: true, client: CLIENT };

describe('adsense seam', () => {
  it('is off unless the flag is explicitly true', () => {
    // The whole point of the seam: an unset or false flag means no ads anywhere,
    // including production.
    expect(adsenseEnabledForHost('himalayankoh.com')).toBe(false);
    expect(adsenseEnabledForHost('himalayankoh.com', { flagEnabled: false, client: CLIENT })).toBe(false);
  });

  it('stays off on every host that is not production, even with the flag on', () => {
    // The case that matters: the same commit deployed to staging must not serve the
    // AdSense script, or the account review inspects a staging page.
    for (const host of [
      'preview.himalayankoh.com',
      'himalayan-koh-ecommerce.8002salman.workers.dev',
      'himalayan-koh-admin-verify.vercel.app',
      'localhost:3033',
      'notpreview.himalayankoh.com',
      '',
      null,
      undefined,
    ]) {
      expect(adsenseEnabledForHost(host, on), String(host)).toBe(false);
      expect(adsenseScriptSrc(host, on), String(host)).toBeNull();
    }
  });

  it('turns on for the production hosts once the flag and ID are set', () => {
    for (const host of ['himalayankoh.com', 'www.himalayankoh.com', 'HimalayanKoh.com']) {
      expect(adsenseEnabledForHost(host, on), host).toBe(true);
    }
    expect(adsenseScriptSrc('himalayankoh.com', on)).toContain('client=ca-pub-5473713135927706');
  });

  it('refuses a publisher ID that is not an AdSense ID', () => {
    // Guards against a placeholder or a truncated paste activating the script.
    expect(hasValidPublisherId(CLIENT)).toBe(true);
    expect(hasValidPublisherId('')).toBe(false);
    expect(hasValidPublisherId('ca-pub-')).toBe(false);
    expect(hasValidPublisherId('pub-123')).toBe(false);
    expect(hasValidPublisherId('ca-pub-abc')).toBe(false);
    expect(adsenseEnabledForHost('himalayankoh.com', { flagEnabled: true, client: 'ca-pub-x' })).toBe(false);
  });

  it('emits no ads.txt entry while ads are off', () => {
    expect(adsTxtEntry('preview.himalayankoh.com')).toBeNull();
    expect(adsTxtEntry('himalayankoh.com')).toBeNull();
    expect(adsTxtEntry('himalayankoh.com')).toBeNull();
  });
});
