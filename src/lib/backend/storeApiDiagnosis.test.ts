import { describe, expect, it } from 'vitest';
import { answers, isEmpty, summarize, verdict } from '../../../scripts/lib/store-api-diagnosis.mjs';
import { looksLikeHtml, looksLikeWordPressFatal } from './wordpressFatal.mjs';

// The diagnostic's conclusions are only as good as these rules, and the live store
// can only demonstrate one of the four patterns. Fabricated responses let the other
// three be asserted, so a wrong reading cannot ship just because staging happened
// to look a particular way. Types are loose because the module is plain ESM.

type Probe = {
  status: number;
  fatal: boolean;
  items?: number | null;
  transport?: string;
  label?: string;
  id?: number;
  type?: string;
};

const ok = (over: Partial<Probe> = {}): Probe => ({ status: 200, fatal: false, items: 1, ...over });
const failed = (over: Partial<Probe> = {}): Probe => ({ status: 500, fatal: true, items: null, ...over });
/** A 200 with an empty array: the result set never reached the per-product builder. */
const nothing = (label: string): Probe => ({ ...ok({ items: 0 }), label });

/** The shape staging actually shows: every product request fails, empty ones answer. */
function evidence(over: Record<string, unknown> = {}) {
  return {
    products: failed(),
    productsHtml: failed(),
    siblings: { answering: 4, total: 4 },
    queryRoutesAnswer: true,
    parameterProbes: [
      // These match products, so they fail; only the empty ones answer.
      { ...failed(), label: 'no parameters' },
      { ...failed(), label: 'per_page=1' },
      nothing('include=99999999'),
      nothing('per_page=2&page=99'),
    ],
    idProbes: [
      { ...failed(), id: 2497, type: 'simple' },
      { ...failed(), id: 2492, type: 'variable' },
    ],
    environment: { available: true, woocommerce: '7.7.0', wordpress: '6.7.2', php: '7.4.33' },
    ...over,
  };
}

const joined = (findings: string[]) => findings.join('\n');

describe('store API diagnosis', () => {
  it('never reads an empty result set as a query that worked', () => {
    expect(verdict(ok({ items: 0 }))).toBe('EMPTY');
    expect(verdict(ok({ items: 3 }))).toBe('PASS');
    expect(verdict(failed())).toBe('FATAL');
    expect(verdict({ ...failed(), transport: 'timed out' })).toBe('UNREACHABLE');
    // Both are 2xx, which is why the distinction has to live in `isEmpty` as well:
    // a probe that matched nothing says nothing about building a product.
    expect(answers(ok({ items: 0 }))).toBe(true);
    expect(isEmpty(ok({ items: 0 }))).toBe(true);
    expect(isEmpty(ok({ items: 3 }))).toBe(false);
    expect(isEmpty(ok({ items: null }))).toBe(false);
  });

  it('blames per-product serialisation only when requests that match nothing still answer', () => {
    const { pattern, findings } = summarize(evidence());

    expect(pattern).toBe('product-builder');
    expect(joined(findings)).toContain('per-product serialisation');
    // The proof has to name the empty-set probes, or the conclusion is an assertion.
    expect(joined(findings)).toContain('include=99999999');
    expect(joined(findings)).toContain('Product data is NOT implicated');
    expect(joined(findings)).toContain('_fields=id');
  });

  it('stops blaming the serialiser when even an empty result set fails', () => {
    const { pattern, findings } = summarize(
      evidence({
        parameterProbes: [{ ...failed(), label: 'no parameters' }, { ...failed(), items: 0, label: 'include=99999999' }],
      })
    );

    expect(pattern).toBe('mixed');
    expect(joined(findings)).toContain('upstream of per-product serialisation');
    expect(joined(findings)).not.toContain('proof is a pair');
  });

  it('names the failing records when only some products fail', () => {
    const { pattern, findings } = summarize(
      evidence({ idProbes: [{ ...failed(), id: 2497, type: 'simple' }, { ...ok(), id: 2492, type: 'variable' }] })
    );

    expect(pattern).toBe('data-dependent');
    expect(joined(findings)).toContain('2492');
    expect(joined(findings)).not.toContain('Product data is NOT implicated');
  });

  it('prefers the record explanation over the query one when both would fit', () => {
    const { pattern } = summarize(
      evidence({
        idProbes: [{ ...failed(), id: 2497, type: 'simple' }, { ...ok(), id: 2492, type: 'variable' }],
        parameterProbes: [{ ...ok(), label: 'search=rock' }],
      })
    );

    expect(pattern).toBe('data-dependent');
  });

  it('calls one healthy query path query-dependent, without blaming the builder', () => {
    const { pattern, findings } = summarize(
      evidence({ idProbes: [], parameterProbes: [{ ...failed(), label: 'orderby=price' }, { ...ok(), label: 'search=rock' }] })
    );

    expect(pattern).toBe('query-dependent');
    expect(joined(findings)).toContain('search=rock');
    expect(joined(findings)).not.toContain('per-product serialisation');
  });

  it('reports a working route as healthy instead of proposing changes', () => {
    const { pattern, findings } = summarize(
      evidence({
        products: ok(),
        productsHtml: ok(),
        parameterProbes: [{ ...ok(), label: 'no parameters' }],
        idProbes: [{ ...ok(), id: 2497, type: 'simple' }],
      })
    );

    expect(pattern).toBe('healthy');
    expect(joined(findings)).toContain('No fatal was observed');
  });

  it('recognises both renderings of the same fatal, because the Accept header picks one', () => {
    // The two bodies staging returns for the identical failure: the JSON envelope
    // the app requests, and the wp_die page a browser receives.
    const jsonEnvelope = JSON.stringify({
      code: 'internal_server_error',
      message: 'There has been a critical error on this website.',
      data: { status: 500 },
    });
    const wpDiePage =
      '<!DOCTYPE html><html lang="en-US"><head><title>WordPress &rsaquo; Error</title></head>' +
      '<body><p>There has been a critical error on this website.</p></body></html>';

    expect(looksLikeWordPressFatal(jsonEnvelope)).toBe(true);
    expect(looksLikeWordPressFatal(wpDiePage)).toBe(true);
    expect(looksLikeHtml(wpDiePage)).toBe(true);
    // A healthy empty result set must not be mistaken for a fatal.
    expect(looksLikeHtml(jsonEnvelope)).toBe(false);
    expect(looksLikeWordPressFatal('[]')).toBe(false);
    expect(looksLikeWordPressFatal(JSON.stringify([{ id: 2497 }]))).toBe(false);
  });
});
