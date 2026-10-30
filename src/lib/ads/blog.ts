import { isProductionHost } from '@/lib/seo/indexing';
import { placementConfigured, type MarketingConfig } from '@/lib/marketing';

export interface AdvertisingConsentData {
  listenerId?: number;
  cmpStatus?: string;
  eventStatus?: string;
  gdprApplies?: boolean;
  purpose?: { consents?: Record<number, boolean> };
  vendor?: { consents?: Record<number, boolean> };
}

type TcfApi = (command: string, version: number,
  callback: (data: AdvertisingConsentData, success: boolean) => void, listenerId?: number) => void;

/** No CMP response is not consent; the analytics banner never grants ads. */
export function advertisingConsentReady(data: AdvertisingConsentData, success: boolean): boolean {
  if (!success || data.cmpStatus !== 'loaded') return false;
  if (data.eventStatus !== 'tcloaded' && data.eventStatus !== 'useractioncomplete') return false;
  return data.gdprApplies === false || (data.gdprApplies === true
    && data.purpose?.consents?.[1] === true && data.vendor?.consents?.[755] === true);
}

/** Subscribe to the existing certified CMP; never manufacture an advertising choice. */
export function observeAdvertisingConsent(onChange: (ready: boolean) => void): () => void {
  let active = true;
  let api: TcfApi | undefined;
  let listenerId: number | undefined;
  let attempts = 0;
  let timer: ReturnType<typeof setInterval> | undefined;
  const attach = () => {
    const candidate = (window as unknown as { __tcfapi?: TcfApi }).__tcfapi;
    if (typeof candidate !== 'function') return;
    api = candidate;
    if (timer) clearInterval(timer);
    try {
      api('addEventListener', 2, (data, success) => {
        listenerId = data?.listenerId ?? listenerId;
        if (active) onChange(advertisingConsentReady(data ?? {}, success));
        else if (listenerId !== undefined) api?.('removeEventListener', 2, () => {}, listenerId);
      });
    } catch {
      onChange(false);
    }
  };
  onChange(false);
  attach();
  if (!api) timer = setInterval(() => {
    if (++attempts >= 120) { clearInterval(timer); return; }
    attach();
  }, 250);
  return () => {
    active = false;
    if (timer) clearInterval(timer);
    if (listenerId !== undefined) {
      try { api?.('removeEventListener', 2, () => {}, listenerId); } catch { /* Stay denied. */ }
    }
  };
}

/** Fail closed on previews, utility routes, disabled settings and invalid units. */
export function blogAdEligible(config: MarketingConfig, host: string, path: string, mobile: boolean): boolean {
  return isProductionHost(host)
    && /^\/blog\/[^/]+\/?$/.test(path)
    && path.replace(/\/$/, '') !== '/blog/write'
    && (!mobile || config.showAdsOnMobile)
    && placementConfigured(config, 'blog_after_article');
}
