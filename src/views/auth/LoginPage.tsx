import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Mail, Lock, Eye, EyeOff, Loader2, ArrowLeft, UserRound } from 'lucide-react';
import { useAuthContext } from '../../context/AuthContext';
import { isSupabaseConfigured } from '../../lib/supabase/client';
import { resolvePostLoginDestination } from '../../lib/auth/roleRouting';

type DemoAccount = { label: string; email: string; password: string };

// Demo credentials only exist at all in a development build. Checking
// process.env.NODE_ENV directly (not through the isDev re-export) lets the
// production minifier prove this function always returns null and strip the
// credential literals below as dead code — not just skip rendering them, so
// they can't be scraped out of the shipped production JS either.
function getDemoAccounts(): { customer: DemoAccount; admin: DemoAccount } | null {
  if (process.env.NODE_ENV !== 'development') return null;
  return {
    customer: {
      label: 'Use Demo Customer',
      email: 'customer@himalayankoh.com',
      password: 'Customer@123',
    },
    admin: {
      label: 'Use Demo Admin',
      email: 'admin@himalayankoh.com',
      password: 'Admin@123',
    },
  };
}

const demoAccounts = getDemoAccounts();

export default function LoginPage() {
  const [email, setEmail] = useState(demoAccounts?.customer.email ?? '');
  const [password, setPassword] = useState(demoAccounts?.customer.password ?? '');
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState('');

  const { signIn, isAuthenticated, isAdmin, profileLoading } = useAuthContext();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const supabaseReady = isSupabaseConfigured();

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
    if (demoAccounts && from.startsWith('/admin')) {
      fillDemoAccount('admin');
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

  const fillDemoAccount = (type: 'customer' | 'admin') => {
    if (!demoAccounts) return;
    const account = demoAccounts[type];
    setEmail(account.email);
    setPassword(account.password);
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
            <p className="text-charcoal-light text-sm mt-1">
              {demoAccounts ? 'Sign in to your account or use a demo login' : 'Sign in to your account'}
            </p>
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

          {demoAccounts && (
            <>
              <div className="grid grid-cols-2 gap-3 mb-6">
                <button
                  type="button"
                  onClick={() => fillDemoAccount('customer')}
                  className="p-3 rounded-xl bg-himalayan-lighter text-himalayan text-sm font-semibold hover:bg-himalayan/15 transition-colors"
                >
                  {demoAccounts.customer.label}
                </button>
                <button
                  type="button"
                  onClick={() => fillDemoAccount('admin')}
                  className="p-3 rounded-xl bg-charcoal text-white text-sm font-semibold hover:bg-charcoal-light transition-colors"
                >
                  {demoAccounts.admin.label}
                </button>
              </div>

              <div className="mb-6 rounded-xl border border-gray-100 bg-gray-50 p-4 text-xs text-charcoal-light space-y-1">
                <p><span className="font-semibold text-charcoal">Customer:</span> {demoAccounts.customer.email} / {demoAccounts.customer.password}</p>
                <p><span className="font-semibold text-charcoal">Admin:</span> {demoAccounts.admin.email} / {demoAccounts.admin.password}</p>
              </div>
            </>
          )}

          {!supabaseReady && (
            <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
              {demoAccounts
                ? 'Supabase environment variables are missing. Demo login will work after `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are added in Vercel and the demo accounts are seeded.'
                : 'Customer sign-in is unavailable until the Supabase environment variables are configured. WordPress admin sign-in still works.'}
            </div>
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
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded border-gray-300 text-himalayan focus:ring-himalayan"
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

          {/* Divider */}
          <div className="flex items-center gap-4 my-6">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-sm text-charcoal-light">or</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          {/* Social Login */}
          <div className="space-y-3">
            <button className="w-full flex items-center justify-center gap-3 py-3.5 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors font-medium text-charcoal">
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continue with Google
            </button>
          </div>

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
