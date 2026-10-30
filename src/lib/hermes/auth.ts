/**
 * Server-side authentication for Hermes / Salman OS / n8n ingest.
 * Secrets remain server-only — never exposed to client or logs.
 */

import { timingSafeEqual } from 'node:crypto';
import { getSetting } from '@/lib/settings/serverSettings';

function safeCompare(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export async function verifyHermesAuth(
  request: Request
): Promise<{ ok: boolean; status?: number; error?: string }> {
  // Extract token from request headers
  const authHeader = request.headers.get('authorization') || '';
  let providedToken = '';

  if (authHeader.toLowerCase().startsWith('bearer ')) {
    providedToken = authHeader.slice(7).trim();
  } else {
    providedToken = (
      request.headers.get('x-hermes-token') ||
      request.headers.get('x-salman-os-token') ||
      request.headers.get('x-integration-token') ||
      ''
    ).trim();
  }

  if (!providedToken) {
    return {
      ok: false,
      status: 401,
      error: 'Authentication required. Provide Authorization: Bearer <token> or x-hermes-token header.',
    };
  }

  // Resolve valid server-side tokens
  const envHermesToken = (process.env.HERMES_INGEST_TOKEN || '').trim();
  const envSalmanToken = (process.env.SALMAN_OS_TOKEN || '').trim();

  let dbHermesToken = '';
  let dbSalmanToken = '';
  try {
    dbHermesToken = (await getSetting('hermes', 'ingest_token'))?.trim() || '';
  } catch {
    // Ignore setting fetch failure
  }
  try {
    dbSalmanToken = (await getSetting('salman_os', 'token'))?.trim() || '';
  } catch {
    // Ignore setting fetch failure
  }

  const validTokens = [envHermesToken, envSalmanToken, dbHermesToken, dbSalmanToken].filter(
    (t) => t.length > 0
  );

  if (validTokens.length === 0) {
    return {
      ok: false,
      status: 503,
      error: 'Hermes ingest token is not configured on the server.',
    };
  }

  const isMatch = validTokens.some((validToken) => safeCompare(providedToken, validToken));

  if (!isMatch) {
    return {
      ok: false,
      status: 403,
      error: 'Invalid authentication token.',
    };
  }

  return { ok: true };
}
