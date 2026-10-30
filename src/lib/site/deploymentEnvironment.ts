export type DeploymentEnvironment = 'production' | 'staging' | 'unknown';

export function getDeploymentEnvironment(
  siteUrl = process.env.NEXT_PUBLIC_SITE_URL,
  nodeEnv = process.env.NODE_ENV,
): DeploymentEnvironment {
  const origin = (siteUrl || '').trim().replace(/\/+$/, '').toLowerCase();
  if (origin === 'https://himalayankoh.com') return 'production';
  if (origin === 'https://preview.himalayankoh.com') return 'staging';
  return nodeEnv === 'production' ? 'unknown' : 'staging';
}
