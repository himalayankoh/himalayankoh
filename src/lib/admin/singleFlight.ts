/**
 * Share one in-flight call between concurrent callers.
 *
 * Two screens asking for the same read at the same time should not cost two
 * requests. A single screen asking twice — as the products screen did, because
 * `listCategories()` derives its list from `listProducts()` — cost two identical
 * reads of the WooCommerce catalog (measured on staging: two requests, ~1.3s
 * each) for one answer.
 *
 * The holder is cleared the moment the call settles, on success **and** on
 * failure, so this coalesces concurrent callers only. It is deliberately not a
 * cache: a later, explicit reload must read again rather than render a list that
 * predates the edit the admin just saved.
 */
export function singleFlight<T>(): (run: () => Promise<T>) => Promise<T> {
  let inFlight: Promise<T> | null = null;

  return (run) => {
    if (inFlight) return inFlight;
    const shared = run();
    inFlight = shared;
    const clear = () => {
      if (inFlight === shared) inFlight = null;
    };
    // `finally` keeps the clearing off the returned chain's rejection path, so a
    // failed read clears the holder without an unhandled rejection of its own.
    shared.then(clear, clear);
    return shared;
  };
}
