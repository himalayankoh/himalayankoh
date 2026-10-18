import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import { listProjects, saveProject, ensureDefaultProject } from '@/lib/leados/db';

export async function GET(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    let projects = await listProjects();
    if (projects.length === 0) {
      const defaultProject = await ensureDefaultProject();
      projects = [defaultProject];
    }
    return NextResponse.json({ ok: true, projects });
  } catch (error) {
    console.error('LeadOS get projects error:', error);
    return NextResponse.json({ error: 'Failed to retrieve projects' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json();
    if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
      return NextResponse.json({ error: 'Project name is required' }, { status: 400 });
    }

    const saved = await saveProject({
      ...body,
      name: body.name.trim(),
    });

    return NextResponse.json({ ok: true, project: saved });
  } catch (error) {
    console.error('LeadOS save project error:', error);
    return NextResponse.json({ error: 'Failed to save project' }, { status: 500 });
  }
}
