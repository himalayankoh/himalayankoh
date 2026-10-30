/**
 * The caller's IP address, as this deployment can actually trust it.
 *
 * `cf-connecting-ip` first, because on Cloudflare Workers the edge sets it and a
 * client cannot forge it — Cloudflare overwrites whatever the request carried. Any
 * other header is client-supplied and therefore forgeable, which for a rate-limit key
 * means an attacker who can rotate the header can rotate their own bucket.
 *
 * `x-forwarded-for` is the fallback, and its **first** entry is the one taken, because
 * that is the convention the rest of the app already uses and the only one that makes
 * sense when Cloudflare is not in front (local `wrangler dev`, `next dev`). On a
 * request that reaches the origin the header is appended to, so the first entry is the
 * original client and every later entry is infrastructure this app already trusts.
 *
 * Returns `'unknown'` rather than an empty string when neither header is present, so
 * callers that build a rate-limit key from it get one shared bucket for anonymous
 * traffic instead of a key that is accidentally equal to a real one. That is the safe
 * direction: a shared bucket throttles harder, not less.
 *
 * Only a value with no separators or whitespace is accepted for the Cloudflare header;
 * a header that carries anything else is not something the edge produced, and treating
 * it as an address would let a caller steer its own rate-limit key.
 */
const IP_PATTERN = /^[0-9a-f.:]{3,45}$/i;

export function clientIp(request: Request): string {
  const direct = (request.headers.get('cf-connecting-ip') || '').trim();
  if (IP_PATTERN.test(direct)) return direct;

  const forwarded = (request.headers.get('x-forwarded-for') || '').split(',')[0]?.trim() || '';
  if (IP_PATTERN.test(forwarded)) return forwarded;

  const real = (request.headers.get('x-real-ip') || '').trim();
  if (IP_PATTERN.test(real)) return real;

  return 'unknown';
}
