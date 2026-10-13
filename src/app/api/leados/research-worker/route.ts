import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { leadosRequest } from '@/lib/leados/db';

function authorized(request: Request) {
  const key = process.env.LEADOS_RESEARCH_WORKER_TOKEN || '';
  const received = (request.headers.get('authorization') || '').replace(/^Bearer /, '');
  return key.length >= 32 && Buffer.byteLength(key) === Buffer.byteLength(received) && timingSafeEqual(Buffer.from(key),Buffer.from(received));
}
export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({error:'Unauthorized'},{status:401});
  try {
    const data = await leadosRequest('/workflow',{method:'POST',body:{action:'claim_discovery'}});
    return NextResponse.json(data,{headers:{'Cache-Control':'no-store'}});
  } catch { return NextResponse.json({error:'Research queue unavailable.'},{status:503}); }
}
export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({error:'Unauthorized'},{status:401});
  try {
    const body = await request.json();
    if (typeof body.id !== 'string' || typeof body.claimToken !== 'string' || !Array.isArray(body.results) || body.results.length > 100) return NextResponse.json({error:'Invalid research result.'},{status:400});
    const results = body.results.map((r: {title?:unknown;url?:unknown;content?:unknown})=>({title:String(r.title || '').slice(0,250),url:String(r.url || '').slice(0,2000),content:String(r.content || '').slice(0,1000)}));
    const data = await leadosRequest('/workflow',{method:'POST',body:{action:'complete_discovery',id:body.id,claimToken:body.claimToken,results,error:typeof body.error==='string' ? body.error.slice(0,500) : '',upstreamErrors:Array.isArray(body.upstreamErrors) ? body.upstreamErrors.map(String).slice(0,10) : []}});
    return NextResponse.json({ok:true,...data as object},{headers:{'Cache-Control':'no-store'}});
  } catch { return NextResponse.json({error:'Result not stored; retry the same claim.'},{status:409}); }
}
