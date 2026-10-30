'use client';

import { useEffect, useRef, useState } from 'react';
import { fetchGlobalConfig, loadAdSenseScript, type MarketingConfig } from '@/lib/marketing';
import { blogAdEligible, observeAdvertisingConsent } from '@/lib/ads/blog';
import { useLocation } from '@/lib/router-compat';

/** One responsive unit after a published article. Google CMP owns ad consent. */
export default function AdSlot({ className }: { className?: string }) {
  const [config, setConfig] = useState<MarketingConfig | null>(null);
  const [unfilled, setUnfilled] = useState(false);
  const [consented, setConsented] = useState(false);
  const { pathname } = useLocation();
  const unit = useRef<HTMLModElement>(null);

  useEffect(() => {
    let active = true;
    void fetchGlobalConfig().then((c) => {
      if (active && blogAdEligible(c, window.location.hostname, window.location.pathname, window.innerWidth < 768)) {
        setConfig(c);
      }
    });
    return () => { active = false; };
  }, [pathname]);

  const eligible = Boolean(config && typeof window !== 'undefined'
    && blogAdEligible(config, window.location.hostname, pathname, window.innerWidth < 768));

  useEffect(() => {
    if (!eligible) { setConsented(false); return; }
    return observeAdvertisingConsent(setConsented);
  }, [eligible]);

  useEffect(() => {
    const element = unit.current;
    if (!config || !element || !eligible || !consented) return;
    const observer = new MutationObserver(() => {
      setUnfilled(element.getAttribute('data-ad-status') === 'unfilled');
    });
    observer.observe(element, { attributes: true, attributeFilter: ['data-ad-status'] });
    if (!element.dataset.hkRequested) {
      element.dataset.hkRequested = 'true';
      try {
        loadAdSenseScript(config.adsenseClientId, true);
        const w = window as unknown as { adsbygoogle?: Array<Record<string, never>> };
        (w.adsbygoogle = w.adsbygoogle || []).push({});
      } catch {
        setUnfilled(true);
      }
    }
    return () => observer.disconnect();
  }, [config, eligible, consented]);

  if (!config || !eligible || !consented) return null;
  return (
    <aside className={className} aria-label="Advertisement" hidden={unfilled}>
      <p className="text-xs text-charcoal-light mb-2">Advertisement</p>
      <ins ref={unit} className="adsbygoogle" style={{ display: 'block' }}
        data-ad-client={config.adsenseClientId.trim()}
        data-ad-slot={config.placements.blog_after_article.slot.trim()}
        data-ad-format="auto" data-full-width-responsive="true" />
    </aside>
  );
}
