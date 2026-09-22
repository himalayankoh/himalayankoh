import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Mail, Lock, User, Eye, EyeOff, Loader2, ArrowRight, UserRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuthContext } from '../context/AuthContext';
import { authApi } from '../lib/supabase/api';
import { useToast } from '../context/ToastContext';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

type AuthMode = 'login' | 'signup' | 'forgot';

/**
 * The development convenience — and only the part of it that is true.
 *
 * The "Demo Customer" / "Demo Admin" buttons used to fill two passwords, and
 * both were false: the customer account was never seeded, and the admin password
 * here was not the configured account's password, so the filled credential
 * answered 401. This modal and the sign-in page advertised the same pair; both
 * now offer the admin email alone, which is true and public, and leave the
 * password to whoever holds it.
 *
 * Development builds only — checking `process.env.NODE_ENV` directly lets the
 * production minifier prove this returns null and strip it.
 */
function devAdminEmail(): string | null {
  if (process.env.NODE_ENV !== 'development') return null;
  return 'admin@himalayankoh.com';
}

const devAdmin = devAdminEmail();

export default function AuthModal({ isOpen, onClose }: Props) {
  const [mode, setMode] = useState<AuthMode>('login');
  const [showPassword, setShowPassword] = useState(false);
  // The email only: this form used to open holding a demo customer's password,
  // so the first Sign In click always failed.
  const [formData, setFormData] = useState({
    email: devAdmin ?? '',
    password: '',
    fullName: '',
  });
  const [localLoading, setLocalLoading] = useState(false);

  const { signIn, signUp } = useAuthContext();
  const navigate = useNavigate();
  const toast = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalLoading(true);

    try {
      if (mode === 'login') {
        await signIn({ email: formData.email, password: formData.password });
        onClose();
      } else if (mode === 'signup') {
        await signUp({
          email: formData.email,
          password: formData.password,
          fullName: formData.fullName,
        });
        toast.success('Account created! Please check your email to verify.');
        onClose();
      } else if (mode === 'forgot') {
        await authApi.resetPassword(formData.email);
        toast.success('Reset link sent! Check your email.');
        onClose();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLocalLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({ email: '', password: '', fullName: '' });
  };

  const goToFullPage = (page: 'login' | 'signup') => {
    onClose();
    navigate(`/${page}`);
  };

  const fillAdminEmail = () => {
    if (!devAdmin) return;
    setMode('login');
    setFormData({ ...formData, email: devAdmin });
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-modal flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="relative p-6 pb-0">
              <button
                onClick={onClose}
                className="absolute top-4 right-4 w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
              >
                <X size={16} />
              </button>

              <div className="text-center mb-6">
                <img
                  src="/logo.svg"
                  alt="Himalayan Koh"
                  className="h-12 mx-auto mb-4"
                />
                <h2 className="font-serif text-2xl font-bold text-charcoal">
                  {mode === 'login' && 'Welcome Back'}
                  {mode === 'signup' && 'Create Account'}
                  {mode === 'forgot' && 'Reset Password'}
                </h2>
                <p className="text-charcoal-light text-sm mt-1">
                  {mode === 'login' && 'Sign in to your account'}
                  {mode === 'signup' && 'Join Himalayan Koh today'}
                  {mode === 'forgot' && 'Enter your email to reset'}
                </p>
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="p-6 pt-0 space-y-4">
              {mode === 'login' && (
                <div>
                  <button
                    type="button"
                    onClick={onClose}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-himalayan text-himalayan font-semibold hover:bg-himalayan-lighter transition-colors"
                  >
                    <UserRound size={18} />
                    Continue as Guest
                  </button>
                  <p className="text-center text-xs text-charcoal-light mt-2">
                    No account needed to shop or check out.
                  </p>
                </div>
              )}

              {mode === 'login' && devAdmin && (
                <button
                  type="button"
                  onClick={fillAdminEmail}
                  className="w-full p-2.5 rounded-lg bg-charcoal text-white text-xs font-semibold hover:bg-charcoal-light transition-colors"
                >
                  Fill in the admin email
                </button>
              )}

              {mode === 'signup' && (
                <div>
                  <label className="block text-sm font-medium text-charcoal mb-1.5">
                    Full Name
                  </label>
                  <div className="relative">
                    <User size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      required
                      value={formData.fullName}
                      onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                      className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-charcoal placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-himalayan/30 focus:border-himalayan transition-all"
                      placeholder="John Doe"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">
                  {mode === 'login' ? 'Email or WordPress username' : 'Email Address'}
                </label>
                <div className="relative">
                  <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    // A WordPress admin signs in with a username, which the
                    // browser's native email validation would refuse.
                    type={mode === 'login' ? 'text' : 'email'}
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-charcoal placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-himalayan/30 focus:border-himalayan transition-all"
                    placeholder="john@example.com"
                  />
                </div>
              </div>

              {mode !== 'forgot' && (
                <div>
                  <label className="block text-sm font-medium text-charcoal mb-1.5">
                    Password
                  </label>
                  <div className="relative">
                    <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      className="w-full pl-10 pr-12 py-3 bg-gray-50 border border-gray-200 rounded-xl text-charcoal placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-himalayan/30 focus:border-himalayan transition-all"
                      placeholder="••••••••"
                      minLength={6}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>
              )}

              {mode === 'login' && (
                <div className="text-right">
                  <button
                    type="button"
                    onClick={() => { setMode('forgot'); resetForm(); }}
                    className="text-sm text-himalayan hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>
              )}

              <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                type="submit"
                disabled={localLoading}
                className="w-full flex items-center justify-center gap-2 min-h-11 bg-himalayan hover:bg-himalayan-dark text-white font-semibold rounded-xl transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {localLoading && <Loader2 size={18} className="animate-spin" />}
                {mode === 'login' && 'Sign In'}
                {mode === 'signup' && 'Create Account'}
                {mode === 'forgot' && 'Send Reset Link'}
              </motion.button>

              {/* Switch mode */}
              <div className="text-center text-sm text-charcoal-light">
                {mode === 'login' && (
                  <>
                    Don&apos;t have an account?{' '}
                    <button
                      type="button"
                      onClick={() => { setMode('signup'); resetForm(); }}
                      className="text-himalayan font-semibold hover:underline"
                    >
                      Sign up
                    </button>
                  </>
                )}
                {mode === 'signup' && (
                  <>
                    Already have an account?{' '}
                    <button
                      type="button"
                      onClick={() => { setMode('login'); resetForm(); }}
                      className="text-himalayan font-semibold hover:underline"
                    >
                      Sign in
                    </button>
                  </>
                )}
                {mode === 'forgot' && (
                  <button
                    type="button"
                    onClick={() => { setMode('login'); resetForm(); }}
                    className="text-himalayan font-semibold hover:underline"
                  >
                    Back to sign in
                  </button>
                )}
              </div>

              {/* Full page link */}
              {mode !== 'forgot' && (
                <div className="pt-2 text-center">
                  <button
                    type="button"
                    onClick={() => goToFullPage(mode === 'login' ? 'login' : 'signup')}
                    className="text-xs text-charcoal-light hover:text-charcoal"
                  >
                    Open full {mode === 'login' ? 'login' : 'signup'} page <ArrowRight size={12} className="inline" />
                  </button>
                </div>
              )}
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
