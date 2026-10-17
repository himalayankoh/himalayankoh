import { describe, expect, it } from 'vitest';
import { WordPressApiError } from '@/lib/backend/wordpress';
import { toSettingReadFailure } from './serverSettings';

/**
 * "I could not ask" is not "you have not set it".
 *
 * Both a missing origin and a stalled one arrive as status 0, so the settings
 * layer has to tell them apart before any status screen repeats the answer. A
 * timeout reported as `deployment_unconfigured` is what told the owner their saved
 * Omnisend key was not saved at all.
 */
describe('toSettingReadFailure', () => {
  it('calls an empty origin a deployment problem', () => {
    const failure = toSettingReadFailure(
      new WordPressApiError({
        message: 'WordPress is not configured (WORDPRESS_BASE_URL is empty).',
        path: '/hk-storefront/v1/settings',
        status: 0,
      }),
    );

    expect(failure.kind).toBe('deployment_unconfigured');
    expect(failure.status).toBeNull();
  });

  it('calls a timeout an outage rather than a missing configuration', () => {
    const failure = toSettingReadFailure(
      new WordPressApiError({
        message: 'WordPress request timed out after 12000ms (/hk-storefront/v1/settings).',
        path: '/hk-storefront/v1/settings',
        status: 0,
      }),
    );

    expect(failure.kind).toBe('wordpress_unavailable');
    expect(failure.status).toBeNull();
    expect(failure.message).toMatch(/timed out/i);
  });

  it('keeps the origin status when the store answered with an error', () => {
    const failure = toSettingReadFailure(
      new WordPressApiError({
        message: 'WordPress returned HTTP 503 for /hk-storefront/v1/settings.',
        path: '/hk-storefront/v1/settings',
        status: 503,
      }),
    );

    expect(failure.kind).toBe('wordpress_unavailable');
    expect(failure.status).toBe(503);
  });

  it('reports a non-WordPress error as an outage, not as a missing key', () => {
    const failure = toSettingReadFailure(new TypeError('fetch failed'));

    expect(failure.kind).toBe('wordpress_unavailable');
    expect(failure.message).toBe('fetch failed');
  });
});
