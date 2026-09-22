'use client';

import { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../lib/supabase/client';
import { authApi, SignUpData, SignInData } from '../lib/supabase/api';
import type { Profile } from '../lib/supabase/database.types';
import {
  readStoredSession as readStoredAdminSession,
  signInWithPassword as signInWithWordPressAdmin,
  signOut as signOutOfWordPressAdmin,
  type SbUser as WordPressAdmin,
} from '../services/wordpressAdminAuth';

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  session: Session | null;
  loading: boolean;
  profileLoading: boolean;
  profileError: string | null;
  error: string | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  signUp: (data: SignUpData) => Promise<void>;
  signIn: (data: SignInData) => Promise<void>;
  signOut: () => Promise<void>;
  updateProfile: (updates: { full_name?: string; phone?: string; avatar_url?: string }) => Promise<Profile | null>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

const PROFILE_FETCH_TIMEOUT_MS = 10_000;
const PROFILE_FETCH_RETRY_DELAYS_MS = [500, 1000];
const AUTH_INITIALIZATION_MAX_WAIT_MS = 6_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = globalThis.setTimeout(() => {
      reject(new Error(`${label} timed out. Check your connection and try again.`));
    }, ms);

    promise
      .then((value) => {
        globalThis.clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        globalThis.clearTimeout(timer);
        reject(err);
      });
  });
}

/** Supabase can deadlock if other client calls run inside onAuthStateChange. */
function runAfterAuthCallback(task: () => void) {
  globalThis.setTimeout(task, 0);
}

function roleFromUser(user: User | null): 'admin' | 'customer' | null {
  const metaRole = user?.user_metadata?.role || (user as { app_metadata?: { role?: string } })?.app_metadata?.role;
  if (metaRole === 'admin' || metaRole === 'customer') return metaRole as 'admin' | 'customer';
  if (user?.email && (user.email === '8002salman@gmail.com' || user.email === 'basco.pk@gmail.com' || user.email.startsWith('admin@'))) return 'admin';
  return null;
}

/**
 * Admin sessions are minted by WordPress auth, not Supabase — but the whole
 * console reads `user`, `session` and `profile` from this context. These
 * adapters present the WordPress identity in that shape instead of making every
 * consumer learn a second one. Nothing here can grant admin: the role is copied
 * from a token the server signed only after it checked the WordPress
 * `administrator` role, and a customer session never reaches these functions.
 */
function isWordPressAdminUser(user: User | null): boolean {
  return (user?.app_metadata as { provider?: string } | undefined)?.provider === 'wordpress';
}

function adminUserToSessionUser(admin: WordPressAdmin): User {
  const now = new Date().toISOString();
  return {
    id: admin.id,
    aud: 'authenticated',
    role: 'authenticated',
    email: admin.email || undefined,
    email_confirmed_at: now,
    phone: '',
    confirmed_at: now,
    last_sign_in_at: now,
    app_metadata: { provider: 'wordpress', providers: ['wordpress'], role: 'admin' },
    user_metadata: { role: 'admin', full_name: admin.name, username: admin.username },
    identities: [],
    created_at: now,
    updated_at: now,
  } as unknown as User;
}

function adminSessionForUser(admin: WordPressAdmin, token: string, expiresAt: number): Session {
  return {
    access_token: token,
    refresh_token: '',
    token_type: 'bearer',
    expires_in: Math.max(0, Math.floor((expiresAt - Date.now()) / 1000)),
    expires_at: Math.floor(expiresAt / 1000),
    user: adminUserToSessionUser(admin),
  } as unknown as Session;
}

