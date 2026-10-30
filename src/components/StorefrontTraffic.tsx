'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocation } from '@/lib/router-compat';
import {
  captureUtm, fetchGlobalConfig, GA4_ID_RE, loadGtag, removeGtag,
  trackEvent, utmParams, type MarketingConfig,
} from '@/lib/marketing';
import { getConsent, setConsent, type ConsentChoice } from '@/lib/consent';
import { isPublicTrafficPath } from '@/services/siteEvents';

/** One recorder shared by full loads and client-side storefront navigation. */
export default function StorefrontTraffic() {
  const { pathname, search } = useLocation();
  const lastView = useRef('');
  const lastGoogleView = useRef('');
  const [config, setConfig] = useState<MarketingConfig | null>(null);
  const [consent, setChoice] = useState<ConsentChoice>(null);
  const publicPage = isPublicTrafficPath(pathname);
  useEffect(() => {
    if (!publicPage || new URLSearchParams(search).get('hk-performance') !== '1') return;
    let active = true; let stop: (() => void) | undefined;
    void import('@/lib/performance/labMetrics').then(module => { if (active) stop = module.observeLabMetrics(); });
    return () => { active = false; stop?.(); };
  }, [pathname, search, publicPage]);
  const bannerRef = useRef<HTMLElement>(null);
  const showBanner = publicPage && Boolean(config?.gaEnabled && GA4_ID_RE.test(config.ga4Id)) && consent === null;
  useEffect(() => {
    document.documentElement.dataset.consentOpen = String(showBanner);
    window.dispatchEvent(new CustomEvent('hk:consent-banner', { detail: showBanner }));
    const el = bannerRef.current;
    const reserve = () => document.documentElement.style.setProperty('--consent-space', showBanner && el ? `${el.getBoundingClientRect().height + 28}px` : '0px');
    reserve();
    const observer = el ? new ResizeObserver(reserve) : null;
    if (el) observer?.observe(el);
    return () => { observer?.disconnect(); document.documentElement.style.removeProperty('--consent-space'); delete document.documentElement.dataset.consentOpen; };
  }, [showBanner]);

  useEffect(() => {
    setChoice(getConsent());
    void fetchGlobalConfig().then(setConfig);
    const refresh = () => setChoice(getConsent());
    window.addEventListener('hk:consent-choice', refresh);
    window.addEventListener('storage', refresh);
    return () => { window.removeEventListener('hk:consent-choice', refresh); window.removeEventListener('storage', refresh); };
  }, []);

  useEffect(() => {
    if (!publicPage) {
      lastView.current = '';
      return;
    }
    // The router shim hydrates search params separately. Read the actual URL so
    // hydration/StrictMode cannot count the same arrival twice.
    const key = window.location.pathname + window.location.search;
    if (lastView.current === key) return;
    lastView.current = key;
    captureUtm();
    trackEvent('page_view', { ...utmParams(), first_party_only: true });
  }, [pathname, search, publicPage]);

  useEffect(() => {
    const enabled = publicPage && config?.gaEnabled && GA4_ID_RE.test(config.ga4Id) && consent === 'accepted';
    if (!enabled) {
      removeGtag();
      lastGoogleView.current = '';
      return;
    }
    loadGtag(config.ga4Id);
    const key = window.location.pathname + window.location.search;
    if (lastGoogleView.current === key) return;
    lastGoogleView.current = key;
    // Query strings can contain checkout tokens or private form data.
    const tag = (window as unknown as { gtag?: (...args: unknown[]) => void }).gtag;
    tag?.('event', 'page_view', {
      page_location: window.location.origin + pathname,
      page_title: document.title,
      ...utmParams(),
    });
  }, [pathname, search, publicPage, config, consent]);

  if (!showBanner) return null;
  const choose = (choice: ConsentChoice) => { setConsent(choice); setChoice(choice); };
  return (
    <aside ref={bannerRef} aria-label="Analytics cookies" className="fixed bottom-[calc(0.75rem+env(safe-area-inset-bottom))] left-3 right-3 z-[85] mx-auto max-w-xl rounded-2xl border border-himalayan-line bg-white px-3 pb-3 text-sm text-charcoal shadow-xl">
      <div className="flex items-center justify-between gap-3">
        <p className="font-semibold">Allow Google Analytics?</p>
        <a href="/privacy" className="min-h-11 inline-flex items-center text-xs underline shrink-0">Privacy policy</a>
      </div>
      <p className="text-xs mb-2 text-charcoal-light">Optional cookies help us understand store visits.</p>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => choose('declined')} className="min-h-11 rounded-lg border border-himalayan-line px-3 font-semibold">Decline</button>
        <button onClick={() => choose('accepted')} className="min-h-11 rounded-lg bg-charcoal px-3 font-semibold text-white">Accept analytics</button>
      </div>
    </aside>
  );
}
