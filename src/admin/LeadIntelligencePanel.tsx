'use client';
import { useCallback, useEffect, useState } from 'react';
import { LEAD_PIPELINE, OFFER_PROFILES, PRODUCT_INTERESTS } from '@/lib/leados/intelligence';
import type { SavedLeadRecord, ProductInterest, LeadSearchInput } from '@/lib/leados/types';

interface WorkflowItem { id: string; kind: string; lead_id: string; state: string; revision: number; updated_at: string; payload: Partial<LeadSearchInput> & { subject?: string; message?: string; recipient?: string; name?: string; eventIds?: string[] } }
interface Props { headers: () => Promise<Record<string, string>>; initialLeadId?: string; onSavedSearch?: (search: WorkflowItem['payload']) => void; }

/** Extends the existing admin module; every state-changing action uses its RBAC API. */
export default function LeadIntelligencePanel({ headers, initialLeadId, onSavedSearch }: Props) {
  const [leads, setLeads] = useState<SavedLeadRecord[]>([]), [selected, setSelected] = useState(initialLeadId || '');
  const [items, setItems] = useState<WorkflowItem[]>([]), [searches, setSearches] = useState<WorkflowItem[]>([]);
  const [activity, setActivity] = useState<Array<{ action: string; created_at: string }>>([]);
  const [ready, setReady] = useState<{ ready: boolean; blockers: string[] } | null>(null);
  const [providers, setProviders] = useState<Record<string, boolean>>({});
  const [lastWorkerSeen, setLastWorkerSeen] = useState<string | null>(null);
  const [notice, setNotice] = useState(''), [busy, setBusy] = useState(false), [policyReviewed, setPolicyReviewed] = useState(false);
  const [interest, setInterest] = useState<ProductInterest>('horse_salt');
  const [editing, setEditing] = useState<WorkflowItem | null>(null), [subject, setSubject] = useState(''), [message, setMessage] = useState('');
  const [metadata, setMetadata] = useState<Record<string, string>>({});
  const [bulk, setBulk] = useState<string[]>([]), [pipeline, setPipeline] = useState('researched');
  const request = useCallback(async (url: string, body?: unknown) => {
    const res = await fetch(url, { method: body ? 'POST' : 'GET', headers: { ...await headers(), 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }, [headers]);
  const load = useCallback(async () => {
    try {
      const [library, drafts, savedSearches, history] = await Promise.all([request('/api/admin/leados/leads?limit=200'), request('/api/admin/leados/workflow'), request('/api/admin/leados/workflow?kind=saved_search'), request('/api/admin/leados/workflow?kind=activity')]);
      setLeads(library.leads); setItems(drafts.data.items || []); setSearches(savedSearches.data.items || []); setActivity(history.data.items || []);
      setReady(drafts.readiness); setProviders(drafts.providers);
      setLastWorkerSeen(drafts.data.researchWorkerLastSeen || null);
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Workflow unavailable.'); }
  }, [request]);
  useEffect(() => { void load(); }, [load]);
  const lead = leads.find((l) => l.id === selected);
  useEffect(() => {
    setPolicyReviewed(false);
    const research = leads.find((l) => l.id === selected)?.research || {};
    setMetadata(Object.fromEntries(['assignedOwner','nextFollowUp','requestedQuantity','packagingPreference','buyerQuestions'].map((key) => [key, String(research[key as keyof typeof research] || '')])));
  }, [selected, leads]);
  async function action(body: unknown) {
    setBusy(true); setNotice('');
    try { const data = await request('/api/admin/leados/workflow', body); await load(); setNotice('Saved in the LeadOS workspace.'); return data; }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Action failed.'); }
    finally { setBusy(false); }
  }
  async function patch(id: string, fields: unknown) {
    const res = await fetch('/api/admin/leados/leads', { method: 'PATCH', headers: { ...await headers(), 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...fields as object }) });
    if (!res.ok) throw new Error('Lead update failed.');
  }
  const btn = 'px-3 py-2 rounded-lg bg-indigo-600 text-white text-xs disabled:opacity-50';
  const field = 'w-full border border-slate-200 rounded-lg p-2 text-xs';
  return <section className="space-y-4 text-slate-800">
    <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
      <h3 className="font-bold">Qualification, review &amp; outreach</h3>
      <p className="text-xs">Saved company evidence, editable drafts and owner approval. No automatic prospect campaigns.</p>
      <div className="flex flex-wrap gap-2 text-xs">{Object.entries(providers).map(([provider, available]) => <span key={provider} className="bg-slate-100 rounded px-2 py-1">{provider}: {available ? 'configured' : 'not configured'}</span>)}</div>
      {providers.researchWorker && <p className="text-xs">Private research worker last seen: {lastWorkerSeen || 'not observed yet'}. Research requires the owner’s n8n host to remain online.</p>}
      {ready && <div className="text-xs bg-amber-50 p-3 rounded-lg">{ready.ready ? 'Sender configuration ready; every send still requires a reviewed draft.' : ready.blockers.join(' ')}</div>}
      {notice && <p role="status" className="text-xs border border-indigo-200 bg-indigo-50 p-3 rounded-lg">{notice}</p>}
    </div>
    <div className="grid md:grid-cols-2 gap-4">
      <div className="bg-white border rounded-xl p-4 space-y-3">
        <h4 className="font-bold text-sm">Lead evidence &amp; sales notes</h4>
        <label className="block text-xs">Saved company<select aria-label="Saved company" className={field} value={selected} onChange={(e) => setSelected(e.target.value)}><option value="">Choose a saved company</option>{leads.map((l) => <option key={l.id} value={l.id}>{l.businessName} — {l.city || 'location unverified'}</option>)}</select></label>
        <label className="block text-xs">Product interest<select className={field} value={interest} onChange={(e) => setInterest(e.target.value as ProductInterest)}>{PRODUCT_INTERESTS.map((p) => <option key={p} value={p}>{OFFER_PROFILES[p].label}</option>)}</select></label>
        <p className="text-xs text-slate-500">{OFFER_PROFILES[interest].caveat}</p>
        {lead && <>
          {lead.research?.publicCompanyName && <p className="text-xs font-semibold">Published company name: {lead.research.publicCompanyName}</p>}
          <p className="text-xs">{lead.email || 'No public company email found'} · {lead.emailSource || 'unverified'} · {lead.phone || 'Phone not found'}</p>
          {lead.website && <a href={lead.website} target="_blank" rel="noopener noreferrer" className="text-xs underline text-indigo-700">Review company website and terms</a>}
          {lead.research?.contactPage && <a href={lead.research.contactPage} target="_blank" rel="noopener noreferrer" className="block text-xs underline text-indigo-700">Company contact page</a>}
          <label className="flex gap-2 text-xs"><input type="checkbox" checked={policyReviewed} onChange={(e) => setPolicyReviewed(e.target.checked)} />I reviewed this company’s public-site terms for permitted research.</label>
          <button className={btn} disabled={busy || !policyReviewed || !lead.website} onClick={async () => { setBusy(true); try { await request('/api/admin/leados/research', { id: lead.id, policyReviewed, productInterest: interest }); await load(); setNotice('Research complete; source errors and missing contacts remain visible below.'); } catch (e) { setNotice(e instanceof Error ? e.message : 'Research failed.'); } finally { setBusy(false); } }}>Research public pages</button>
          <p className="text-xs">Last verified: {lead.research?.lastVerifiedAt || 'not verified'} · Fit: {lead.research?.qualification?.score ?? 'not assessed'}/100</p>
          {lead.research?.qualification?.reasons.map((reason) => <p key={reason} className="text-xs">{reason}</p>)}
          {(lead.research?.sources || []).map((s, i) => <details key={`${s.url}-${i}`} className="text-xs border rounded p-2"><summary>{s.status} · {s.kind} · {s.retrievedAt}</summary><a href={s.url} target="_blank" rel="noopener noreferrer" className="break-all underline">{s.url}</a><p>{s.excerpt}</p></details>)}
          {lead.research?.errors?.map((e) => <p key={e} className="text-xs text-amber-800">{e}</p>)}
          {Object.entries({ assignedOwner: 'Assigned owner', nextFollowUp: 'Next follow-up', requestedQuantity: 'Buyer-requested quantity', packagingPreference: 'Packaging preference', buyerQuestions: 'Buyer questions / quote requirement' }).map(([key, label]) => <label key={key} className="block text-xs">{label}<input type={key === 'nextFollowUp' ? 'date' : 'text'} className={field} value={metadata[key] || ''} onChange={(e) => setMetadata({ ...metadata, [key]: e.target.value })} /></label>)}
          <button className={btn} disabled={busy} onClick={async () => { try { await patch(lead.id, { research: { ...lead.research, ...metadata, productInterest: interest } }); await load(); setNotice('Sales notes saved; evidence preserved.'); } catch (e) { setNotice(String(e)); } }}>Save sales details</button>
          <button className={`${btn} ml-2`} disabled={busy} onClick={async () => { const d = await action({ action: 'save_draft', leadId: lead.id, productInterest: interest }); if (d?.data?.item) { setEditing(d.data.item); setSubject(d.data.item.payload.subject); setMessage(d.data.item.payload.message); } }}>Create introduction draft</button>
          <button className="block text-xs underline text-indigo-700" disabled={busy} onClick={async () => { const d = await action({ action: 'save_draft', leadId: lead.id, productInterest: interest, assist: true }); if (d?.data?.item) { setEditing(d.data.item); setSubject(d.data.item.payload.subject); setMessage(d.data.item.payload.message); } }}>AI-assisted introduction (approved provider; review required)</button>
          <button className="block text-xs underline text-rose-700" disabled={busy} onClick={() => action({ action: 'suppress', leadId: lead.id, reason: 'Owner selected do not contact' })}>Suppress further outreach</button>
          <button className="block text-xs underline text-indigo-700" disabled={busy || !lead.email} onClick={() => action({ action: 'export_crm', leadId: lead.id })}>Add to CRM as B2B prospect (no subscription opt-in)</button>
        </>}
      </div>
      <div className="bg-white border rounded-xl p-4 space-y-3">
        <h4 className="font-bold text-sm">Owner review</h4>
        {editing ? <>
          <p className="text-xs">Recipient: {editing.payload.recipient || 'not found'} · State: {editing.state} · Revision: {editing.revision}</p>
          <label className="block text-xs">Subject<input className={field} value={subject} onChange={(e) => setSubject(e.target.value)} /></label>
          <label className="block text-xs">Message<textarea className={field} rows={12} value={message} onChange={(e) => setMessage(e.target.value)} /></label>
          <p className="text-xs text-slate-500">Saving edits revokes previous approval. Approval alone sends no email.</p>
          <button className={btn} disabled={busy || !['draft','approved','paused','rejected'].includes(editing.state)} onClick={async () => { const d = await action({ action: 'save_draft', id: editing.id, revision: editing.revision, leadId: editing.lead_id, subject, message, productInterest: editing.payload.productInterest }); if (d?.data?.item) setEditing(d.data.item); }}>Save editable draft</button>
          <button className={`${btn} ml-2`} disabled={busy || editing.state !== 'draft' || subject !== editing.payload.subject || message !== editing.payload.message} onClick={async () => { const d = await action({ action: 'approve', id: editing.id, revision: editing.revision }); if (d?.data?.item) setEditing(d.data.item); }}>Approve exact draft</button>
          <div className="flex gap-2"><button className={btn} disabled={busy} onClick={() => action({ action: 'reject', id: editing.id, revision: editing.revision }).then((d) => d?.data?.item && setEditing(d.data.item))}>Reject</button><button className={btn} disabled={busy} onClick={() => action({ action: 'pause', id: editing.id, revision: editing.revision }).then((d) => d?.data?.item && setEditing(d.data.item))}>Pause</button></div>
          <button className={btn} disabled={busy || !ready?.ready || editing.state !== 'approved' || subject !== editing.payload.subject || message !== editing.payload.message} onClick={async () => { setBusy(true); try { await request('/api/admin/leados/outreach/send', { draftId: editing.id, revision: editing.revision }); await load(); setEditing(null); setNotice('n8n accepted the dispatch; delivery awaits a verified event.'); } catch (e) { setNotice(String(e)); } finally { setBusy(false); } }}>Send approved draft through n8n</button>
        </> : <p className="text-xs">Choose or create a draft. Review company relevance and public contact evidence first.</p>}
        {items.map((item) => <button key={item.id} className="block w-full border rounded-lg p-3 text-left text-xs" onClick={() => { setEditing(item); setSubject(item.payload.subject || ''); setMessage(item.payload.message || ''); }}><strong>{item.payload.subject}</strong><span className="block">{item.state} · {item.payload.recipient || 'no email'} · {item.updated_at}</span></button>)}
      </div>
    </div>
    <div className="bg-white border rounded-xl p-4 space-y-2">
      <h4 className="font-bold text-sm">Pipeline bulk review</h4>
      <div className="flex gap-2"><select aria-label="Pipeline status" className={field} value={pipeline} onChange={(e) => setPipeline(e.target.value)}>{LEAD_PIPELINE.map((s) => <option key={s} value={s}>{s.replaceAll('_',' ')}</option>)}</select><button className={btn} disabled={!bulk.length || busy} onClick={async () => { setBusy(true); try { for (const id of bulk) await patch(id, { status: pipeline }); setBulk([]); await load(); setNotice('Selected pipeline statuses updated.'); } catch (e) { setNotice(String(e)); } finally { setBusy(false); } }}>Update {bulk.length} selected</button></div>
      <p className="text-xs text-slate-500">Pipeline labels record owner triage; sending still requires a separately approved draft.</p>
      <div className="max-h-48 overflow-y-auto">{leads.map((l) => <label key={l.id} className="flex gap-2 text-xs p-1"><input type="checkbox" checked={bulk.includes(l.id)} onChange={(e) => setBulk(e.target.checked ? [...bulk,l.id] : bulk.filter((id) => id !== l.id))} />{l.businessName} · {l.status}</label>)}</div>
    </div>
    <div className="grid md:grid-cols-2 gap-4"><div className="bg-white border rounded-xl p-4 space-y-2"><h4 className="font-bold text-sm">Saved searches</h4>{searches.length ? searches.map((s) => <button className="block text-xs underline" key={s.id} onClick={() => onSavedSearch?.(s.payload)}>{s.payload.name || s.payload.category} · {s.payload.location}</button>) : <p className="text-xs">Save a search from Find Leads to reuse its targets.</p>}</div><div className="bg-white border rounded-xl p-4 space-y-2"><h4 className="font-bold text-sm">Activity</h4>{activity.slice(0, 20).map((a,i) => <p key={i} className="text-xs">{a.action.replaceAll('_',' ')} · {a.created_at}</p>)}</div></div>
  </section>;
}
