import * as React from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/router';
import {
  X,
  Mail,
  ShieldCheck,
  KeyRound,
} from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { cn } from '../../lib/utils';
import { useAuth } from '../../lib/auth';
import { track } from '../../lib/analytics';
import { POST_AUTH_PATH } from '../../lib/authPaths';
import { inter } from '../../lib/fonts';
import { useDialogFocus } from '../../lib/dialogFocus';
import { isDisposableEmail, suggestEmailFix } from '../../../lib/emailCheck';
// Email and password -> verified email -> resume the caller's destination.
// Optional profile details and email preferences remain in account settings.
const SIGNUP_EXPERIMENT = 'signup_email_first_v1';

function matchesAuthError(error, code, legacyMessagePattern) {
  return error?.code === code || legacyMessagePattern.test(error?.message || '');
}

function normalizeOtp(value) {
  return value.replace(/[٠-٩۰-۹]/g, (digit) => String(digit.charCodeAt(0) - (digit >= '۰' ? 0x6f0 : 0x660))).replace(/\D/g, '');
}

// Server pre-check (pages/api/auth/signup-check.js): throwaway inboxes and
// Gmail look-alikes of an existing account. Fails open — a slow or broken
// check must never stop a real sign-up.
async function precheckSignupEmail(email) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const response = await fetch('/api/auth/signup-check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));
    if (!response.ok) return { ok: true };
    const data = await response.json();
    return data && typeof data === 'object' ? data : { ok: true };
  } catch {
    return { ok: true };
  }
}

const DISPOSABLE_MESSAGE =
  'Please use an email address you’ll keep — temporary inboxes expire, and we send your sign-in codes there.';

function verificationError(error) {
  const message = error?.message || '';
  if (error?.status === 429 || /rate|too many|over_request/i.test(`${error?.code} ${message}`)) {
    return 'Too many attempts. Please wait a minute before trying again.';
  }
  if (/fetch|network|connection|timeout|timed out/i.test(message) || error?.name === 'AuthRetryableFetchError') {
    return 'We couldn’t connect to verify your code. Check your connection and try again.';
  }
  if (error?.code === 'otp_expired' || /expired/i.test(message)) {
    return 'That code is invalid or has expired. Enter the latest code or request a new one.';
  }
  return message || 'That code didn’t work. Check the latest email or resend a fresh one.';
}

