import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';
const mocks = vi.hoisted(()=>({db:vi.fn()}));
vi.mock('@/lib/leados/db',()=>({leadosRequest:mocks.db}));
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('LEADOS_EVENT_TOKEN','test-secret-'.repeat(4));mocks.db.mockResolvedValue({duplicate:false});});
const req=(token:string,body:unknown)=>new Request('https://himalayankoh.com/api/leados/outreach-events',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
describe('Authenticated LeadOS machine events',()=>{
  it.each(['','wrong','é'.repeat(48)])('rejects untrusted tokens before reading private storage (%s)',async token=>{expect((await POST(req(token,{dispatchId:'1',eventId:'2',state:'delivered'}))).status).toBe(401);expect(mocks.db).not.toHaveBeenCalled();});
  it('rejects invented conversion events',async()=>{expect((await POST(req('test-secret-'.repeat(4),{dispatchId:'1',eventId:'2',state:'won'}))).status).toBe(400);expect(mocks.db).not.toHaveBeenCalled();});
  it('passes an authenticated event with its stable deduplication ID',async()=>{expect((await POST(req('test-secret-'.repeat(4),{dispatchId:'1',eventId:'2',state:'bounced'}))).status).toBe(200);expect(mocks.db).toHaveBeenCalledWith('/workflow',{method:'POST',body:{action:'event',id:'1',eventId:'2',state:'bounced'}});});
});
