import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), search: vi.fn(), ensure: vi.fn(), project: vi.fn(), saved: vi.fn(), record: vi.fn() }));
vi.mock('@/lib/auth/verifyAdminRequest', () => ({ verifyAdminRequest: mocks.auth }));
vi.mock('@/lib/leados/osm-provider', () => ({ searchOpenStreetMap: mocks.search }));
vi.mock('@/lib/leados/db', () => ({ ensureDefaultProject: mocks.ensure, getProjectById: mocks.project, listSavedLeads: mocks.saved, recordSearchExecution: mocks.record }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ ok: true });
  mocks.ensure.mockResolvedValue(undefined);
  mocks.project.mockResolvedValue(null);
  mocks.saved.mockResolvedValue({ leads: [] });
  mocks.record.mockResolvedValue(undefined);
  mocks.search.mockResolvedValue({ leads: [], diagnostics: { geocodeSuccess: true, errorSummary: null } });
});
const request = () => new Request('https://himalayankoh.com/api/admin/leados/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'Houston, TX', category: 'Feed Store' }) });

describe('LeadOS search outcomes', () => {
  it('records a genuinely successful empty search', async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, leads: [] });
    expect(mocks.record).toHaveBeenCalledWith({ location: 'Houston, TX', category: 'Feed Store', resultsCount: 0 });
  });
  it.each([[true, 503], [false, 422]])('reports discovery failure with geocodeSuccess=%s', async (geocodeSuccess, status) => {
    mocks.search.mockResolvedValue({ leads: [], diagnostics: { geocodeSuccess, errorSummary: 'private upstream failure' } });
    const response = await POST(request());
    expect(response.status).toBe(status);
    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBeTruthy();
    expect(JSON.stringify(body)).not.toContain('private upstream failure');
    expect(mocks.saved).not.toHaveBeenCalled();
    expect(mocks.record).not.toHaveBeenCalled();
  });
  it('rejects an anonymous search without contacting providers or writing history', async () => {
    mocks.auth.mockResolvedValue({ ok: false, error: 'Unauthorized', status: 401 });
    expect((await POST(request())).status).toBe(401);
    expect(mocks.search).not.toHaveBeenCalled();
    expect(mocks.ensure).not.toHaveBeenCalled();
    expect(mocks.record).not.toHaveBeenCalled();
  });
});
