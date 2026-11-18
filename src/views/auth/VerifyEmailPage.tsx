import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Check, AlertTriangle, Loader2 } from 'lucide-react';
import { requestVerificationEmail, verifyCustomerEmail } from '../../lib/auth/customerClient';

/**
 * The page the confirmation link opens.
 *
 * WordPress puts `login` and `key` in the link, and the plugin is the only thing
 * that can judge the key — so this page posts both once and shows the answer. It
 * does not sign anyone in: confirmation makes the next sign-in work, which keeps
 * an inbox link from being a credential on its own.
 *
 * The `started` ref keeps the effect from spending the single-use key twice when
 * React runs it again; a repeat call for a confirmed account is a success in the
 * plugin, but there is no reason to send the same link twice.
 */
type VerifyState = 'checking' | 'success' | 'error';

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams();

  const login = (searchParams.get('login') ?? '').trim();
  const key = (searchParams.get('key') ?? '').trim();

  const [state, setState] = useState<VerifyState>('checking');
  const [message, setMessage] = useState('');
  const [resendLogin, setResendLogin] = useState(login);
  const [resendState, setResendState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [resendMessage, setResendMessage] = useState('');
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    // The router's params are empty on the first client render of this static
    // route, so a real link looked like "missing key" and was never posted. The
    // address bar is the same source the link came from, and it is populated.
    const params = new URLSearchParams(window.location.search);
    const linkLogin = (params.get('login') || login || '').trim();
    const linkKey = (params.get('key') || key || '').trim();

    setResendLogin(linkLogin);

    if (!linkLogin || !linkKey) {
      setMessage(
        'This link is missing its account or confirmation key. Open the link from your email again, or contact ws@himalayankoh.com.'
      );
      setState('error');
      return;
    }

    // The answer is applied even if React has already run the effect's cleanup:
    // the page is still the one on screen, and dropping it is what left a
    // successful confirmation showing "Confirming your email" forever.
    (async () => {
      try {
        await verifyCustomerEmail(linkLogin, linkKey);
        setState('success');
      } catch (err) {
        setMessage(
          err instanceof Error
            ? err.message
            : 'This confirmation link is invalid or has expired.'
        );
        setState('error');
      }
    })();
  }, [login, key]);

  const handleResend = async (event: React.FormEvent) => {
    event.preventDefault();
    setResendState('sending');
    setResendMessage('');
    try {
      setResendMessage(await requestVerificationEmail(resendLogin));
      setResendState('sent');
    } catch (err) {
      setResendMessage(err instanceof Error ? err.message : 'Could not send a new link.');
      setResendState('error');
    }
  };

  if (state === 'checking') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-cream via-white to-himalayan-lighter flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-xl shadow-black/5 p-8 max-w-md w-full text-center">
          <Loader2 size={32} className="animate-spin text-himalayan mx-auto mb-6" />
          <h1 className="font-serif text-2xl font-bold text-charcoal mb-2">Confirming your email</h1>
          <p className="text-charcoal-light">This only takes a moment.</p>
        </div>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-cream via-white to-himalayan-lighter flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white rounded-3xl shadow-xl shadow-black/5 p-8 max-w-md w-full text-center"
        >
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <AlertTriangle size={32} className="text-red-500" />
          </div>
          <h1 className="font-serif text-2xl font-bold text-charcoal mb-2">We could not confirm that link</h1>
          <p className="text-charcoal-light mb-6">{message}</p>
          <form onSubmit={handleResend} className="space-y-3 text-left">
            <label htmlFor="resend-login" className="block text-sm font-medium text-charcoal">
              Send a new link
            </label>
            <input
              id="resend-login"
              type="text"
              required
              value={resendLogin}
              onChange={(event) => setResendLogin(event.target.value)}
              placeholder="you@example.com or your username"
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-charcoal focus:outline-none focus:ring-2 focus:ring-himalayan/30 focus:border-himalayan transition-all"
            />
            <button
              type="submit"
              disabled={resendState === 'sending'}
              className="inline-flex w-full items-center justify-center gap-2 px-6 py-3 bg-himalayan hover:bg-himalayan-dark text-white font-semibold rounded-xl transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {resendState === 'sending' && <Loader2 size={18} className="animate-spin" />}
              Email me a new confirmation link
            </button>
            {(resendState === 'sent' || resendState === 'error') && (
              <p
                className={
                  resendState === 'error'
                    ? 'text-sm text-red-600'
                    : 'text-sm text-green-700'
                }
              >
                {resendMessage}
              </p>
            )}
          </form>

          <div className="space-y-3 mt-4">
            <Link
              to="/login"
              className="inline-flex items-center justify-center gap-2 w-full px-6 py-3 border border-gray-200 text-charcoal font-semibold rounded-xl hover:bg-gray-50 transition-colors"
            >
              Back to Login
            </Link>
            <a
              href="mailto:ws@himalayankoh.com"
              className="block text-sm text-charcoal-light hover:text-charcoal"
            >
              Need help? Email ws@himalayankoh.com
            </a>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-cream via-white to-himalayan-lighter flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-3xl shadow-xl shadow-black/5 p-8 max-w-md w-full text-center"
      >
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <Check size={32} className="text-green-600" />
        </div>
        <h1 className="font-serif text-2xl font-bold text-charcoal mb-2">Email confirmed</h1>
        <p className="text-charcoal-light mb-6">
          Your address is confirmed and your account is active. Sign in to track orders and check
          out faster.
        </p>
        <Link
          to="/login"
          className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-himalayan hover:bg-himalayan-dark text-white font-semibold rounded-xl transition-colors"
        >
          Sign In
        </Link>
      </motion.div>
    </div>
  );
}
