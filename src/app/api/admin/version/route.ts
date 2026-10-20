import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  // Build identifier: commit SHA or timestamp to detect new website deployments
  const commitSha =
    process.env.CF_PAGES_COMMIT_SHA ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.GIT_COMMIT ||
    'build-20261020-v1.5.0';

  return NextResponse.json(
    {
      ok: true,
      version: '1.5.0',
      buildId: commitSha,
      timestamp: new Date().toISOString(),
      appName: 'Himalayan Koh Admin',
    },
    {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      },
    }
  );
}
