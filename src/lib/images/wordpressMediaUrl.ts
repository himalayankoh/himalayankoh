/** Keep the original uploads path; the storefront apex no longer serves WordPress. */
export function wordpressMediaUrl(value: string): string {
  const raw = value.trim();
  try {
    const url = new URL(raw);
    if (['himalayankoh.com', 'www.himalayankoh.com', 'wp.himalayankoh.com'].includes(url.hostname) &&
        /^\/(?:staging\/)?wp-content\/uploads\//.test(url.pathname)) {
      url.protocol = 'https:';
      url.hostname = 'wp.himalayankoh.com';
      url.port = '';
      url.pathname = url.pathname.replace(/^\/staging\//, '/');
      return url.toString();
    }
  } catch { /* Relative app assets and other origins are left alone. */ }
  return raw;
}
