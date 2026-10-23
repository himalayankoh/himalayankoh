import { describe, expect, it } from 'vitest';
import { applicationPolicyProblem, approvalProblem } from './applicationPolicy';
const valid = { country: 'United States', privacyAccepted: true, declaration: { accepted: true, signedName: 'Owner', signedAt: '2026-01-01' } };
describe('wholesale applicant authorization prerequisites', () => {
  it('requires a privacy acknowledgement and signed declaration on the server', () => {
    expect(applicationPolicyProblem(valid)).toBeNull();
    expect(applicationPolicyProblem({ ...valid, privacyAccepted: false })).toMatch(/Privacy/);
    expect(applicationPolicyProblem({ ...valid, declaration: { accepted: false } })).toMatch(/Sign/);
  });
  it('rejects incomplete shipping and non-US business addresses', () => {
    expect(applicationPolicyProblem({ ...valid, country: 'Canada' })).toMatch(/United States/);
    expect(applicationPolicyProblem({ ...valid, shipping: { city: 'Houston' } })).toMatch(/shipping/);
  });
  it('does not approve an unverified or expired application', () => {
    expect(approvalProblem({ declaration_name: 'Owner', declaration_at: '2026-01-01' })).toMatch(/email/);
    expect(approvalProblem({ email_verified_at: '2026-01-01', declaration_name: 'Owner', declaration_at: '2026-01-01', resale_expires: '2020-01-01' })).toMatch(/expired/);
    expect(approvalProblem({ email_verified_at: '2026-01-01', declaration_name: 'Owner', declaration_at: '2026-01-01' })).toBeNull();
  });
});
