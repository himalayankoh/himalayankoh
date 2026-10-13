import { describe, expect, it } from 'vitest';
import { browserObservation } from './browserEvidence';
const lead={website:'https://www.company.example/'};
const body={sourceUrl:'https://company.example/contact',browserReviewed:true,observedText:'Company feed and horse supplies. Our published business mailbox is info@company.example.',observedEmail:'info@company.example'};
describe('staff browser observations',()=>{
 it('records the explicit browser source and observation time',()=>{const r=browserObservation(lead,body,'2026-10-13T05:00:00Z');expect(r.email).toBe('info@company.example');expect(r.research.sources?.[0]).toMatchObject({kind:'browser_page',status:'verified',retrievedAt:'2026-10-13T05:00:00Z'});expect(r.research.sources?.[0].excerpt).toContain('Staff-attested');});
 it('requires a reviewed public first-party page',()=>{expect(()=>browserObservation(lead,{...body,sourceUrl:'https://other.example/contact'})).toThrow();expect(()=>browserObservation(lead,{...body,sourceUrl:'https://company.example/wp-admin/'})).toThrow();expect(()=>browserObservation(lead,{...body,browserReviewed:false})).toThrow();});
 it('does not invent a mailbox from unrelated text',()=>{expect(()=>browserObservation(lead,{...body,observedEmail:'sales@company.example'})).toThrow();expect(()=>browserObservation(lead,{...body,observedEmail:'owner@company.example',observedText:body.observedText+' owner@company.example'})).toThrow();});
 it('permits a different-domain role mailbox only when explicitly quoted on the first-party page',()=>{const r=browserObservation(lead,{...body,observedText:'Company feed and tack store contact. Email info@companymail.example.',observedEmail:'info@companymail.example'});expect(r.email).toBe('info@companymail.example');});
 it('preserves existing evidence and allows no published mailbox',()=>{const r=browserObservation({...lead,research:{assignedOwner:'Owner',sources:[{url:lead.website,retrievedAt:'earlier',kind:'company_page',status:'verified'}]}},{...body,observedEmail:''});expect(r.research.sources).toHaveLength(2);expect(r.research.assignedOwner).toBe('Owner');expect(r).not.toHaveProperty('email');});
});
