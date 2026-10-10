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
    setChoice(getConsent());
    void fetchGlobalConfig().then(setConfig);
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

  if (!publicPage || !config?.gaEnabled || !GA4_ID_RE.test(config.ga4Id) || consent !== null) return null;
  const choose = (choice: ConsentChoice) => { setConsent(choice); setChoice(choice); };
  return (
    <aside aria-label="Analytics cookies" className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-xl rounded-2xl border border-gray-200 bg-white p-4 text-sm text-gray-800 shadow-xl">
      <p>Allow Google Analytics cookies to help us understand how visitors use our store?</p>
      <div className="mt-3 flex flex-wrap gap-3">
        <button onClick={() => choose('declined')} className="rounded-lg border px-4 py-2">Decline</button>
        <button onClick={() => choose('accepted')} className="rounded-lg bg-charcoal px-4 py-2 text-white">Accept analytics</button>
        <a href="/privacy" className="self-center underline">Privacy policy</a>
      </div>
    </aside>
  );
}
