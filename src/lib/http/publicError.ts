/**
 * Server configuration is not narrated to a browser.
 *
 * Several modules here write their failures for an **operator**: they name the
 * environment variable to set. "Check WORDPRESS_ADMIN_USER and
 * WORDPRESS_ADMIN_APP_PASSWORD (create the password under Users → Profile →
 * Application Passwords)" is the right sentence to log and the wrong sentence to
 * return, because a route handler that forwards it puts the deployment's own
 * shape on the public internet.
 *
 * That is not hypothetical. `POST /api/auth/customer/login` is unauthenticated —
 * a shopper must reach it before they exist as a customer — and it was answering
 * `503` with exactly that instruction, word for word, to anyone who asked. It cost
 * nothing to learn the Worker was missing a WordPress credential and which two
 * variables were missing, and the shopper who actually wanted to sign in got an
 * operator's note instead of a sentence about their own account.
 *
 * So the rule at the boundary is: an HTTP body may carry a sentence written for the
 * shopper, never one written for the operator. The operator's sentence goes to the
 * server log, where its audience can read it.
 *
 * Deliberately a substitution rather than a redaction. Blanking the variable names
 * in place leaves something that reads as though a different thing went wrong —
 * "WordPress refused the app credential while checking the customer account. Check
 *  and ." — which is worse for the shopper and no more useful to the operator than
 * the log line it was already written as.
 */

/**
 * An environment-variable name: one all-caps segment followed by at least one more,
 * e.g. `WORDPRESS_ADMIN_USER`, `CUSTOMER_SESSION_SECRET`, `NEXT_PUBLIC_SITE_URL`.
 *
 * The underscore requirement is what keeps this from firing on ordinary prose. A
 * word like `US`, `PDF` or `WordPress` has no underscore, and a shopper-facing
 * sentence that legitimately shouted in capitals with an underscore in it would
 * have to be invented to be caught — so the rule errs toward substituting, which
 * costs a slightly vaguer message rather than leaking a variable name.
 */
const ENVIRONMENT_VARIABLE = /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/;

/** True when a message names something a server deployment configures. */
export function namesServerConfiguration(message: string): boolean {
  return ENVIRONMENT_VARIABLE.test(message);
}

/**
 * The message a browser may receive, given the one a server module produced.
 *
 * Returns the message unchanged when it is already shopper-safe — most failures
 * are, and rewriting those would cost the app its honest error reporting. When it
 * names configuration, the text is logged under `context` (so the diagnostic still
 * exists, with the request it belongs to) and `fallback` is returned.
 *
 * `fallback` must be a complete sentence about the shopper's situation, not a
 * restatement of the failure: they cannot act on the internal cause, so the useful
 * thing to say is whether to retry and who to ask.
 */
export function publicMessage(options: {
  /** The text a server module produced, which may name configuration. */
  internal: string;
  /** The sentence the caller gets when `internal` names configuration. */
  fallback: string;
  /** Log prefix identifying the surface, e.g. `customer-login`. */
  context: string;
}): string {
  const internal = options.internal.trim();
  if (!namesServerConfiguration(internal)) return internal;

  console.error(`[${options.context}] configuration detail withheld from the response: ${internal}`);
  return options.fallback;
}
