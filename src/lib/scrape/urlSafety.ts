/**
 * SSRF guard for every server-side page fetch.
 *
 * `/api/fetch-page` and the image resolver take a URL from an admin and ask the
 * server to fetch it. Without a guard that is a request-forgery primitive: the
 * caller could point the server at its own loopback, its private network, or a
 * cloud metadata endpoint, and read the response back through the API.
 *
 * The rule is an allow-list of shape plus a deny-list of destinations:
 *   - only http/https,
 *   - no embedded credentials (`https://user:pass@host`),
 *   - the host must be a public name or a public IP — never loopback, private,
 *     link-local, CGNAT or a metadata service.
 *
 * A hostname that is not an IP literal is not resolved here: DNS rebinding is
 * out of scope for a single fetch, the cost of a synchronous resolve on every
 * request is not, and Cloudflare Workers (where staging runs) cannot make raw
 * TCP connections to a rebindable address anyway.
 */

export interface UrlSafety {
  ok: boolean;
  /** Normalized absolute URL (empty when not ok). */
  url: string;
  reason: string;
}

/** Well-known private / reserved IPv4 ranges, as first-octet pairs. */
function isPrivateIpv4(host: string): boolean {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  if ([a, b, Number(m[3]), Number(m[4])].some((n) => n > 255)) return true;
  if (a === 0 || a === 10 || a === 127) return true; // this-network, private, loopback
  if (a === 169 && b === 254) return true; // link-local incl. 169.254.169.254 metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a >= 224) return true; // multicast + reserved
  return false;
}

const BLOCKED_HOST_NAMES = [
  /^localhost$/i,
  /\.localhost$/i,
  /\.local$/i,
  /\.internal$/i,
  /\.home\.arpa$/i,
  /^metadata\.google\.internal$/i,
];

function isBlockedHostname(host: string): boolean {
  return BLOCKED_HOST_NAMES.some((re) => re.test(host));
}

/** Accepts "himalayankoh.com/shop/" as well as a full URL. */
export function normalizeToHttpUrl(raw: string): string {
  const trimmed = (raw || '').trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed; // some other scheme — left for the guard to reject
  return `https://${trimmed}`;
}

/** Decide whether the server is allowed to fetch this URL. */
export function checkFetchableUrl(raw: string): UrlSafety {
  const normalized = normalizeToHttpUrl(raw);
  if (!normalized) return { ok: false, url: '', reason: 'A URL is required.' };

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    return { ok: false, url: '', reason: 'That is not a valid absolute URL.' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, url: '', reason: `Only http and https may be fetched (got "${parsed.protocol}").` };
  }
  if (parsed.username || parsed.password) {
    return { ok: false, url: '', reason: 'URLs carrying embedded credentials are refused.' };
  }

  const host = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!host) return { ok: false, url: '', reason: 'The URL has no host.' };

  if (isBlockedHostname(host)) {
    return { ok: false, url: '', reason: `Refusing to fetch a local host ("${host}").` };
  }
  // IPv6 loopback/unique-local/link-local.
  if (/^::1$/.test(host) || /^f[cd][0-9a-f]{2}:/i.test(host) || /^fe80:/i.test(host)) {
    return { ok: false, url: '', reason: `Refusing to fetch a private address ("${host}").` };
  }
  if (isPrivateIpv4(host)) {
    return { ok: false, url: '', reason: `Refusing to fetch a private address ("${host}").` };
  }

  return { ok: true, url: parsed.toString(), reason: '' };
}
