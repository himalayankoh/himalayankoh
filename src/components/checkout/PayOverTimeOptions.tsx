import { PAY_OVER_TIME_BRANDS, payOverTimeStatus } from '../../lib/payments/payOverTime';

interface PayOverTimeOptionsProps {
  stripeEnabled: boolean;
  simulatorEnabled: boolean;
}

/**
 * Names the pay-over-time methods under the payment form, and states the one
 * thing it can honestly state about them: whether Stripe is the one deciding.
 *
 * Renders nothing when online payment is off — a strip of brand names under a
 * "payment unavailable" message would be advertising rather than information.
 */
export default function PayOverTimeOptions({
  stripeEnabled,
  simulatorEnabled,
}: PayOverTimeOptionsProps) {
  const status = payOverTimeStatus({ stripeEnabled, simulatorEnabled });
  if (status.state === 'unavailable') return null;

  return (
    <div className="mt-4 rounded-xl border border-himalayan-line/70 bg-warm-white px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="text-[11px] font-bold uppercase tracking-wide text-charcoal-light">
          Pay over time
        </span>
        {PAY_OVER_TIME_BRANDS.map((brand) => (
          <span
            key={brand.id}
            className="rounded-md border border-himalayan-line/70 bg-white px-2 py-0.5 text-xs font-semibold text-charcoal"
          >
            {brand.label}
          </span>
        ))}
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
            status.selectable
              ? 'border border-emerald-300 bg-emerald-50 text-emerald-800'
              : 'border border-gray-300 bg-gray-50 text-charcoal-light'
          }`}
        >
          {status.badge}
        </span>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-charcoal-light">{status.detail}</p>
    </div>
  );
}
