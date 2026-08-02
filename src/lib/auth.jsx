// src/lib/auth.js
// Shared auth foundation for ielts-bank.com. Provides a React context around
// the existing Supabase browser client (lib/supabase.js getSupabase). Other
// features (progress-persistence, dashboard) build against this exact contract.
//
// Contract:
//   <AuthProvider>  — wrap the app once.
//   useAuth() -> {
//     user,                              // Supabase user object or null (user.id, user.email)
//     loading,                           // true until the initial session resolves
//     signInWithEmail(email): Promise<{error}>,          // magic link (fallback)
//     signUpWithPassword(email, password): Promise<{data, error}>,
//     signInWithPassword(email, password): Promise<{error}>,
//     verifyEmailOtp(email, token): Promise<{error}>,          // 6-digit signup code
//     resendSignupEmail(email): Promise<{error}>,
//     signOut(): Promise<{error}>,
//   }
// Successful account creation and sign-in always land on /dashboard.
//
// All .auth calls go through the single existing anon browser client
// (persistSession true). No second client, no anonymous sign-in — logged-out
// users simply have user=null.

import * as React from 'react';
import { getSupabase } from '../../lib/supabase';
import { setAnalyticsUser, track } from './analytics';
import { buildAuthCallbackUrl } from './authPaths';
import { syncLocalAttempts } from './progress';
import { redeemStoredReferral } from './referral';

// Backfill any practice a user completed while logged out (localStorage) into
// their account the moment a session is available — on fresh sign-in AND on a
// restored session — so it works no matter which page they land on (the
// dashboard, previously, never triggered the per-question-page sync). Idempotent
// and fail-soft; a no-op when there is nothing local to migrate.
function backfillLocalAttempts(userId) {
  if (userId) syncLocalAttempts(userId).catch(() => {});
}

const AuthContext = React.createContext(null);

function toAuthError(error, fallbackMessage) {
  return error instanceof Error ? error : new Error(fallbackMessage);
}

// auth-js returns AuthError failures as { error }, but deliberately rethrows
// unexpected failures (for example client initialization or browser-storage
// exceptions). Keep the context's documented resolved-result contract for
// both cases so UI event handlers can always show a retryable error.
async function recoverAuthCall(operation, fallbackMessage, failureData = {}) {
  try {
    return await operation();
  } catch (error) {
    return {
      ...failureData,
      error: toAuthError(error, fallbackMessage),
    };
  }
}

// window.location.origin, safe during SSR / build (returns '' server-side).
function getOrigin() {
  if (typeof window !== 'undefined' && window.location) {
    return window.location.origin;
  }
  return '';
}

// Every emailed auth link uses one callback. The callback owns the final
// destination so individual sign-in gates cannot accidentally bypass the
// learner dashboard.
function callbackUrl() {
  return buildAuthCallbackUrl(getOrigin());
}

