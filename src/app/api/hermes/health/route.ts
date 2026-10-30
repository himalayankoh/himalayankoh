/**
 * GET /api/hermes/health
 *
 * Safe readiness and integration contract endpoint for Hermes, Salman OS, and n8n.
 * Returns readiness and contract specification without exposing any secrets.
 */

import { NextResponse } from 'next/server';
import { getSetting } from '@/lib/settings/serverSettings';
import { getDeploymentEnvironment } from '@/lib/site/deploymentEnvironment';

export const dynamic = 'force-dynamic';

export async function GET() {
  const envHermesToken = (process.env.HERMES_INGEST_TOKEN || '').trim();
  const envSalmanToken = (process.env.SALMAN_OS_TOKEN || '').trim();

  let dbHermesToken = '';
  let dbSalmanToken = '';
  let projectSlug = (process.env.SALMAN_OS_PROJECT_SLUG || '').trim();

  try {
    dbHermesToken = (await getSetting('hermes', 'ingest_token'))?.trim() || '';
  } catch {
    // Ignore
  }
  try {
    dbSalmanToken = (await getSetting('salman_os', 'token'))?.trim() || '';
  } catch {
    // Ignore
  }
  try {
    if (!projectSlug) {
      projectSlug = (await getSetting('salman_os', 'project_slug'))?.trim() || 'himalayan-koh';
    }
  } catch {
    projectSlug = 'himalayan-koh';
  }

  const hasHermesAuth = Boolean(envHermesToken || dbHermesToken);
  const hasSalmanAuth = Boolean(envSalmanToken || dbSalmanToken);

  const ingestReady = hasHermesAuth || hasSalmanAuth;

  return NextResponse.json({
    status: ingestReady ? 'READY' : 'NOT CONFIGURED',
    project: projectSlug || 'himalayan-koh',
    environment: getDeploymentEnvironment(),
    ingest: {
      url: '/api/hermes/ingest',
      method: 'POST',
      auth: 'Bearer <token> or x-hermes-token header',
      contentType: 'application/json',
      contractVersion: '1.0',
      capabilities: ['research_evidence_only'],
      writePermissions: 'NONE (evidence review only)',
    },
    integrations: {
      hermesIngest: ingestReady ? 'READY' : 'PENDING_TOKEN',
      salmanOs: hasSalmanAuth ? 'CONFIGURED' : 'NOT CONFIGURED',
      n8n: 'READY FOR CONFIGURATION',
    },
    checkedAt: new Date().toISOString(),
  });
}
