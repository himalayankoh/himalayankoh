import { describe, expect, it } from 'vitest';
import { getDeploymentEnvironment } from './deploymentEnvironment';

describe('deployment environment detection', () => {
  it('recognizes the official production and staging origins', () => {
    expect(getDeploymentEnvironment('https://himalayankoh.com', 'production')).toBe('production');
    expect(getDeploymentEnvironment('https://preview.himalayankoh.com/', 'production')).toBe('staging');
  });

  it('does not label an unknown production build as production', () => {
    expect(getDeploymentEnvironment('https://unknown.example', 'production')).toBe('unknown');
  });

  it('uses staging for local development', () => {
    expect(getDeploymentEnvironment('', 'development')).toBe('staging');
  });
});
