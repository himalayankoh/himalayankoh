'use client';

/**
 * The staging-only "Test Payment" panel.
 *
 * It looks like a card form because the point is to exercise the real checkout, and
 * it says what it is because a form that looked like a card form without saying so
 * would be a trap: the badge, the heading and the copy all name the simulator, and
 * no network card mark is shown anywhere.
 *
 * What the fields are for: the test card number decides the outcome, and the expiry
 * and CVC exist so the panel behaves like the field set a shopper would meet. None of
 * the three is ever posted, stored or logged — `classifyTestCard` runs in this
 * component and only `success` or `decline` leaves it.
 */

import { useState } from 'react';
import { CreditCard, Loader2 } from 'lucide-react';
import {
  STAGING_ONLY_BADGE,
  STAGING_TEST_CARDS,
  classifyTestCard,
  formatTestCardNumber,
  type StagingTestOutcome,
} from '../../lib/payments/stagingSimulator';

interface StagingTestPaymentFormProps {
  amountLabel: string;
  disabled?: boolean;
  onPay: (outcome: StagingTestOutcome) => void | Promise<void>;
  /** Fills the checkout with the fake QA customer, so no real person is used. */
  onUseTestCustomer?: () => void;
}

const INPUT =
  'w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm text-charcoal focus:outline-none focus:ring-2 focus:ring-himalayan/30 focus:border-himalayan transition-all';
const LABEL = 'block text-xs font-semibold text-charcoal mb-1.5';

export default function StagingTestPaymentForm({
  amountLabel,
  disabled,
  onPay,
  onUseTestCustomer,
}: StagingTestPaymentFormProps) {
  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvc, setCvc] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handlePay = async () => {
    const kind = classifyTestCard(cardNumber);
    if (kind === 'unsupported') {
      setError(
        `Use ${formatTestCardNumber(STAGING_TEST_CARDS.success)} to complete a test payment, or ` +
          `${formatTestCardNumber(STAGING_TEST_CARDS.decline)} to see a decline.`,
      );
      return;
    }
    if (!/^\d{2}\s*\/\s*\d{2}$/.test(expiry.trim())) {
      setError('Enter a test expiry date as MM/YY — any future date works.');
      return;
    }
    if (!/^\d{3,4}$/.test(cvc.trim())) {
      setError('Enter any 3-digit test security code.');
      return;
    }
    setError(null);
    await onPay(kind);
  };

  const fill = (value: string) => {
    setCardNumber(formatTestCardNumber(value));
    setExpiry('12/34');
    setCvc('123');
    setError(null);
  };

  return (
    <div className="mt-5 rounded-2xl border border-amber-300 bg-[#fffaf0] p-4 shadow-sm sm:p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h3 className="font-serif text-lg font-bold text-charcoal">Test Payment</h3>
          <p className="text-xs text-charcoal-light mt-1">
            No real money will be charged. This is a staging-only simulator: no Stripe
            account, no card network, and no real payment is involved.
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-amber-300 bg-amber-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-900">
          {STAGING_ONLY_BADGE}
        </span>
      </div>

      <div className="mt-4 flex items-center gap-2 text-sm">
        <CreditCard size={16} className="text-himalayan" />
        <span className="font-semibold text-charcoal">Test Card</span>
      </div>

      <div className="mt-3 space-y-3">
        <div>
          <label className={LABEL} htmlFor="stagingTestCardNumber">
            Test card number
          </label>
          <input
            id="stagingTestCardNumber"
            name="stagingTestCardNumber"
            className={INPUT}
            inputMode="numeric"
            autoComplete="off"
            spellCheck={false}
            placeholder="4242 4242 4242 4242"
            value={cardNumber}
            disabled={disabled}
            onChange={(event) => {
              setCardNumber(formatTestCardNumber(event.target.value));
              setError(null);
            }}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={LABEL} htmlFor="stagingTestCardExpiry">
              Expiry (MM/YY)
            </label>
            <input
              id="stagingTestCardExpiry"
              name="stagingTestCardExpiry"
              className={INPUT}
              inputMode="numeric"
              autoComplete="off"
              placeholder="12/34"
              value={expiry}
              disabled={disabled}
              onChange={(event) => setExpiry(event.target.value.replace(/[^\d/]/g, '').slice(0, 5))}
            />
          </div>
          <div>
            <label className={LABEL} htmlFor="stagingTestCardCvc">
              Security code
            </label>
            <input
              id="stagingTestCardCvc"
              name="stagingTestCardCvc"
              className={INPUT}
              inputMode="numeric"
              autoComplete="off"
              placeholder="123"
              value={cvc}
              disabled={disabled}
              onChange={(event) => setCvc(event.target.value.replace(/\D/g, '').slice(0, 4))}
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => fill(STAGING_TEST_CARDS.success)}
            disabled={disabled}
            className="px-3 py-1.5 rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-800 text-xs font-semibold hover:bg-emerald-100 disabled:opacity-50"
          >
            Fill success card
          </button>
          <button
            type="button"
            onClick={() => fill(STAGING_TEST_CARDS.decline)}
            disabled={disabled}
            className="px-3 py-1.5 rounded-lg border border-rose-300 bg-rose-50 text-rose-800 text-xs font-semibold hover:bg-rose-100 disabled:opacity-50"
          >
            Fill decline card
          </button>
          {onUseTestCustomer && (
            <button
              type="button"
              onClick={onUseTestCustomer}
              disabled={disabled}
              className="px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-charcoal text-xs font-semibold hover:bg-gray-50 disabled:opacity-50"
            >
              Use staging test customer
            </button>
          )}
        </div>

        {error && <p role="alert" className="text-xs text-red-700">{error}</p>}

        <p className="text-[11px] text-charcoal-light">
          The card number, expiry and security code never leave this page — they are not sent to
          Stripe, this store, or anywhere else. The number only picks a simulated result.
        </p>

        <button
          type="button"
          onClick={() => void handlePay()}
          disabled={disabled}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-himalayan px-4 py-4 font-semibold text-white transition-colors hover:bg-himalayan-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-himalayan disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          {disabled && <Loader2 size={18} className="animate-spin" />}
          {disabled ? 'Processing test payment…' : `Test pay ${amountLabel}`}
        </button>
      </div>
    </div>
  );
}
