import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockVerifyAdminRequest = vi.fn();
const mockLeadosRequest = vi.fn();
const mockGetSavedLeadById = vi.fn();
const mockUpdateSavedLead = vi.fn();
const mockListSavedLeads = vi.fn();
const mockRecordAuditEntry = vi.fn();
const mockGetServerSetting = vi.fn();
const mockSetServerSettings = vi.fn();
const mockSendLeadOSMail = vi.fn();
const mockOutreachReadiness = vi.fn();
const mockDispatchApprovedDraft = vi.fn();
const mockSyncLeadOSProspect = vi.fn();

vi.mock('@/lib/auth/verifyAdminRequest', () => ({
  verifyAdminRequest: (...args: unknown[]) => mockVerifyAdminRequest(...args),
}));

vi.mock('@/lib/leados/db', async () => {
  const actual = await vi.importActual<typeof import('@/lib/leados/db')>('@/lib/leados/db');
  return {
    ...actual,
    leadosRequest: (...args: unknown[]) => mockLeadosRequest(...args),
    getSavedLeadById: (...args: unknown[]) => mockGetSavedLeadById(...args),
    updateSavedLead: (...args: unknown[]) => mockUpdateSavedLead(...args),
    listSavedLeads: (...args: unknown[]) => mockListSavedLeads(...args),
    recordAuditEntry: (...args: unknown[]) => mockRecordAuditEntry(...args),
  };
});

vi.mock('@/lib/settings/serverSettings', () => ({
  getServerSetting: (...args: unknown[]) => mockGetServerSetting(...args),
  setServerSettings: (...args: unknown[]) => mockSetServerSettings(...args),
}));

vi.mock('@/lib/leados/emailProvider', () => ({
  sendLeadOSMail: (...args: unknown[]) => mockSendLeadOSMail(...args),
}));

vi.mock('@/lib/leados/n8n', () => ({
  outreachReadiness: (...args: unknown[]) => mockOutreachReadiness(...args),
  dispatchApprovedDraft: (...args: unknown[]) => mockDispatchApprovedDraft(...args),
}));

vi.mock('@/lib/omnisend/client', () => ({
  syncLeadOSProspect: (...args: unknown[]) => mockSyncLeadOSProspect(...args),
}));

import { GET as workflowGET, POST as workflowPOST } from '@/app/api/admin/leados/workflow/route';
import { POST as outreachSendPOST } from '@/app/api/admin/leados/outreach/send/route';
import { POST as leadsPOST } from '@/app/api/admin/leados/leads/route';
import { WordPressApiError } from '@/lib/leados/db';

