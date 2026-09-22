/**
 * The inference behind `npm run diagnose:store-products` — pure, so it can be
 * tested without a WordPress host.
 *
 * The script does the I/O; this module decides what the responses *mean*. That
 * split matters here because the whole value of the diagnostic is the inference:
 * the same HTTP 500 is a bad product record, a broken query path, a broken
 * per-product serialiser, or a version mismatch, and a wrong reading sends you at
 * the wrong fix. Keeping the rules pure means every pattern can be asserted with
 * fabricated responses instead of waiting for a real host to reproduce it.
 *
 * Plain ESM rather than TypeScript, like the sibling `wordpressFatal.mjs`: the
 * diagnostic runs directly under Node with no build step.
 *
 * A "probe" below is one recorded HTTP response: `{ status, fatal, items,
 * transport? }` plus whatever label the caller adds. `items` is the length of a
 * JSON array body, and `null` for anything else — including a single object, which
 * is always a response *about* a product rather than a list of them.
 */

/**
 * The one word that says what happened.
 *
 * EMPTY is deliberately distinct from PASS: a 200 with an empty array means no
 * product was serialised, so it is evidence about the query and never about the
 * per-product response builder. Collapsing the two is how a diagnostic concludes
 * "some parameters work" from requests that never built anything.
 */
export function verdict(probe) {
  if (probe.transport) return 'UNREACHABLE';
  if (probe.fatal) return 'FATAL';
  if (probe.status === 404) return 'NO ROUTE';
  if (probe.status === 401 || probe.status === 403) return 'AUTH';
  if (probe.status >= 200 && probe.status < 300) return probe.items === 0 ? 'EMPTY' : 'PASS';
  if (probe.status >= 500) return 'ERROR';
  return `HTTP ${probe.status}`;
}

/** True when the probe is a 2xx of any kind, empty result sets included. */
export const answers = (probe) => probe.status >= 200 && probe.status < 300;

/** A 2xx that contained no items, so nothing was built from the result set. */
export const isEmpty = (probe) => answers(probe) && probe.items === 0;

/**
 * Reads the evidence into one pattern plus the findings that support it.
 *
 * Patterns, most specific first:
 *   healthy          nothing product-shaped fails any more
 *   data-dependent   some products answer and others do not → fix those records
 *   query-dependent  some query that matched products answers → the query path
 *   product-builder  every request that builds a product fails while every request
 *                    that matches nothing answers → the per-product serialiser
 *   mixed            none of the above cleanly, so the log has to say
 *
 * @param {{
 *   products: object,
 *   productsHtml: object,
 *   siblings: { answering: number, total: number },
 *   queryRoutesAnswer: boolean,
 *   parameterProbes: object[],
 *   idProbes: object[],
 *   environment?: { available: boolean, woocommerce?: string, wordpress?: string, php?: string },
 * }} evidence
 */
