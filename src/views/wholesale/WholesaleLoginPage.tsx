'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useNavigate, useSearchParams } from '@/lib/router-compat';
import { AlertCircle, ArrowRight, Loader2, LogIn } from 'lucide-react';
import { getWholesaleSession, signInWholesale } from '@/lib/wholesale/portalClient';

/**
 * The wholesale portal's sign-in.
 *
 * ## Why this is not the shop's sign-in
 *
 * A buyer who signs in here is not a shopper with a bigger basket: they are a trade
 * account whose quotations, tier prices and freight must not be readable by a retail
 * session. So this screen writes a wholesale session under its own key, and the two
 * never see each other.
 *
 * ## The answer when there is no account is specific
 *
 * "Wrong password" and "your application is still under review" are different problems
 * for the person reading them, and the server distinguishes them
 * (`applicationStatus`). This screen shows the server's own sentence rather than
 * flattening both into "sign-in failed", because the second one is not a mistake the
 * buyer made.
 *
 * ## Already signed in?
 *
 * A buyer with a live session is sent straight to the portal instead of being shown a
 * form they do not need.
 */

export default function WholesaleLoginPage() {
  const navigate = useNavigate();
  // The shim returns the tuple `react-router-dom` does, not the bare params object.
  const [params] = useSearchParams();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const requested = params?.get('next') || '';
  // Only a path on this site is accepted as a return target: an absolute URL would
  // let a link to the sign-in page turn it into an open redirect.
  const next = requested.startsWith('/') && !requested.startsWith('//') ? requested : '/wholesale/portal';

  useEffect(() => {
    if (getWholesaleSession()) navigate(next, { replace: true });
  }, [navigate, next]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      await signInWholesale(login, password);
      navigate(next, { replace: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Sign-in did not work. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const input =
    'w-full px-4 py-2.5 rounded-xl border border-charcoal/15 bg-white text-charcoal placeholder:text-charcoal-light/50 focus:outline-none focus:ring-2 focus:ring-himalayan/40 focus:border-himalayan';

  return (
    <div className="min-h-screen bg-warm-white flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="font-serif text-3xl font-bold text-charcoal mb-2">Wholesale sign-in</h1>
          <p className="text-charcoal-light">Tier pricing, container planning and your quotations.</p>
        </div>

        <form onSubmit={submit} className="bg-white rounded-3xl border border-charcoal/8 shadow-sm p-7 md:p-8">
          <label className="block text-sm font-medium text-charcoal mb-1.5" htmlFor="login">
            Business email
          </label>
          <input
            id="login"
            type="email"
            autoComplete="username"
            className={`${input} mb-4`}
            value={login}
            onChange={(event) => setLogin(event.target.value)}
          />

          <label className="block text-sm font-medium text-charcoal mb-1.5" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            className={`${input} mb-5`}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />

          {error ? (
            <div
              role="alert"
              className="flex items-start gap-3 p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 mb-5"
            >
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <p className="text-sm leading-relaxed">{error}</p>
            </div>
          ) : null}

          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center justify-center gap-2 w-full px-6 py-3.5 bg-himalayan text-white rounded-full font-semibold hover:bg-himalayan-dark transition-colors disabled:opacity-60"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>

          <p className="text-sm text-charcoal-light mt-5">
            No wholesale account yet?{' '}
            <Link href="/wholesale/apply" className="text-himalayan font-semibold hover:underline inline-flex items-center gap-1">
              Apply for one <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </p>
        </form>

        <p className="text-center text-sm text-charcoal-light mt-6">
          Shopping as an individual?{' '}
          <Link href="/account" className="text-himalayan font-semibold hover:underline">
            Use the shop account
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
