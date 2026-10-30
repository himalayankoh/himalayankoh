import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Mail, Loader2, ArrowLeft, Check } from 'lucide-react';
import { useToast } from '../../context/ToastContext';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const toast = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // WordPress sends the mail; this app only decides that the link points back
      // at /reset-password on the storefront rather than at wp-login.php.
      const response = await fetch('/api/auth/customer/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || 'Failed to send reset email');
      }
      setSuccess(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send reset email');
    } finally {
      setLoading(false);
    }
  };

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
          <h1 className="font-serif text-2xl font-bold text-charcoal mb-2">Check Your Email</h1>
          <p className="text-charcoal-light mb-6">
            If an account exists for <strong>{email}</strong>, we&apos;ve sent it a link to
            choose a new password. The link can be opened on any device and expires in
            24 hours.
          </p>
          <div className="space-y-3">
            <Link
              to="/login"
              className="inline-flex items-center justify-center gap-2 w-full px-6 py-3 bg-himalayan hover:bg-himalayan-dark text-white font-semibold rounded-xl transition-colors"
            >
              Back to Login
            </Link>
            <button
              onClick={() => setSuccess(false)}
              className="text-sm text-charcoal-light hover:text-charcoal"
            >
              Didn&apos;t receive email? Try again
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-cream via-white to-himalayan-lighter flex items-start sm:items-center justify-center px-4 py-8 sm:py-0">
      <div className="w-full max-w-md">
        {/* Back to Login */}
        <Link
          to="/login"
          className="inline-flex items-center gap-2 text-charcoal-light hover:text-charcoal mb-8 transition-colors"
        >
          <ArrowLeft size={18} />
          Back to Login
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
            <h1 className="font-serif text-2xl font-bold text-charcoal">Forgot Password?</h1>
            <p className="text-charcoal-light text-sm mt-1">
              Enter your email and we&apos;ll send you reset instructions
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">
                Email Address
              </label>
              <div className="relative">
                <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-11 pr-4 py-3.5 bg-gray-50 border border-gray-200 rounded-xl text-charcoal focus:outline-none focus:ring-2 focus:ring-himalayan/30 focus:border-himalayan transition-all"
                  placeholder="john@example.com"
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
              Send Reset Link
            </motion.button>
          </form>

          {/* Sign up link */}
          <p className="text-center text-sm text-charcoal-light mt-6">
            Remember your password?{' '}
            <Link to="/login" className="text-himalayan font-semibold hover:underline">
              Sign in
            </Link>
          </p>
        </motion.div>
      </div>
    </div>
  );
}