export function summarize(evidence) {
  const { products, productsHtml, siblings, queryRoutesAnswer, parameterProbes, idProbes, environment } = evidence;

  const fatalIds = idProbes.filter((probe) => probe.fatal);
  const passingIds = idProbes.filter(answers);
  const nonEmptyFailures = parameterProbes.filter((probe) => probe.fatal);
  const emptyPasses = parameterProbes.filter(isEmpty);
  const matchedNothing = parameterProbes.filter((probe) => !answers(probe) && !probe.fatal);
  const nonEmptyPasses = parameterProbes.filter((probe) => answers(probe) && probe.items > 0);
  const productRoutesAnswer = answers(products) && answers(productsHtml);

  let pattern;
  if (productRoutesAnswer && !fatalIds.length) {
    pattern = 'healthy';
  } else if (fatalIds.length && passingIds.length) {
    pattern = 'data-dependent';
  } else if (nonEmptyPasses.length) {
    pattern = 'query-dependent';
  } else if (nonEmptyFailures.length && emptyPasses.length && queryRoutesAnswer) {
    pattern = 'product-builder';
  } else {
    pattern = 'mixed';
  }

  const findings = [];

  if (products.fatal || productsHtml.fatal) {
    const browserShape = productsHtml.html
      ? 'the `wp_die` page titled "WordPress › Error"'
      : 'the critical-error page';
    const jsonShape = products.html
      ? 'the same page'
      : `the JSON envelope \`${products.envelope || 'internal_server_error'}\``;
    findings.push(
      `It is a real PHP fatal, not a validation error: HTTP ${productsHtml.status || products.status} with ${browserShape} for a request that does not ask for JSON, and ${jsonShape} when Accept asks for JSON — one failure, two renderings, chosen by the Accept header.`
    );
  } else {
    findings.push('No fatal was observed on the products route during this run.');
  }

  findings.push(
    `Scope: ${siblings.answering}/${siblings.total} sibling Store API routes answer, so WooCommerce and the REST stack are loaded and healthy${
      siblings.answering === siblings.total && siblings.total > 0
        ? ' — the failure is confined to routes that return a product'
        : ' — see the Stage 2 lines for which ones did not'
    }.`
  );

  if (products.fatal || productsHtml.fatal) {
    findings.push(
      queryRoutesAnswer
        ? 'The product query is NOT the trigger: collection-data runs the same product query — including price aggregation over the whole catalogue — and answers 200.'
        : 'A product-query route also failed, so the query itself has to be considered, not just the per-product response.'
    );
  }

  if (pattern === 'product-builder') {
    findings.push(
      `The trigger is per-product serialisation, and the proof is a pair rather than an inference. Queries that match no products (${emptyPasses
        .map((probe) => probe.label)
        .join('; ')}) answer 200 \`[]\`, so an empty result set provably does not fail; every query that matches at least one product fails (${nonEmptyFailures.length} of ${parameterProbes.length}), including \`_fields=id\`, so the item is built before any field is filtered. Nothing about the query, the parameters or the requested fields changes the outcome — only whether a product has to be built.`
    );
  } else if (pattern === 'data-dependent') {
    findings.push(
      `Product data is implicated: ${fatalIds.length} of ${idProbes.length} ids fail while ${passingIds.length} answer (${passingIds
        .map((probe) => probe.id)
        .slice(0, 8)
        .join(', ')}), and the split cannot come from the route, which is identical for both.`
    );
  } else if (pattern === 'query-dependent') {
    findings.push(
      `A query that matched products answered (${nonEmptyPasses.map((probe) => probe.label).join('; ')}), so one query path is healthy while others are not — the trigger depends on the query, not on building a product per se.`
    );
  } else if (pattern === 'mixed') {
    findings.push(
      nonEmptyFailures.length
        ? 'Every request that matched a product failed, including ones that match nothing, so the trigger is upstream of per-product serialisation and the log is needed to place it.'
        : 'No product-shaped request failed, so there is nothing here to explain.'
    );
  }

  if (idProbes.length) {
    findings.push(
      passingIds.length
        ? `Product data IS implicated: ${fatalIds.length} of ${idProbes.length} ids fail, spanning every product type in the catalogue (${[
            ...new Set(idProbes.filter((probe) => probe.fatal).map((probe) => probe.type)),
          ].join('/')}).`
        : `Product data is NOT implicated: all ${idProbes.length} ids fail, spanning every product type in the catalogue (${[
            ...new Set(idProbes.map((probe) => probe.type)),
          ].join('/')}) — a per-product data problem could not be this uniform.`
    );
  }

  if (matchedNothing.length) {
    findings.push(
      `${matchedNothing.length} probe(s) answered neither with products nor with a fatal (${matchedNothing
        .map((probe) => `${probe.label} → ${verdict(probe)}`)
        .join('; ')}), which this diagnostic does not explain.`
    );
  }

  if (environment?.available) {
    findings.push(
      `Environment: WooCommerce ${environment.woocommerce} on WordPress ${environment.wordpress}, PHP ${environment.php}.`
    );
  }

  return { pattern, findings };
}
