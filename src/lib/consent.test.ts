import { afterEach, describe, expect, it, vi } from 'vitest';
import { syncConsentMode } from './consent';

afterEach(() => vi.unstubAllGlobals());

describe('analytics consent', () => {
  it('updates analytics without granting or overwriting CMP advertising choices', () => {
    const gtag = vi.fn();
    vi.stubGlobal('window', { gtag, dataLayer: [] });
    syncConsentMode('accepted');
    expect(gtag).toHaveBeenCalledWith('consent', 'update', { analytics_storage: 'granted' });
    syncConsentMode('declined');
    expect(gtag).toHaveBeenLastCalledWith('consent', 'update', { analytics_storage: 'denied' });
  });
});
