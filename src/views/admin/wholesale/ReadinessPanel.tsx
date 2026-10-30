'use client';

import { useMemo } from 'react';
import { ArrowRight } from 'lucide-react';
import type { WholesaleWorkspace } from '@/lib/admin/wholesaleConsoleApi';
import { consoleReadiness } from '@/lib/wholesale/consoleReadiness';
import { Notice, Panel } from './ui';

/**
 * The one screen that answers "what is still missing, and where do I type it?".
 *
 * ## Why it is a screen rather than a badge
 *
 * Each wholesale panel knows its own gap — the calculator says no cost profile, the quote
 * builder says no freight rate — but the owner meets those one at a time, after trying to
 * use the screen. Readiness puts every gap in one place, in the order that unblocks the
 * most, with the exact fields to enter and a link to the form.
 *
 * ## Nothing is hardcoded
 *
 * The list is computed from the loaded workspace by `consoleReadiness`, so it empties
 * itself as records are added, and it cannot claim a screen works while that screen is
 * refusing to price. Adding a cost profile and reloading is the whole loop.
 *
 * ## Problems it does not own
 *
 * Only owner-entered data is listed. A screen blocked by an account (an AI provider out
 * of credit) or by a missing API key reports that on its own panel, because sending the
 * owner to a form here would not fix it.
 */
export function ReadinessPanel({
  workspace,
  onGoTo,
}: {
  workspace: WholesaleWorkspace;
  onGoTo: (tab: string) => void;
}) {
  const readiness = useMemo(() => consoleReadiness(workspace), [workspace]);
  const { complete, total } = readiness.packaging;
  const pct = total ? Math.round((complete / total) * 100) : 0;

  return (
    <Panel
      title="Readiness"
      description="What is still missing before every wholesale screen can answer with the owner's own numbers, and exactly where to type each one. Nothing here is stored data — it is measured from the records on every load, so it empties as you fill the forms in."
    >
      <div className="space-y-5">
        {total > 0 ? (
          <div>
            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
              <p className="text-sm font-semibold text-charcoal">
                Packaging: {complete} of {total} product{total === 1 ? '' : 's'} measured
              </p>
              {complete < total ? (
                <button
                  type="button"
                  onClick={() => onGoTo('products')}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-himalayan hover:underline"
                >
                  Fill in packaging
                  <ArrowRight className="w-3 h-3" />
                </button>
              ) : null}
            </div>
            <div
              className="h-2 rounded-full bg-charcoal/5 overflow-hidden"
              role="progressbar"
              aria-valuenow={complete}
              aria-valuemin={0}
              aria-valuemax={total}
              aria-label="Products with measured packaging"
            >
              <div
                className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-green-500' : 'bg-himalayan'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        ) : null}

        {readiness.complete ? (
          <Notice kind="success" title="Every wholesale screen has what it needs">
            Packaging, cost profiles, rates and the buyer list are all in place, so a
            quotation, a pallet count and a container plan use your own figures throughout.
          </Notice>
        ) : (
          <ul className="space-y-3">
            {readiness.requirements.map((requirement) => (
              <li
                key={requirement.key}
                className="rounded-xl border border-charcoal/10 bg-warm-white/50 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-charcoal">{requirement.screen}</p>
                    <p className="text-xs text-charcoal-light mt-1">{requirement.missing}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onGoTo(requirement.tab)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-himalayan hover:underline shrink-0"
                  >
                    Open {requirement.screen}
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>

                <p className="text-xs font-semibold text-charcoal mt-3">What to enter</p>
                <ul className="mt-1 space-y-1">
                  {requirement.toEnter.map((line) => (
                    <li key={line} className="text-xs text-charcoal-light leading-relaxed">
                      • {line}
                    </li>
                  ))}
                </ul>

                <p className="text-xs font-semibold text-charcoal mt-3">Until then, incomplete in</p>
                <ul className="mt-1 space-y-1">
                  {requirement.blocks.map((line) => (
                    <li key={line} className="text-xs text-charcoal-light leading-relaxed">
                      • {line}
                    </li>
                  ))}
                </ul>

                {requirement.caveat ? (
                  <div className="mt-3">
                    <Notice kind="warn">{requirement.caveat}</Notice>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        <div>
          <p className="text-xs font-semibold text-charcoal mb-2">Already in place</p>
          <ul className="space-y-1">
            {readiness.working.map((line) => (
              <li key={line} className="text-xs text-charcoal-light leading-relaxed">
                • {line}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Panel>
  );
}
