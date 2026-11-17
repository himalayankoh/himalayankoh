import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Mail, Lock, Eye, EyeOff, Loader2, ArrowLeft, UserRound } from 'lucide-react';
import { useAuthContext } from '../../context/AuthContext';
import { resolvePostLoginDestination } from '../../lib/auth/roleRouting';

/**
 * The development convenience — and only the part of it that is true.
 *
 * This used to advertise two pairs of demo credentials, and both were false. The
 * customer account was never seeded, and the admin password printed here was not
 * the configured account's password: "Use Demo Admin" filled a credential that
 * answered 401, so the page told you to sign in with something that could not
 * work.
 *
 * A password belongs in the account's own record, not in page source, so the
 * honest thing to prefill is the admin *email* — that much is true and public —
 * and to leave the password to whoever holds it.
 *
 * Development builds only. Checking `process.env.NODE_ENV` directly lets the
 * production minifier prove this returns null and strip it.
 */
function devAdminEmail(): string | null {
  if (process.env.NODE_ENV !== 'development') return null;
  return 'admin@himalayankoh.com';
}

const devAdmin = devAdminEmail();

export default function LoginPage() {
  // Prefilled with the admin email in development, and never with a password.
  // The form used to arrive holding a demo customer's password, so the first
  // click of Sign In always failed against Supabase.
  const [email, setEmail] = useState(devAdmin ?? '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState('');

  const { signIn, isAuthenticated, isAdmin, profileLoading } = useAuthContext();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  // `from` arrives as a ?from= query param (see ProtectedRoute/AdminRoute) —
  // falls back to router state for any caller that still passes it that way.
  const from =
    searchParams.get('from') || (location.state as { from?: string })?.from || '/';

  // `from` is where a guard sent them here from — for an account-only page
  // (wishlist, orders, account, admin) that guard fires again immediately on
  // arrival and bounces them straight back to this login page. Guest-safe
  // pages (checkout, home, product pages, ...) don't have that guard, so
  // `from` is fine there.
  const ACCOUNT_ONLY_PREFIXES = ['/account', '/orders', '/wishlist', '/admin'];
  const guestDestination = ACCOUNT_ONLY_PREFIXES.some((prefix) => from.startsWith(prefix))
    ? '/products'
    : from;

  useEffect(() => {
    if (devAdmin && from.startsWith('/admin')) {
      setEmail(devAdmin);
    }
  }, [from]);

  /**
   * Where this sign-in lands, decided by role — never by the address typed.
   *
   * The previous rule compared the email against the *demo* admin address and
   * otherwise fell back to `from`, so a real administrator signed in and
   * arrived at the storefront, while a demo admin only worked in a development
   * build. The role is the only thing that decides it (lib/auth/roleRouting).
   */
  const destination = resolvePostLoginDestination({ isAdmin, from });

  useEffect(() => {
    if (!isAuthenticated) return;
    // The role arrives with the profile row (or the session's role claim).
    // Navigating before it does is how an admin ends up in the customer
    // portal: `isAdmin` is briefly false for everyone.
    if (profileLoading) return;
    navigate(destination, { replace: true });
  }, [isAuthenticated, navigate, destination, profileLoading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setIsSubmitting(true);

    try {
      await signIn({ email, password });
      // The effect above performs the redirect once the role is known.
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Login failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isSigningIn = isSubmitting;

  const fillAdminEmail = () => {
    if (!devAdmin) return;
    setEmail(devAdmin);
    setFormError('');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-cream via-white to-himalayan-lighter flex items-start sm:items-center justify-center px-4 py-8 sm:py-0">
      <div className="w-full max-w-md">
        {/* Back to Home */}
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-charcoal-light hover:text-charcoal mb-8 transition-colors"
        >
          <ArrowLeft size={18} />
          Back to Home
        </Link>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-3xl shadow-xl shadow-black/5 p-6 sm:p-8"
        >
          {/* Logo */}
          <div className="text-center mb-8">
            <img
              src="/logo.svg"
              alt="Himalayan Koh"
              className="h-14 mx-auto mb-4"
            />
            <h1 className="font-serif text-2xl font-bold text-charcoal">Welcome Back</h1>
            <p className="text-charcoal-light text-sm mt-1">Sign in to your account</p>
          </div>

          <button
            type="button"
            onClick={() => navigate(guestDestination, { replace: true })}
            className="w-full flex items-center justify-center gap-2 py-3.5 mb-6 rounded-xl border-2 border-himalayan text-himalayan font-semibold hover:bg-himalayan-lighter transition-colors"
          >
            <UserRound size={18} />
            Continue as Guest
          </button>
          <p className="text-center text-xs text-charcoal-light -mt-4 mb-6">
            No account needed to shop or check out — you can create one later to track orders faster.
          </p>

          {devAdmin && (
            <button
              type="button"
              onClick={fillAdminEmail}
              className="w-full p-3 mb-6 rounded-xl bg-charcoal text-white text-sm font-semibold hover:bg-charcoal-light transition-colors"
            >
              Fill in the admin email
            </button>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {formError && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm"
              >
                {formError}
              </motion.div>
            )}

            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">
                Email or WordPress username
              </label>
              <div className="relative">
                <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  // Deliberately not type="email": WordPress admins sign in with a
                  // username, which the browser's native email validation would refuse.
                  type="text"
                  name="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-11 pr-4 py-3.5 bg-gray-50 border border-gray-200 rounded-xl text-charcoal focus:outline-none focus:ring-2 focus:ring-himalayan/30 focus:border-himalayan transition-all"
                  placeholder="you@example.com or your WordPress username"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-11 pr-12 py-3.5 bg-gray-50 border border-gray-200 rounded-xl text-charcoal focus:outline-none focus:ring-2 focus:ring-himalayan/30 focus:border-himalayan transition-all"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-lg text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer py-1.5">
                <input
                  type="checkbox"
                  className="h-5 w-5 rounded border-gray-300 text-himalayan focus:ring-himalayan"
                />
                <span className="text-sm text-charcoal-light">Remember me</span>
              </label>
              <Link
                to="/forgot-password"
                className="text-sm text-himalayan hover:underline font-medium"
              >
                Forgot password?
              </Link>
            </div>

            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              type="submit"
              disabled={isSigningIn}
              className="w-full flex items-center justify-center gap-2 py-4 bg-himalayan hover:bg-himalayan-dark text-white font-semibold rounded-xl transition-colors disabled:opacity-70 disabled:cursor-not-allowed shadow-lg shadow-himalayan/25"
            >
              {isSigningIn && <Loader2 size={18} className="animate-spin" />}
              Sign In
            </motion.button>
          </form>

          {/* Sign up link */}
          <p className="text-center text-sm text-charcoal-light mt-6">
            Don&apos;t have an account?{' '}
            <Link to="/signup" className="text-himalayan font-semibold hover:underline">
              Sign up
            </Link>
          </p>
        </motion.div>
      </div>
    </div>
  );
}