export default function SignInDialog({
  open,
  onOpenChange,
  title = 'Create your free account',
  description = 'Save your scores and progress across devices.',
  trigger = 'site',
  initialMode = 'signup', // 'signup' | 'signin'
  // In-context gates (e.g. a question page resuming a pending submission)
  // pass false so finishing auth keeps the user on the page instead of the
  // default dashboard-first redirect.
  redirectOnFinish = true,
}) {
  const router = useRouter();
  const {
    signUpWithPassword,
    signInWithPassword,
    verifyEmailOtp,
    resendSignupEmail,
    requestPasswordReset,
    updatePassword,
  } = useAuth();

  const [mounted, setMounted] = React.useState(false);
  const [mode, setMode] = React.useState('signup'); // signup | signin
  const [step, setStep] = React.useState('account'); // account | verify | newpass
  // What triggered the verify step — decides how "Resend code" re-sends and
  // where verification continues: 'signup' -> confirmation email -> finish,
  // 'recovery' -> password reset code -> choose a new password.
  const [verifySource, setVerifySource] = React.useState('signup');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [code, setCode] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState('');
  const [notice, setNotice] = React.useState('');
  const [resendIn, setResendIn] = React.useState(0);
  // "Did you mean …@gmail.com?" — shown on blur, and asked once before sign-up.
  const [emailFix, setEmailFix] = React.useState(null);
  const [typoAskedFor, setTypoAskedFor] = React.useState('');
  const dialogRef = React.useRef(null);
  const authInFlight = React.useRef(false);
  const wasOpen = React.useRef(false);
  const beginAuth = () => {
    if (authInFlight.current) return false;
    authInFlight.current = true;
    setBusy(true);
    return true;
  };
  const endAuth = () => {
    authInFlight.current = false;
    setBusy(false);
  };

  const finishStandardAuth = React.useCallback(() => {
    onOpenChange?.(false);
    if (redirectOnFinish && router.asPath !== POST_AUTH_PATH) {
      void router.replace(POST_AUTH_PATH);
    }
  }, [onOpenChange, redirectOnFinish, router]);

  const closeDialog = React.useCallback(() => {
    onOpenChange?.(false);
  }, [onOpenChange]);

  useDialogFocus({
    active: mounted && open,
    containerRef: dialogRef,
    onDismiss: closeDialog,
    focusKey: `${step}:${mode}`,
  });

  React.useEffect(() => setMounted(true), []);

  // Preserve unfinished code verification/recovery when returning from email.
  React.useEffect(() => {
    const opening = open && !wasOpen.current;
    wasOpen.current = open;
    if (opening) {
      if (step === 'verify' || step === 'newpass' || authInFlight.current) return;
      setMode(initialMode === 'signin' ? 'signin' : 'signup');
      setStep('account');
      setVerifySource('signup');
      setPassword('');
      setCode('');
      setBusy(false);
      setErrorMsg('');
      setNotice('');
      setEmailFix(null);
      setTypoAskedFor('');
      track('signin_gate_shown', { trigger, signed_in: false });
    }
  }, [open, trigger, initialMode, step]);

  // Scroll lock while the dialog is active. Escape, focus containment, and
  // trigger restoration are handled by useDialogFocus.
  React.useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Resend cooldown ticker.
  React.useEffect(() => {
    if (resendIn <= 0) return undefined;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  if (!mounted || !open) return null;

  const close = closeDialog;

  const handleAccountSubmit = async (e) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed || !password || (mode === 'signup' && password.length < 8)) return;
    if (mode === 'signup') {
      if (isDisposableEmail(trimmed)) {
        setErrorMsg(DISPOSABLE_MESSAGE);
        return;
      }
      // A likely typo ("gamil.com") can never receive the code: ask once,
      // then let a second click go ahead with what they typed.
      const fix = suggestEmailFix(trimmed);
      if (fix && typoAskedFor !== trimmed) {
        setEmailFix(fix);
        setTypoAskedFor(trimmed);
        track('signup_email_typo_hint', { trigger, signed_in: false });
        return;
      }
    }
    if (!beginAuth()) return;
    setErrorMsg('');
    setNotice('');
    try {
      if (mode === 'signup') {
        const check = await precheckSignupEmail(trimmed);
        if (check.ok === false && check.reason === 'disposable') {
          setErrorMsg(DISPOSABLE_MESSAGE);
          return;
        }
        if (check.ok === false && check.reason === 'alias') {
          track('signup_email_alias', { trigger, signed_in: false });
          setMode('signin');
          setPassword('');
          setNotice(
            `This inbox already has an account${check.hint ? ` (${check.hint})` : ''}. Sign in with that address — or reset its password below.`
          );
          return;
        }
        track('signup_start', { method: 'password', trigger, signed_in: false, experiment: SIGNUP_EXPERIMENT });
        const { data, error } = await signUpWithPassword(trimmed, password);
        if (error) {
          // The auth_mailbox_claim / disposable-email triggers surface through
          // Supabase as a generic database error unless the Before User
          // Created hook is enabled.
          setErrorMsg(
            /database error saving new user/i.test(error.message || '')
              ? 'We couldn’t create an account with this email. If you already have one, sign in instead — or use an address you’ll keep.'
              : error.message || 'Could not create your account. Please try again.'
          );
          return;
        }
        // Supabase obfuscates existing accounts: user comes back with no
        // identities. Route those people to sign-in instead.
        if (data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
          setMode('signin');
          setNotice('You already have an account — sign in below.');
          return;
        }
        // Some projects auto-confirm; if a session exists, skip verification.
        if (data?.session) {
          track('signup_verified', { trigger, method: 'auto', experiment: SIGNUP_EXPERIMENT });
          setStep('account');
          finishStandardAuth();
          return;
        }
        setVerifySource('signup');
        setResendIn(60);
        setStep('verify');
      } else {
        track('login_start', { method: 'password', trigger, signed_in: false });
        const { error } = await signInWithPassword(trimmed, password);
        if (error) {
          // Unconfirmed account: push them into the verify step instead of a
          // dead-end error.
          if (matchesAuthError(error, 'email_not_confirmed', /email not confirmed/i)) {
            const { error: resendError } = await resendSignupEmail(trimmed);
            if (resendError) {
              setErrorMsg(
                resendError.message
                  || 'Could not send a confirmation code. Please try again.'
              );
            }
            setVerifySource('signup');
            setCode('');
            setResendIn(60);
            setStep('verify');
            return;
          }
          setErrorMsg(
            matchesAuthError(error, 'invalid_credentials', /invalid login credentials/i)
              ? 'Email or password is incorrect. If you’ve forgotten your password, reset it below.'
              : error.message || 'Could not sign you in. Please try again.'
          );
          return;
        }
        track('login_success', { method: 'password', trigger });
        finishStandardAuth();
      }
    } finally {
      endAuth();
    }
  };

  const handleVerifySubmit = async (e) => {
    e.preventDefault();
    const token = code.trim();
    if (token.length !== 6) return;
    if (!beginAuth()) return;
    setErrorMsg('');
    try {
      const { error } = await verifyEmailOtp(
        email.trim(),
        token,
        verifySource === 'recovery' ? 'recovery' : 'signup'
      );
      if (error) {
        setErrorMsg(verificationError(error));
        return;
      }
      if (verifySource === 'recovery') {
        // Code accepted -> the user is signed in on a recovery session;
        // finish by letting them choose a new password.
        track('password_reset_verified', { trigger });
        setPassword('');
        setStep('newpass');
        return;
      }
      track('signup_verified', { trigger, method: 'otp', experiment: SIGNUP_EXPERIMENT });
      setStep('account');
      finishStandardAuth();
    } finally {
      endAuth();
    }
  };

  const handleResend = async () => {
    if (resendIn > 0 || !beginAuth()) return;
    setResendIn(60);
    setErrorMsg('');
    try {
      const { error } = verifySource === 'recovery'
        ? await requestPasswordReset(email.trim())
        : await resendSignupEmail(email.trim());
      if (error) {
        if (error.status !== 429 && !/rate|too many/i.test(`${error.code} ${error.message}`)) setResendIn(0);
        setErrorMsg(error.message || 'Could not resend the email. Please try again.');
      } else {
        setCode('');
      }
    } finally {
      endAuth();
    }
  };

  // "Forgot password?" — email a 6-digit recovery code, verified in the same
  // modal, then the user sets a new password on the recovered session.
  const handleForgotPassword = async () => {
    if (!beginAuth()) return;
    setErrorMsg('');
    try {
      track('password_reset_start', { trigger, signed_in: false });
      const { error } = await requestPasswordReset(email.trim());
      if (error) {
        setErrorMsg(error.message || 'Could not send the reset code. Please try again.');
        return;
      }
      setVerifySource('recovery');
      setResendIn(60);
      setCode('');
      setStep('verify');
    } finally {
      endAuth();
    }
  };

  const handleNewPasswordSubmit = async (e) => {
    e.preventDefault();
    if (password.length < 8) return;
    if (!beginAuth()) return;
    setErrorMsg('');
    try {
      const { error } = await updatePassword(password, email.trim());
      if (error) {
        setErrorMsg(error.message || 'Could not update your password. Please try again.');
        return;
      }
      track('password_reset_success', { trigger });
      setStep('account');
      finishStandardAuth();
    } finally {
      endAuth();
    }
  };

  const header = (icon, heading, sub) => (
    <div className="mb-5 flex flex-col gap-1.5 text-left">
      <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/5 ring-1 ring-primary/10">
        {icon}
      </span>
      <h2 id="signin-title" className="mt-2 text-xl font-bold tracking-tight text-foreground">
        {heading}
      </h2>
      <p className="text-sm text-muted-foreground">{sub}</p>
    </div>
  );

  let body;
  if (step === 'verify') {
    body = (
      <>
        {header(
          <ShieldCheck className="h-5 w-5 text-primary" />,
          verifySource === 'recovery' ? 'Reset your password' : 'Confirm your email',
          <>
            Enter the 6-digit email code for{' '}
            <span className="font-medium text-foreground">{email.trim()}</span>.
          </>
        )}
        <form onSubmit={handleVerifySubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="signin-otp">Verification code</Label>
            <Input
              id="signin-otp"
              data-dialog-initial-focus
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              className="text-center text-lg font-semibold tracking-[0.5em]"
              value={code}
              onChange={(e) => setCode(normalizeOtp(e.target.value))}
              disabled={busy}
              autoFocus
            />
          </div>
          {errorMsg && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {errorMsg}
            </p>
          )}
          <p className="text-xs leading-relaxed text-muted-foreground">
            Can’t find it? Codes can take a minute — check your Spam, Junk or Promotions folder for an
            email from IELTS Bank.
          </p>
          <Button type="submit" variant="accent" className="w-full" disabled={busy || code.length !== 6}>
            {busy ? 'Verifying…' : verifySource === 'recovery' ? 'Continue' : 'Verify email'}
          </Button>
          <button
            type="button"
            onClick={handleResend}
            disabled={busy || resendIn > 0}
            className="text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline disabled:cursor-default disabled:opacity-60 disabled:hover:no-underline"
          >
            {resendIn > 0 ? `Resend code in ${resendIn}s` : 'Resend code'}
          </button>
          <button type="button" disabled={busy} className="text-sm underline" onClick={() => {
            setStep('account');
            setCode('');
            setPassword('');
            setErrorMsg('');
            setNotice('');
          }}>
            Change email or go back
          </button>
        </form>
      </>
    );
  } else if (step === 'newpass') {
    body = (
      <>
        {header(
          <KeyRound className="h-5 w-5 text-primary" />,
          'Choose a new password',
          'You’re signed in — set a new password to finish resetting it.'
        )}
        <form onSubmit={handleNewPasswordSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="signin-newpass">New password</Label>
            <Input
              id="signin-newpass"
              data-dialog-initial-focus
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              placeholder="At least 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
              autoFocus
            />
          </div>
          {errorMsg && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {errorMsg}
            </p>
          )}
          <Button type="submit" variant="accent" className="w-full" disabled={busy || password.length < 8}>
            {busy ? 'Saving…' : 'Save new password'}
          </Button>
          <button type="button" disabled={busy} className="text-sm underline" onClick={() => {
            setMode('signin');
            setStep('account');
            setPassword('');
            setCode('');
            setErrorMsg('');
            setNotice('Check your email address, then choose Forgot password? to request a new reset code.');
          }}>
            Request a new reset code
          </button>
        </form>
      </>
    );
  } else {
    // account step
    body = (
      <>
        {header(
          <Mail className="h-5 w-5 text-primary" />,
          mode === 'signup' ? title : 'Welcome back',
          mode === 'signup' ? description : 'Sign in to pick up where you left off.'
        )}
        {notice && (
          <p className="mb-3 rounded-md bg-accent/10 px-3 py-2 text-sm font-medium text-foreground">
            {notice}
          </p>
        )}
        <form onSubmit={handleAccountSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="signin-email">Email</Label>
            <Input
              id="signin-email"
              data-dialog-initial-focus
              type="email"
              autoComplete="email"
              required
              placeholder="you@example.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setEmailFix(null);
              }}
              onBlur={() => setEmailFix(suggestEmailFix(email))}
              aria-describedby={emailFix ? 'signin-email-fix' : undefined}
              disabled={busy}
            />
            {emailFix && (
              <p id="signin-email-fix" role="status" className="text-sm text-muted-foreground">
                Did you mean{' '}
                <button
                  type="button"
                  className="font-semibold text-foreground underline underline-offset-4"
                  onClick={() => {
                    setEmail(emailFix);
                    setEmailFix(null);
                    track('signup_email_typo_fixed', { trigger, mode });
                  }}
                >
                  {emailFix}
                </button>
                ?
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="signin-password">Password</Label>
            <Input
              id="signin-password"
              type="password"
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              required
              minLength={mode === 'signup' ? 8 : undefined}
              placeholder={mode === 'signup' ? 'At least 8 characters' : 'Your password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
            />
          </div>
          {errorMsg && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {errorMsg}
            </p>
          )}
          <Button
            type="submit"
            variant="accent"
            className="w-full"
            disabled={
              busy
              || !email.trim()
              || !password
              || (mode === 'signup'
                && password.length < 8)
            }
          >
            {busy ? 'One moment…' : mode === 'signup' ? 'Create account' : 'Sign in'}
          </Button>
          <p className="text-center text-xs leading-relaxed text-muted-foreground">
            By {mode === 'signup' ? 'creating an account' : 'continuing'}, you agree to our{' '}
            <a
              href="/termsofservice"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium underline underline-offset-4 hover:text-foreground"
            >
              Terms of Service
            </a>{' '}
            and{' '}
            <a
              href="/privacypolicy"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium underline underline-offset-4 hover:text-foreground"
            >
              Privacy Policy
            </a>
            .
          </p>
        </form>
        <div className="mt-4 flex flex-col gap-1.5 text-center text-sm text-muted-foreground">
          {mode === 'signup' ? (
            <button
              type="button"
              className="font-medium underline-offset-4 hover:text-foreground hover:underline"
              onClick={() => {
                setMode('signin');
                setErrorMsg('');
                setNotice('');
              }}
            >
              Already have an account? Sign in
            </button>
          ) : (
            <>
              <button
                type="button"
                className="font-medium underline-offset-4 hover:text-foreground hover:underline"
                onClick={() => {
                  setMode('signup');
                  setErrorMsg('');
                  setNotice('');
                }}
              >
                New here? Create an account
              </button>
              <button
                type="button"
                disabled={busy || !email.trim()}
                className="font-medium underline-offset-4 hover:text-foreground hover:underline disabled:opacity-60"
                onClick={handleForgotPassword}
              >
                Forgot password?
              </button>
            </>
          )}
        </div>
      </>
    );
  }

  return createPortal(
    // The portal mounts on document.body, outside the app's font wrapper —
    // re-apply the Inter variable + font-sans here or the dialog falls back
    // to the browser serif font.
    <div className={cn('fixed inset-0 z-[2000]', inter.variable, 'font-sans')}>
      <div
        onClick={close}
        data-analytics-id="signin_backdrop"
        className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm animate-in fade-in"
      />
      <div className="fixed inset-0 z-[2001] flex items-center justify-center p-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="signin-title"
          tabIndex={-1}
          data-analytics-id="signin_dialog"
          data-analytics-surface="authentication"
          onClick={(e) => e.stopPropagation()}
          className={cn(
            'relative w-full max-w-md rounded-xl border border-border bg-background p-6 shadow-2xl',
            'animate-in fade-in zoom-in-95 duration-200'
          )}
        >
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="absolute right-4 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-5 w-5" />
          </button>
          {body}
        </div>
      </div>
    </div>,
    document.body
  );
}
