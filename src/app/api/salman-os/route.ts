import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import {
  getProjectStatus,
  getJobs,
  getIntelligence,
  runJob,
  pauseJob,
  resumeJob,
} from '@/services/salmanOs/index';
import type { SalmanOsJobKind } from '@/services/salmanOs/types';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action') || 'status';

  try {
    if (action === 'jobs') {
      const jobs = await getJobs();
      return NextResponse.json({ jobs });
    }
    if (action === 'intelligence') {
      const items = await getIntelligence();
      return NextResponse.json({ items });
    }
    // Default action: 'status'
    const status = await getProjectStatus();
    return NextResponse.json({ status });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message || 'Failed to process Salman OS request' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action') || '';
  const body = (await request.json().catch(() => ({}))) as {
    kind?: SalmanOsJobKind;
    moduleId?: string;
  };

  try {
    if (action === 'run_job' && body.kind) {
      const result = await runJob(body.kind);
      return NextResponse.json(result);
    }
    if (action === 'pause_module' && body.moduleId) {
      const result = await pauseJob(body.moduleId);
      return NextResponse.json(result);
    }
    if (action === 'resume_module' && body.moduleId) {
      const result = await resumeJob(body.moduleId);
      return NextResponse.json(result);
    }
    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message || 'Failed to execute Salman OS action' },
      { status: 500 }
    );
  }
}
