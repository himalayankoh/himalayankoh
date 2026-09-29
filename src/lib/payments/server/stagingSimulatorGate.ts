/**
 * The server-side read of the simulator's two conditions: the switch, and the
 * origin this request reached.
 *
 * Kept apart from `../stagingSimulator` (which is pure and shared with the browser)
 * because this half reads WordPress settings and `process.env`, and a module the
 * checkout bundle imports must not do either.
 *
 * The origin it judges is `SITE_ORIGIN` — the build-time constant for *this
 * deployment* — not anything the caller sent. That is the property the whole gate
 * rests on: a production build has the production origin compiled in, so it refuses
 * every simulated payment regardless of the switch, the settings row, or the headers
 * on the request.
 */

import { getSettingsForCategory } from '@/lib/settings/serverSettings';
import { SITE_ORIGIN } from '@/lib/site/origin';
import {
  STAGING_SIMULATOR_ENV_KEY,
  STAGING_SIMULATOR_SETTING_KEY,
  decideStagingSimulator,
  type StagingSimulatorStatus,
} from '../stagingSimulator';

export interface StagingSimulatorStatusInput {
  /** The `Host` header the request arrived on, when the caller has a request. */
  requestHost?: string | null;
  /**
   * An already-read `stripe` settings row. `/api/stripe/config` has one in hand, so
   * passing it keeps that route at a single WordPress round trip.
   */
  settings?: Record<string, string | null>;
}

export async function readStagingSimulatorStatus(
  input: StagingSimulatorStatusInput = {},
): Promise<StagingSimulatorStatus> {
  const settings = input.settings ?? (await getSettingsForCategory('stripe'));

  return decideStagingSimulator({
    origin: SITE_ORIGIN,
    requestHost: input.requestHost ?? null,
    settingValue: settings[STAGING_SIMULATOR_SETTING_KEY] ?? null,
    envValue: process.env[STAGING_SIMULATOR_ENV_KEY] ?? null,
  });
}
