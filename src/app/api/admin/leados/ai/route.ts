import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import { analyzeLeadWithAI, scoreProjectFitWithAI, getAIProviderStatus, runPromptWithFallback, type LeadOSAIProvider } from '@/lib/leados/ai';
import { getProjectById } from '@/lib/leados/db';
import { planLeadSearch } from '@/lib/leados/searchPlanner';

const VALID_PROVIDERS: LeadOSAIProvider[] = ['auto', 'gemini', 'openrouter', 'deepseek'];

export async function POST(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json();
    const { action = 'analyze', lead, projectId } = body;
    const provider: LeadOSAIProvider = VALID_PROVIDERS.includes(body.provider) ? body.provider : 'auto';

    if (action === 'test') {
      const status = await getAIProviderStatus();
      // Backwards-compatible single-provider shape (older UI expects
      // `{ configured, model }`), plus the full per-provider map.
      if (provider !== 'auto') {
        return NextResponse.json({
          ok: true,
          provider,
          configured: status[provider].configured,
          model: status[provider].model,
          providers: status,
        });
      }
      return NextResponse.json({
        ok: true,
        provider: 'auto',
        configured: status.gemini.configured || status.openrouter.configured || status.deepseek.configured,
        model: status.gemini.configured ? status.gemini.model : status.openrouter.model,
        providers: status,
      });
    }

    if (action === 'plan_search') {
      const description = typeof body.description === 'string' ? body.description : '';
      if (!description.trim()) return NextResponse.json({ error: 'Describe who you want to find.' }, { status: 400 });
      const result = await planLeadSearch(description, {
        fallbackLocation: typeof body.location === 'string' ? body.location : '',
        ask: (prompt) => runPromptWithFallback(prompt, provider, { maxOutputTokens: 120, json: true, temperature: 0 }),
      });
      return NextResponse.json({ ok: true, ...result }, { headers: { 'Cache-Control': 'private, no-store' } });
    }

    if (!lead || !lead.businessName) {
      return NextResponse.json({ error: 'Valid lead data is required' }, { status: 400 });
    }

    const analysis = await analyzeLeadWithAI(lead, provider);

    let projectFit = null;
    if (projectId) {
      const project = await getProjectById(projectId);
      if (project) {
        projectFit = await scoreProjectFitWithAI(lead, project, provider);
      }
    }

    return NextResponse.json({
      ok: true,
      analysis,
      projectFit,
    });
  } catch (error) {
    console.error('LeadOS AI route error:', error);
    return NextResponse.json({ error: 'AI processing failed' }, { status: 500 });
  }
}