export function AuthProvider({ children }) {
  const [user, setUser] = React.useState(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let active = true;
    let subscription;

    // getSupabase throws if the public env vars are absent. Guard so the app
    // still renders (logged-out) rather than crashing.
    let supabase;
    try {
      supabase = getSupabase();
    } catch (err) {
      if (active) {
        setUser(null);
        setLoading(false);
      }
      return () => {
        active = false;
      };
    }

    // Resolve the initial session on mount.
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return;
        setUser(data?.session?.user ?? null);
        setAnalyticsUser(data?.session?.user?.id || null, data?.session?.access_token || null);
        setLoading(false);
        backfillLocalAttempts(data?.session?.user?.id);
        // One-shot referral redemption for a stored ?ref= code (fail-soft).
        if (data?.session?.access_token) {
          redeemStoredReferral(data.session.access_token).catch(() => {});
        }
      })
      .catch(() => {
        if (!active) return;
        setUser(null);
        setLoading(false);
      });

    // Keep the context live across sign-in / sign-out / token refresh.
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      setUser(session?.user ?? null);
      setAnalyticsUser(session?.user?.id || null, session?.access_token || null);
      if (event === 'SIGNED_IN') {
        // Supabase re-emits SIGNED_IN on every tab focus / session restore,
        // which inflated `login` events ~10x (avg 8.7 per session in the
        // Jul-2026 audit). Track at most one login per browser tab session;
        // the flag clears on SIGNED_OUT so a genuine re-login still counts.
        let alreadyTracked = false;
        try {
          alreadyTracked = window.sessionStorage.getItem('ielts-login-tracked') === '1';
          if (!alreadyTracked) window.sessionStorage.setItem('ielts-login-tracked', '1');
        } catch {
          // Storage denied: fall back to tracking (over-count beats losing logins).
        }
        if (!alreadyTracked) {
          track('login', { method: 'email', signed_in: true }, { accessToken: session?.access_token });
        }
        backfillLocalAttempts(session?.user?.id);
        if (session?.access_token) {
          redeemStoredReferral(session.access_token).catch(() => {});
        }
      }
      if (event === 'SIGNED_OUT') {
        try {
          window.sessionStorage.removeItem('ielts-login-tracked');
        } catch {
          // Best-effort only.
        }
      }
      setLoading(false);
    });
    subscription = data?.subscription;

    return () => {
      active = false;
      subscription?.unsubscribe?.();
    };
  }, []);

  const signInWithEmail = React.useCallback(async (email) => {
    return recoverAuthCall(async () => {
      const supabase = getSupabase();
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: callbackUrl(),
          // This helper powers the existing-account "one-time code instead"
          // sign-in path. Supabase otherwise creates a user by default.
          shouldCreateUser: false,
        },
      });
      return { error };
    }, 'Could not send the sign-in code. Please try again.');
  }, []);

  // `metadata` (e.g. { full_name, first_name, last_name }) lands in
  // raw_user_meta_data; the handle_new_user trigger mirrors full_name into
  // public.users.display_name.
  const signUpWithPassword = React.useCallback(async (email, password, metadata = null) => {
    return recoverAuthCall(async () => {
      const supabase = getSupabase();
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: callbackUrl(),
          ...(metadata ? { data: metadata } : {}),
        },
      });
      return { data, error };
    }, 'Could not create your account. Please try again.', { data: null });
  }, []);

  const signInWithPassword = React.useCallback(async (email, password) => {
    return recoverAuthCall(async () => {
      const supabase = getSupabase();
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return { error };
    }, 'Could not sign you in. Please try again.');
  }, []);

  // Verify an emailed 6-digit code. `type` is the expected OTP kind
  // ('signup' for confirmation emails, 'email' for sign-in codes, 'recovery'
  // for password resets). For the signup/email pair the other kind is tried
  // as a fallback since failed attempts are limited per token; recovery codes
  // are only ever recovery codes, so no fallback there.
  const verifyEmailOtp = React.useCallback(async (email, token, type = 'signup') => {
    return recoverAuthCall(async () => {
      const supabase = getSupabase();
      const primary = await supabase.auth.verifyOtp({ email, token, type });
      if (!primary.error) return { error: null };
      const altType = type === 'signup' ? 'email' : type === 'email' ? 'signup' : null;
      if (!altType) return { error: primary.error };
      const secondary = await supabase.auth.verifyOtp({ email, token, type: altType });
      return { error: secondary.error ? primary.error : null };
    }, 'Could not verify the code. Please try again.');
  }, []);

  // Password reset, OTP-style: emails a 6-digit recovery code (the Supabase
  // "Reset Password" template must render {{ .Token }}), verified with
  // verifyEmailOtp(type 'recovery'), after which updatePassword sets the new
  // password on the recovered session.
  const requestPasswordReset = React.useCallback(async (email) => {
    return recoverAuthCall(async () => {
      const supabase = getSupabase();
      const { error } = await supabase.auth.resetPasswordForEmail(email);
      return { error };
    }, 'Could not send the reset code. Please try again.');
  }, []);

  const updatePassword = React.useCallback(async (password) => {
    return recoverAuthCall(async () => {
      const supabase = getSupabase();
      const { error } = await supabase.auth.updateUser({ password });
      return { error };
    }, 'Could not update your password. Please try again.');
  }, []);

  const resendSignupEmail = React.useCallback(async (email) => {
    return recoverAuthCall(async () => {
      const supabase = getSupabase();
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email,
        options: { emailRedirectTo: callbackUrl() },
      });
      return { error };
    }, 'Could not resend the confirmation code. Please try again.');
  }, []);

  const signOut = React.useCallback(async () => {
    try {
      const supabase = getSupabase();
      // Account settings promises to sign out only this device. Supabase's
      // JavaScript default is global, so keep the scope explicit.
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      if (error) return { error };
      setUser(null);
      setAnalyticsUser(null, null);
      return { error: null };
    } catch (error) {
      return {
        error: toAuthError(error, 'Could not sign out. Please try again.'),
      };
    }
  }, []);

  const value = React.useMemo(
    () => ({
      user,
      loading,
      signInWithEmail,
      signUpWithPassword,
      signInWithPassword,
      verifyEmailOtp,
      resendSignupEmail,
      requestPasswordReset,
      updatePassword,
      signOut,
    }),
    [
      user,
      loading,
      signInWithEmail,
      signUpWithPassword,
      signInWithPassword,
      verifyEmailOtp,
      resendSignupEmail,
      requestPasswordReset,
      updatePassword,
      signOut,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = React.useContext(AuthContext);
  if (!ctx) {
    // Defensive default so components that render outside the provider (or
    // during odd SSR edge cases) don't throw.
    return {
      user: null,
      loading: true,
      signInWithEmail: async () => ({ error: new Error('AuthProvider missing') }),
      signUpWithPassword: async () => ({ error: new Error('AuthProvider missing') }),
      signInWithPassword: async () => ({ error: new Error('AuthProvider missing') }),
      verifyEmailOtp: async () => ({ error: new Error('AuthProvider missing') }),
      resendSignupEmail: async () => ({ error: new Error('AuthProvider missing') }),
      requestPasswordReset: async () => ({ error: new Error('AuthProvider missing') }),
      updatePassword: async () => ({ error: new Error('AuthProvider missing') }),
      signOut: async () => ({ error: new Error('AuthProvider missing') }),
    };
  }
  return ctx;
}
