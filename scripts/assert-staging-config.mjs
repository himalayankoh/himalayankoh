export function assertStagingConfig(config) {
  const vars = config.vars ?? {};
  if (config.name !== 'himalayan-koh-ecommerce' ||
      vars.NEXT_PUBLIC_SITE_URL !== 'https://preview.himalayankoh.com' ||
      vars.NEXT_PUBLIC_WORDPRESS_BASE_URL !== 'https://himalayankoh.com/staging' ||
      vars.NEXT_PUBLIC_WOOCOMMERCE_BASE_URL !== 'https://himalayankoh.com/staging' ||
      vars.NEXT_PUBLIC_DATA_SOURCE !== 'woocommerce') {
    throw new Error('Staging deployment refused: Worker or backend target differs from the approved staging configuration.');
  }
  for (const route of config.routes ?? []) {
    const pattern = typeof route === 'string' ? route : route.pattern;
    if (!/^preview\.himalayankoh\.com(?:\/.*)?$/.test(pattern ?? '')) {
      throw new Error('Staging deployment refused: an unapproved route is configured.');
    }
  }
}