function adminProfileFrom(admin: WordPressAdmin): Profile {
  const now = new Date().toISOString();
  return {
    id: admin.id,
    email: admin.email || '',
    full_name: admin.name || null,
    phone: null,
    avatar_url: null,
    role: 'admin',
    created_at: now,
    updated_at: now,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // Keep SSR and the browser's first render identical. Supabase's persisted
  // session is read by the effect below; reading localStorage in these
  // initializers made a signed-in browser render a different tree than SSR and
  // caused hydration error #418 on admin routes.
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const profileRequestId = useRef(0);

  const fetchProfile = useCallback(async (userId: string, currentUser?: User | null, attempt = 0) => {
    const isAlreadyAdmin = roleFromUser(currentUser ?? null) === 'admin';
    const requestId = attempt === 0 ? ++profileRequestId.current : profileRequestId.current;
    if (attempt === 0) {
      if (!isAlreadyAdmin) {
        setProfileLoading(true);
      }
      setProfileError(null);
    }

    try {
      const profileData = await withTimeout(
        authApi.getProfile(userId),
        PROFILE_FETCH_TIMEOUT_MS,
        'Profile load'
      );

      if (requestId !== profileRequestId.current) return;

      if (profileData) {
        setProfile(profileData);
        setProfileLoading(false);
        return;
      }

      // No error, no row — a genuinely new user without a profile yet, not a
      // failure worth retrying. The guessed role is the correct outcome here.
      const fallbackRole = roleFromUser(currentUser ?? null) || 'customer';
      setProfile({
        id: userId,
        email: currentUser?.email ?? '',
        full_name: (currentUser?.user_metadata?.full_name as string) || (fallbackRole === 'admin' ? 'Salman Bashir' : null),
        phone: null,
        avatar_url: null,
        role: fallbackRole,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      setProfileLoading(false);
    } catch (err) {
      if (requestId !== profileRequestId.current) return;

      const retryDelay = PROFILE_FETCH_RETRY_DELAYS_MS[attempt];
      if (retryDelay !== undefined) {
        await sleep(retryDelay);
        if (requestId !== profileRequestId.current) return;
        return fetchProfile(userId, currentUser, attempt + 1);
      }

      // Graceful fallback to session user metadata without raising unhandled console errors
      console.warn('Profile fetch deferred, falling back to authenticated session metadata:', err instanceof Error ? err.message : err);

      const sessionUser = currentUser ?? null;
      if (!sessionUser) {
        setProfile(null);
        setProfileLoading(false);
        return;
      }

      setProfileError(null);
      const fallbackRole = roleFromUser(sessionUser) || 'customer';
      setProfile({
        id: userId,
        email: sessionUser.email ?? '',
        full_name: (sessionUser.user_metadata?.full_name as string) || (fallbackRole === 'admin' ? 'Salman Bashir' : null),
        phone: null,
        avatar_url: null,
        role: fallbackRole,
        created_at: sessionUser.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      setProfileLoading(false);
    }
  }, []);

  const loadProfileForSession = useCallback(
    (sessionUser: User | null) => {
      if (!sessionUser) {
        profileRequestId.current += 1;
        setProfile(null);
        setProfileLoading(false);
        setProfileError(null);
        return Promise.resolve();
      }

      return fetchProfile(sessionUser.id, sessionUser);
    },
    [fetchProfile]
  );

  // Initialize auth state
  useEffect(() => {
    // A WordPress admin session stands on its own: when one is present it is the
    // whole answer, and initialising Supabase on top of it would replace the admin
    // identity with a customer one. Admin tokens cannot be refreshed, so an
    // expired one is left behind for the sign-in screen to overwrite.
    const storedAdmin = readStoredAdminSession();
    if (storedAdmin && storedAdmin.expiresAt - Date.now() > 60_000) {
      setUser(adminUserToSessionUser(storedAdmin.user));
      setSession(
        adminSessionForUser(storedAdmin.user, storedAdmin.accessToken, storedAdmin.expiresAt)
      );
      setProfile(adminProfileFrom(storedAdmin.user));
      setProfileLoading(false);
      setProfileError(null);
      setLoading(false);
      return;
    }

    if (!isSupabaseConfigured()) {
      setLoading(false);
      return;
    }

    let mounted = true;
    let authInitializationFinished = false;
    const authInitializationTimer = globalThis.setTimeout(() => {
      if (!mounted || authInitializationFinished) return;
      console.warn('Auth initialization exceeded the recovery window. Releasing route loading state.');
      setLoading(false);
    }, AUTH_INITIALIZATION_MAX_WAIT_MS);

    const finishAuthInitialization = () => {
      authInitializationFinished = true;
      globalThis.clearTimeout(authInitializationTimer);
    };

    const applySession = (nextSession: Session | null, loadProfile: boolean) => {
      if (!mounted) return;

      setSession(nextSession);
      setUser(nextSession?.user ?? null);

      if (!nextSession?.user) {
        profileRequestId.current += 1;
        setProfile(null);
        finishAuthInitialization();
        setLoading(false);
        return;
      }

      // Pre-seed profile from session user metadata immediately to prevent empty profile state
      const detectedRole = roleFromUser(nextSession.user);
      const initialFullName =
        (nextSession.user.user_metadata?.full_name as string) ||
        (detectedRole === 'admin' ? 'Salman Bashir' : null);
      setProfile((prev) => prev || {
        id: nextSession.user.id,
        email: nextSession.user.email ?? '',
        full_name: initialFullName,
        phone: (nextSession.user.user_metadata?.phone as string) || null,
        avatar_url: (nextSession.user.user_metadata?.avatar_url as string) || null,
        role: detectedRole || 'customer',
        created_at: nextSession.user.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      if (!loadProfile) {
        finishAuthInitialization();
        setLoading(false);
        return;
      }

      // Route access depends on a valid Supabase session, not the optional
      // profile row. Keeping global auth loading true until a profile request
      // returns can trap a signed-in customer on the account spinner whenever
      // the profiles query is slow or blocked by a transient network/RLS error.
      finishAuthInitialization();
      setLoading(false);
      void loadProfileForSession(nextSession.user);
    };

    void (async () => {
      try {
        const { data, error } = await withTimeout(
          supabase.auth.getSession(),
          PROFILE_FETCH_TIMEOUT_MS,
          'Session check'
        );
        if (error) throw error;
        applySession(data.session, true);
      } catch (err) {
        console.error('Auth initialization failed:', err);
        if (mounted) {
          finishAuthInitialization();
          setLoading(false);
        }
      }
    })();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      runAfterAuthCallback(() => {
        if (event === 'TOKEN_REFRESHED') {
          // Only update the session token — no profile re-fetch needed
          if (mounted) {
            setSession(nextSession);
            setUser(nextSession?.user ?? null);
          }
          return;
        }
        if (event === 'SIGNED_OUT') {
          if (mounted) {
            profileRequestId.current += 1;
            setSession(null);
            setUser(null);
            setProfile(null);
            setProfileLoading(false);
            setProfileError(null);
            setLoading(false);
          }
          return;
        }
        applySession(nextSession, Boolean(nextSession?.user));
      });
    });

    return () => {
      mounted = false;
      globalThis.clearTimeout(authInitializationTimer);
      subscription.unsubscribe();
    };
  }, [loadProfileForSession]);

  const signUp = useCallback(async (data: SignUpData) => {
    setLoading(true);
    setError(null);
    try {
      await authApi.signUp(data);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Sign up failed';
      setError(errorMsg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const signIn = useCallback(async (data: SignInData) => {
    setError(null);
    setLoading(true);
    try {
      // WordPress admins first. An admin signs in with their WordPress username
      // + application password, which Supabase knows nothing about; when that
      // route refuses the credential we fall through to the customer path, so a
      // shopper's email + password still works exactly as before.
      try {
        const adminSession = await signInWithWordPressAdmin(data.email, data.password);
        profileRequestId.current += 1;
        setUser(adminUserToSessionUser(adminSession.user));
        setSession(
          adminSessionForUser(adminSession.user, adminSession.accessToken, adminSession.expiresAt)
        );
        setProfile(adminProfileFrom(adminSession.user));
        setProfileError(null);
        setLoading(false);
        return;
      } catch (adminError) {
        // A declined admin credential is expected for every customer sign-in, so
        // it is not an error worth showing — the next attempt decides.
        console.debug(
          'WordPress admin sign-in declined:',
          adminError instanceof Error ? adminError.message : adminError
        );
      }

      const result = await authApi.signIn(data);
      setSession(result.session);
      setUser(result.user);
      // A successful credential check is enough to navigate to the protected
      // account area. Fetch the editable profile in the background so a slow
      // profile request never makes sign-in appear to hang.
      setLoading(false);

      if (result.user) {
        void fetchProfile(result.user.id, result.user);
      } else {
        setProfile(null);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Sign in failed';
      setError(errorMsg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [fetchProfile]);

  const signOut = useCallback(async () => {
    setError(null);
    // Clear local auth state first and unconditionally, so the UI reflects a
    // signed-out state immediately — even if the Supabase revoke call fails
    // (e.g. an already-expired/missing session). This is what fixes sign-out
    // appearing to "not work" across the customer and admin portals.
    profileRequestId.current += 1;
    setUser(null);
    setProfile(null);
    setProfileLoading(false);
    setProfileError(null);
    setSession(null);
    try {
      await authApi.signOut();
      // The WordPress admin session is a separate credential with its own storage
      // key; clear it too, so signing out cannot leave an admin token behind.
      await signOutOfWordPressAdmin();
    } catch (err) {
      // authApi.signOut already swallows benign errors; log anything else but
      // never re-throw — the user is signed out locally regardless.
      console.warn('Sign out completed with a non-fatal error:', err);
    } finally {
      setLoading(false);
    }
  }, []);


  const updateProfile = useCallback(async (updates: { full_name?: string; phone?: string; avatar_url?: string }) => {
    if (!user) throw new Error('Not authenticated');
    setError(null);
    try {
      const updatedProfile = await authApi.updateProfile(user.id, updates);
      setProfile(updatedProfile);
      return updatedProfile;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Update failed';
      setError(errorMsg);
      throw err;
    }
  }, [user]);

  // fetchProfile manages its own profileLoading/profileError state, so a
  // manual retry (e.g. the "Try again" button on an access-denied screen)
  // doesn't need to also toggle the global `loading` flag — doing so used to
  // re-trigger the full-page auth spinner on every route it's shared with.
  const refreshProfile = useCallback(async () => {
    if (user) {
      // A WordPress admin has no Supabase profile row: fetching one would fail
      // and then fall back to the same session metadata we already hold.
      if (!isWordPressAdminUser(user)) await fetchProfile(user.id, user);
    }
  }, [user, fetchProfile]);

  const metadataRole = roleFromUser(user);
  const isAdmin = profile?.role === 'admin' || metadataRole === 'admin';

  const value: AuthContextType = {
    user,
    profile,
    session,
    loading,
    profileLoading,
    profileError,
    error,
    isAuthenticated: !!user,
    isAdmin,
    signUp,
    signIn,
    signOut,
    updateProfile,
    refreshProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuthContext must be used within AuthProvider');
  }
  return context;
}
