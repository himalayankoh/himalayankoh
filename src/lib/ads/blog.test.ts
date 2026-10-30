import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_CONFIG, type MarketingConfig } from '@/lib/marketing';
import { advertisingConsentReady, blogAdEligible, observeAdvertisingConsent } from './blog';
import { loadAdSenseScript } from '@/lib/marketing';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('advertising CMP consent', () => {
  it('fails closed until the CMP is ready and Google Purpose 1 consent exists', () => {
    const data = { cmpStatus: 'loaded', eventStatus: 'useractioncomplete', gdprApplies: true,
      purpose: { consents: { 1: true } }, vendor: { consents: { 755: true } } };
    expect(advertisingConsentReady(data, true)).toBe(true);
    expect(advertisingConsentReady(data, false)).toBe(false);
    expect(advertisingConsentReady({ ...data, eventStatus: 'cmpuishown' }, true)).toBe(false);
    expect(advertisingConsentReady({ ...data, cmpStatus: 'error' }, true)).toBe(false);
    expect(advertisingConsentReady({ ...data, purpose: { consents: { 1: false } } }, true)).toBe(false);
    expect(advertisingConsentReady({ ...data, vendor: { consents: { 755: false } } }, true)).toBe(false);
    expect(advertisingConsentReady({}, true)).toBe(false);
    expect(advertisingConsentReady({ cmpStatus: 'loaded', eventStatus: 'tcloaded', gdprApplies: false }, true)).toBe(true);
  });

  it('handles delayed CMP setup, consent withdrawal, and listener cleanup', () => {
    vi.useFakeTimers();
    const browser: { __tcfapi?: ReturnType<typeof vi.fn> } = {};
    vi.stubGlobal('window', browser);
    const change = vi.fn();
    const stop = observeAdvertisingConsent(change);
    expect(change).toHaveBeenLastCalledWith(false);
    const api = vi.fn(); browser.__tcfapi = api;
    vi.advanceTimersByTime(250);
    const callback = api.mock.calls[0][2];
    callback({ listenerId: 7, cmpStatus: 'loaded', eventStatus: 'tcloaded', gdprApplies: false }, true);
    expect(change).toHaveBeenLastCalledWith(true);
    callback({ listenerId: 7, cmpStatus: 'loaded', eventStatus: 'cmpuishown' }, true);
    expect(change).toHaveBeenLastCalledWith(false);
    stop();
    expect(api).toHaveBeenLastCalledWith('removeEventListener', 2, expect.any(Function), 7);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('never loads the ad tag from analytics acceptance or without advertising consent', () => {
    const create = vi.fn();
    vi.stubGlobal('document', { createElement: create });
    loadAdSenseScript(enabled.adsenseClientId);
    loadAdSenseScript(enabled.adsenseClientId, false);
    expect(create).not.toHaveBeenCalled();
  });
});

const enabled: MarketingConfig = {
  ...DEFAULT_CONFIG, adsenseEnabled: true, manualAdsEnabled: true,
  placements: { ...DEFAULT_CONFIG.placements, blog_after_article: { enabled: true, slot: '7488152864' } },
};

describe('blog advertising admission', () => {
  it('requires every configured gate and a real numeric unit', () => {
    expect(blogAdEligible(enabled, 'himalayankoh.com', '/blog/cooking', false)).toBe(true);
    for (const patch of [
      { adsenseEnabled: false }, { manualAdsEnabled: false }, { adsenseClientId: 'bad' },
      { placements: { ...enabled.placements, blog_after_article: { enabled: false, slot: '7488152864' } } },
      { placements: { ...enabled.placements, blog_after_article: { enabled: true, slot: '<script>' } } },
    ]) expect(blogAdEligible({ ...enabled, ...patch }, 'himalayankoh.com', '/blog/cooking', false)).toBe(false);
  });

  it('never admits preview hosts, checkout, admin, index or editor', () => {
    for (const host of ['localhost:3000', 'preview.himalayankoh.com', 'fake.himalayankoh.com', 'hk.workers.dev']) {
      expect(blogAdEligible(enabled, host, '/blog/cooking', false)).toBe(false);
    }
    for (const path of ['/', '/blog', '/blog/write', '/blog/write/', '/checkout', '/cart', '/admin/blog', '/products/salt']) {
      expect(blogAdEligible(enabled, 'himalayankoh.com', path, false)).toBe(false);
    }
  });

  it('respects the mobile switch', () => {
    expect(blogAdEligible({ ...enabled, showAdsOnMobile: false }, 'www.himalayankoh.com', '/blog/cooking', true)).toBe(false);
    expect(blogAdEligible(enabled, 'www.himalayankoh.com', '/blog/cooking/', true)).toBe(true);
  });
});