describe('LeadOS Outreach Approval Contract & Omnisend Safeguards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyAdminRequest.mockResolvedValue({
      ok: true,
      user: { id: 'admin-1', email: 'sales@himalayankoh.com', role: 'super_admin' },
    });
    mockGetServerSetting.mockResolvedValue('[]');
    mockSetServerSettings.mockResolvedValue({ ok: true, saved: 1 });
    mockRecordAuditEntry.mockResolvedValue(undefined);
    mockGetSavedLeadById.mockResolvedValue({
      id: 'lead-101',
      businessName: 'Tractor Store',
      email: 'old@tractorstore.com',
      city: 'Houston',
      region: 'TX',
    });
    mockUpdateSavedLead.mockImplementation(async (id: string, patch: Record<string, unknown>) => ({
      id,
      businessName: 'Tractor Store',
      city: 'Houston',
      region: 'TX',
      ...patch,
    }));
  });

  it('Priority 1: saving a draft never sends an email, retains draftId & revision, and persists recipient edits', async () => {
    mockLeadosRequest.mockResolvedValueOnce({
      item: {
        id: 'wp-draft-uuid-1',
        kind: 'draft',
        state: 'draft',
        revision: 1,
        payload: {
          lead_id: 'lead-101',
          recipient: 'buyer@tractorstore.com',
          subject: 'Himalayan Salt Wholesale Inquiry',
          message: 'Hello team, reply unsubscribe to opt out.',
        },
        created_at: '2026-10-18T00:00:00Z',
        updated_at: '2026-10-18T00:00:00Z',
      },
    });

    const saveReq = new Request('https://himalayankoh.com/api/admin/leados/workflow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'save_draft',
        leadId: 'lead-101',
        recipientEmail: 'buyer@tractorstore.com',
        recipientName: 'Tractor Store',
        subject: 'Himalayan Salt Wholesale Inquiry',
        message: 'Hello team, reply unsubscribe to opt out.',
        outreachMode: 'wholesale',
      }),
    });

    const saveRes = await workflowPOST(saveReq);
    const saveBody = await saveRes.json();

    expect(saveRes.status).toBe(200);
    expect(saveBody.ok).toBe(true);
    expect(saveBody.id).toBe('wp-draft-uuid-1');
    expect(saveBody.revision).toBe(1);
    expect(mockSendLeadOSMail).not.toHaveBeenCalled();
    expect(mockDispatchApprovedDraft).not.toHaveBeenCalled();
    expect(mockUpdateSavedLead).toHaveBeenCalledWith('lead-101', {
      email: 'buyer@tractorstore.com',
      emailSource: 'manually_entered',
    });

    // Editing the existing draft passes existing id & revision 1, returning revision 2
    mockLeadosRequest.mockResolvedValueOnce({
      item: {
        id: 'wp-draft-uuid-1',
        kind: 'draft',
        state: 'draft',
        revision: 2,
        payload: {
          lead_id: 'lead-101',
          recipient: 'updated@tractorstore.com',
          subject: 'Updated Wholesale Inquiry',
          message: 'Updated body, reply unsubscribe to opt out.',
        },
        created_at: '2026-10-18T00:00:00Z',
        updated_at: '2026-10-18T00:01:00Z',
      },
    });

    const editReq = new Request('https://himalayankoh.com/api/admin/leados/workflow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'save_draft',
        id: 'wp-draft-uuid-1',
        revision: 1,
        leadId: 'lead-101',
        recipientEmail: 'updated@tractorstore.com',
        subject: 'Updated Wholesale Inquiry',
        message: 'Updated body, reply unsubscribe to opt out.',
      }),
    });

    const editRes = await workflowPOST(editReq);
    const editBody = await editRes.json();

    expect(editRes.status).toBe(200);
    expect(editBody.id).toBe('wp-draft-uuid-1');
    expect(editBody.revision).toBe(2);
    expect(mockLeadosRequest).toHaveBeenLastCalledWith(
      '/workflow',
      expect.objectContaining({
        method: 'POST',
        body: expect.objectContaining({
          action: 'save_draft',
          id: 'wp-draft-uuid-1',
          revision: 1,
          recipient: 'updated@tractorstore.com',
        }),
      })
    );
  });

  it('Priority 1: GET /api/admin/leados/workflow filters drafts by lead_id and returns top-level items', async () => {
    mockLeadosRequest.mockResolvedValueOnce({
      items: [
        { id: 'draft-a', kind: 'draft', state: 'draft', revision: 2, payload: { lead_id: 'lead-101', subject: 'For 101' } },
        { id: 'draft-b', kind: 'draft', state: 'draft', revision: 1, payload: { lead_id: 'lead-999', subject: 'For 999' } },
      ],
    });

    const getReq = new Request('https://himalayankoh.com/api/admin/leados/workflow?lead_id=lead-101&kind=draft');
    const getRes = await workflowGET(getReq);
    const getBody = await getRes.json();

    expect(getRes.status).toBe(200);
    expect(getBody.items).toHaveLength(1);
    expect(getBody.items[0].id).toBe('draft-a');
    expect(getBody.items[0].revision).toBe(2);
  });

  it('Priority 1: Confirm & Send requires draftId & revision, blocks unapproved/duplicate sends, and dispatches via mocked provider', async () => {
    // 1. Missing draftId/revision is rejected with 400
    const missingReq = new Request('https://himalayankoh.com/api/admin/leados/outreach/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        leadId: 'lead-101',
        recipientEmail: 'buyer@tractorstore.com',
        subject: 'Hello',
        message: 'World',
        simulation: false,
      }),
    });
    const missingRes = await outreachSendPOST(missingReq);
    expect(missingRes.status).toBe(400);
    expect(mockDispatchApprovedDraft).not.toHaveBeenCalled();

    // 2. Unapproved or already-dispatched draft rejected by WordPress reserve with 409
    mockOutreachReadiness.mockReturnValue({ ready: true, blockers: [] });
    mockLeadosRequest.mockRejectedValueOnce(
      new WordPressApiError({
        message: 'Only owner-approved current drafts can be dispatched.',
        path: '/wp-json/leados/v1/workflow',
        status: 409,
      })
    );

    const unapprovedReq = new Request('https://himalayankoh.com/api/admin/leados/outreach/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        draftId: 'wp-draft-uuid-1',
        revision: 2,
        simulation: false,
      }),
    });
    const unapprovedRes = await outreachSendPOST(unapprovedReq);
    expect(unapprovedRes.status).toBe(409);
    expect(mockDispatchApprovedDraft).not.toHaveBeenCalled();

    // 3. Approved draft with matching revision reserves and dispatches once via mocked provider
    mockLeadosRequest
      .mockResolvedValueOnce({
        item: {
          id: 'wp-draft-uuid-1',
          revision: 3,
          state: 'sending',
          payload: {
            lead_id: 'lead-101',
            recipient: 'buyer@tractorstore.com',
            subject: 'Himalayan Salt Wholesale Inquiry',
            message: 'Hello team, reply unsubscribe to opt out.',
          },
        },
      })
      .mockResolvedValueOnce({ ok: true });
    mockDispatchApprovedDraft.mockResolvedValueOnce({ state: 'queued' });

    const validSendReq = new Request('https://himalayankoh.com/api/admin/leados/outreach/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        draftId: 'wp-draft-uuid-1',
        revision: 3,
        leadId: 'lead-101',
        simulation: false,
      }),
    });
    const validSendRes = await outreachSendPOST(validSendReq);
    const validSendBody = await validSendRes.json();

    expect(validSendRes.status).toBe(202);
    expect(validSendBody.ok).toBe(true);
    expect(validSendBody.state).toBe('queued');
    expect(mockDispatchApprovedDraft).toHaveBeenCalledTimes(1);
    expect(mockSyncLeadOSProspect).not.toHaveBeenCalled();
  });

  it('Priority 2: simulated outreach (test message button) never creates or syncs an Omnisend contact', async () => {
    mockGetSavedLeadById.mockResolvedValueOnce({
      id: 'lead-101',
      businessName: 'Tractor Store',
      email: 'buyer@tractorstore.com',
    });
    mockSendLeadOSMail.mockResolvedValueOnce({
      ok: true,
      state: 'simulated',
      provider: 'simulated',
      providerMessageId: 'sim-1',
    });

    const simReq = new Request('https://himalayankoh.com/api/admin/leados/outreach/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        leadId: 'lead-101',
        recipientEmail: 'sales@himalayankoh.com',
        recipientName: 'Tractor Store',
        subject: 'Himalayan Salt Wholesale Inquiry',
        message: 'Hello team, reply unsubscribe to opt out.',
        simulation: true,
      }),
    });

    const simRes = await outreachSendPOST(simReq);
    const simBody = await simRes.json();

    expect(simRes.status).toBe(200);
    expect(simBody.ok).toBe(true);
    expect(simBody.simulated).toBe(true);
    expect(simBody.omnisendSynced).toBe(false);
    expect(mockSyncLeadOSProspect).not.toHaveBeenCalled();
  });

  it('Priority 2: sync_omnisend paginates beyond 50, deduplicates emails, excludes suppressed leads, previews on dryRun, and preserves nonSubscribed', async () => {
    // Generate 60 leads with emails: 55 unique eligible, 3 duplicate multi-branch emails, 2 suppressed (do_not_contact / disqualified)
    const sampleLeads = [
      ...Array.from({ length: 55 }, (_, i) => ({
        id: `lead-${i + 1}`,
        businessName: `Feed Store #${i + 1}`,
        email: `buyer${i + 1}@feedstore.com`,
        status: 'new',
      })),
      { id: 'dup-1', businessName: 'Feed Store Branch A', email: 'BUYER1@feedstore.com', status: 'new' },
      { id: 'dup-2', businessName: 'Feed Store Branch B', email: 'buyer2@feedstore.com', status: 'new' },
      { id: 'dup-3', businessName: 'Feed Store Branch C', email: 'buyer3@feedstore.com', status: 'new' },
      { id: 'sup-1', businessName: 'Opted Out Store', email: 'optout@store.com', status: 'do_not_contact' },
      { id: 'sup-2', businessName: 'Disqualified Store', email: 'disq@store.com', status: 'disqualified' },
    ];

    mockListSavedLeads.mockResolvedValue({
      leads: sampleLeads,
      total: sampleLeads.length,
    });

    // 1. Dry-run preview returns exact eligible breakdown without calling Omnisend
    const previewReq = new Request('https://himalayankoh.com/api/admin/leados/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'sync_omnisend', dryRun: true }),
    });
    const previewRes = await leadsPOST(previewReq);
    const previewBody = await previewRes.json();

    expect(previewRes.status).toBe(200);
    expect(previewBody.dryRun).toBe(true);
    expect(previewBody.totalWithEmail).toBe(60);
    expect(previewBody.duplicateEmailCount).toBe(3);
    expect(previewBody.excludedOrSuppressedCount).toBe(2);
    expect(previewBody.eligibleCount).toBe(55);
    expect(previewBody.consentStatus).toBe('nonSubscribed');
    expect(mockSyncLeadOSProspect).not.toHaveBeenCalled();

    // 2. Confirmed sync processes all 55 eligible contacts (not truncated at 50!)
    mockSyncLeadOSProspect.mockResolvedValue({ ok: true, contactID: 'omni-1' });
    const confirmReq = new Request('https://himalayankoh.com/api/admin/leados/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'sync_omnisend', confirm: true, dryRun: false }),
    });
    const confirmRes = await leadsPOST(confirmReq);
    const confirmBody = await confirmRes.json();

    expect(confirmRes.status).toBe(200);
    expect(confirmBody.dryRun).toBe(false);
    expect(confirmBody.syncedCount).toBe(55);
    expect(confirmBody.eligibleCount).toBe(55);
    expect(confirmBody.consentStatus).toBe('nonSubscribed');
    expect(mockSyncLeadOSProspect).toHaveBeenCalledTimes(55);
  });
});
