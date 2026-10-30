import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import { askModel, AiAskError } from '@/lib/ai/askModel';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();
    const { action, context, prompt } = body;
    
    if (!action) {
      return NextResponse.json({ error: 'Action is required.' }, { status: 400 });
    }

    const systemPrompt = `You are the Himalayan Koh Wholesale Logistics AI Assistant.
Your job is to help the admin user understand the wholesale logistics calculation.
The wholesale engine is pure and deterministic. You are NOT the calculation engine.
You MUST NEVER invent dimensions, weights, cartons per pallet, pallet capacity, freight rates, carrier, port charges, supplier costs, FX rates, or transit times.
If information is missing, you must say exactly what is missing and suggest completing the packaging profile.

Context of current shipment:
${JSON.stringify(context, null, 2)}
`;

    let userPrompt = '';
    
    if (action === 'explain_pallet') {
      userPrompt = 'Please explain how the pallet count was calculated based on the units and the packaging profile.';
    } else if (action === 'why_lcl') {
      userPrompt = 'Why is LCL physically or economically recommended over FCL for this shipment?';
    } else if (action === 'why_fcl') {
      userPrompt = 'Why is FCL physically or economically recommended over LCL for this shipment?';
    } else if (action === 'check_missing') {
      userPrompt = 'What packaging or freight data is missing or incomplete for this shipment?';
    } else if (action === 'compare_freight') {
      userPrompt = 'Can you compare the different freight options available for this shipment?';
    } else if (action === 'draft_notes') {
      userPrompt = 'Please draft a brief, professional note to the client summarizing this quote (e.g. shipping mode, container sizes, ETA if available).';
    } else if (action === 'check_shipment') {
      userPrompt = 'Please validate this shipment context. Flag any impossible pallet counts, weights above container payloads, CBM mismatches, missing freight rates, or odd selections (like FCL for a tiny shipment). Do not alter totals, just provide a validation report.';
    } else if (action === 'ask') {
      userPrompt = prompt || 'Please help with this shipment.';
    } else {
      userPrompt = `Please answer this about the shipment: ${action}`;
    }

    const result = await askModel({
      system: systemPrompt,
      prompt: userPrompt,
      maxTokens: 1000,
      json: false
    });

    return NextResponse.json({ 
      text: result.text,
      model: result.model,
      provider: result.provider
    });

  } catch (error) {
    if (error instanceof AiAskError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: 'An unexpected error occurred contacting the AI.' },
      { status: 500 }
    );
  }
}
