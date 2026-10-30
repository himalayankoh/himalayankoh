import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Lock, Eye, EyeOff, Loader2, Check, AlertTriangle } from 'lucide-react';
import { useToast } from '../../context/ToastContext';

/**
 * Setting a new password from the link WordPress emailed.
 *
 * ## What replaced the session gate
 *
 * This page used to refuse to render until `supabase.auth.getSession()` reported a
 * session, because Supabase proved a recovery link by putting a session in the
 * browser. That is not how WordPress proves it: the link carries `login` and `key`,
 * and `check_password_reset_key()` is the only validator — so the page needs no
 * session at all, which is what makes it work on a phone that has never signed in,
 * the normal way a reset link gets opened.
 *
 * The link is therefore presented for what it is: a form the customer can fill in,
 * and a key that either works (the password changes) or does not (WordPress says so,
 * and the page offers a new link). No session, none of the false "invalid link"
 * state a missing recovery session used to produce even when the link was fine.
 */
export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const navigate = useNavigate();
  const toast = useToast();

  // WordPress sends the account's login name and its reset key. Both are required:
  // the key alone does not say which account it belongs to.
  const login = (searchParams.get('login') ?? '').trim();
  const key = (searchParams.get('key') ?? '').trim();
  const linkUsable = Boolean(login && key);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    if (password.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/auth/customer/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login, key, password }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || 'Failed to reset password');
      }

      setSuccess(true);
      setTimeout(() => navigate('/login'), 3000);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reset password');
    } finally {
      setLoading(false);
    }
  };

  if (!linkUsable) {
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
          <h1 className="font-serif text-2xl font-bold text-charcoal mb-2">Invalid or Expired Link</h1>
          <p className="text-charcoal-light mb-6">
            This password reset link is missing its reset token or has expired. Request a new one.
          </p>
          <Link
            to="/forgot-password"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-himalayan hover:bg-himalayan-dark text-white font-semibold rounded-xl transition-colors"
          >
            Request New Link
          </Link>
        </motion.div>
      </div>
    );
  }

  if (success) {
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
          <h1 className="font-serif text-2xl font-bold text-charcoal mb-2">Password Reset!</h1>
          <p className="text-charcoal-light mb-6">
            Your password has been successfully reset. Redirecting to login...
          </p>
          <Link
            to="/login"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-himalayan hover:bg-himalayan-dark text-white font-semibold rounded-xl transition-colors"
          >
            Go to Login
          </Link>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-cream via-white to-himalayan-lighter flex items-start sm:items-center justify-center px-4 py-8 sm:py-0">
      <div className="w-full max-w-md">
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
            <h1 className="font-serif text-2xl font-bold text-charcoal">Reset Password</h1>
            <p className="text-charcoal-light text-sm mt-1">Enter your new password below</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">
                New Password
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
                  minLength={8}
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

            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">
                Confirm New Password
              </label>
              <div className="relative">
                <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={`w-full pl-11 pr-4 py-3.5 bg-gray-50 border rounded-xl text-charcoal focus:outline-none focus:ring-2 focus:ring-himalayan/30 transition-all ${
                    confirmPassword && password !== confirmPassword
                      ? 'border-red-300'
                      : 'border-gray-200 focus:border-himalayan'
                  }`}
                  placeholder="••••••••"
                />
              </div>
            </div>

            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-4 bg-himalayan hover:bg-himalayan-dark text-white font-semibold rounded-xl transition-colors disabled:opacity-70 disabled:cursor-not-allowed shadow-lg shadow-himalayan/25"
            >
              {loading && <Loader2 size={18} className="animate-spin" />}
              Reset Password
            </motion.button>
          </form>
        </motion.div>
      </div>
    </div>
  );
}
