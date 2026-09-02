import * as React from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/router';
import {
  X,
  Mail,
  ShieldCheck,
  GraduationCap,
  Briefcase,
  Globe2,
  Sparkles,
  KeyRound,
  CalendarDays,
} from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Checkbox } from '../../../components/ui/checkbox';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { cn } from '../../lib/utils';
import { useAuth } from '../../lib/auth';
import { getSupabase } from '../../../lib/supabase';
import { track } from '../../lib/analytics';
import { POST_AUTH_PATH } from '../../lib/authPaths';
import { inter } from '../../lib/fonts';
import { useDialogFocus } from '../../lib/dialogFocus';
import {
  defaultEmailOptIns,
  emailConsentOptInRegion,
  withEmailConsent,
} from '../../lib/emailConsent';

// Auth + onboarding dialog. Keeps the historical SignInDialog prop contract
// (open / onOpenChange / title / description / trigger) so every existing
// sign-in gate gets the new flow.
//
// Flow (all in this one modal until authentication is complete):
//   1. account  — email + password; Create account (default) or Sign in.
//   2. verify   — 6-digit emailed code (OTP only, no magic links; the
//                 Supabase email templates must render {{ .Token }}).
//   3. about    — goal, target band, and optional exam date saved to the
//                 users row. Skippable.
// Existing users signing in with a password skip 2–3 entirely. Accounts from
// the magic-link era (no password) sign in via an emailed one-time code. All
// successful signup and sign-in paths finish on /dashboard, unless the caller
// passes redirectOnFinish={false} to stay on the current page.

const GOALS = [
  { key: 'study', label: 'Study abroad', icon: GraduationCap },
  { key: 'work', label: 'Work / visa', icon: Briefcase },
  { key: 'immigration', label: 'Immigration', icon: Globe2 },
  { key: 'general', label: 'General English', icon: Sparkles },
];
const BANDS = ['6.0', '6.5', '7.0', '7.5', '8.0+'];

function matchesAuthError(error, code, legacyMessagePattern) {
  return error?.code === code || legacyMessagePattern.test(error?.message || '');
}

// Merge goal + target band + the two email opt-ins into the signed-in user's
// row. Fails soft — the worst outcome is an unanswered onboarding question.
async function saveProfile(userId, { goal, band, examDate, studyPlanEmails, marketingEmails }) {
  if (!userId) return;
  try {
    const supabase = getSupabase();
    const { data } = await supabase.from('users').select('prefs').eq('id', userId).maybeSingle();
    let prefs = data?.prefs && typeof data.prefs === 'object' ? { ...data.prefs } : {};
    if (goal) prefs.goal = goal;
    // Records both answers, their timestamps, and the consent basis/region for
    // the audit trail — including an explicit "no", which is what makes a
    // later send defensible.
    prefs = withEmailConsent(prefs, {
      studyPlan: studyPlanEmails,
      marketing: marketingEmails,
      source: 'onboarding',
    });
    const patch = { prefs };
    if (band) patch.target_band = parseFloat(band); // '8.0+' -> 8
    if (examDate) {
      patch.exam_date = examDate;
      prefs.examDate = examDate;
    }
    await supabase.from('users').update(patch).eq('id', userId);
  } catch {
    /* non-fatal */
  }
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
    user,
    signInWithEmail,
    signUpWithPassword,
    signInWithPassword,
    verifyEmailOtp,
    resendSignupEmail,
    requestPasswordReset,
    updatePassword,
  } = useAuth();

  const [mounted, setMounted] = React.useState(false);
  const [mode, setMode] = React.useState('signup'); // signup | signin
  const [step, setStep] = React.useState('account'); // account | verify | newpass | about
  // What triggered the verify step — decides how "Resend code" re-sends and
  // where verification continues: 'signup' -> confirmation email -> about,
  // 'signin' -> one-time sign-in code -> done, 'recovery' -> password reset
  // code -> choose a new password.
  const [verifySource, setVerifySource] = React.useState('signup');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [firstName, setFirstName] = React.useState('');
  const [lastName, setLastName] = React.useState('');
  const [code, setCode] = React.useState('');
  const [goal, setGoal] = React.useState('');
  const [band, setBand] = React.useState('');
  const [examDate, setExamDate] = React.useState('');
  // Email opt-ins. Outside opt-in regions the study-plan box starts ticked
  // (it is the service being signed up for); inside the EU/EEA/UK/CH — and
  // whenever geo is unknown — nothing is pre-ticked. Marketing is never
  // pre-ticked anywhere.
  const [optInRegion, setOptInRegion] = React.useState(true);
  const [studyPlanEmails, setStudyPlanEmails] = React.useState(false);
  const [marketingEmails, setMarketingEmails] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState('');
  const [notice, setNotice] = React.useState('');
  const [resendIn, setResendIn] = React.useState(0);
  const dialogRef = React.useRef(null);

  const finishStandardAuth = React.useCallback(() => {
    onOpenChange?.(false);
    if (redirectOnFinish && router.asPath !== POST_AUTH_PATH) {
      void router.replace(POST_AUTH_PATH);
    }
  }, [onOpenChange, redirectOnFinish, router]);

  const closeDialog = React.useCallback(() => {
    // Reaching onboarding means signup has already produced a valid session.
    // Closing or skipping this optional step must still honor the dashboard-
    // first destination.
    if (step === 'about') {
      finishStandardAuth();
      return;
    }
    onOpenChange?.(false);
  }, [step, finishStandardAuth, onOpenChange]);

  useDialogFocus({
    active: mounted && open,
    containerRef: dialogRef,
    onDismiss: closeDialog,
    focusKey: `${step}:${mode}`,
  });

  React.useEffect(() => setMounted(true), []);

  // Reset whenever the dialog is (re)opened.
  React.useEffect(() => {
    if (open) {
      setMode(initialMode === 'signin' ? 'signin' : 'signup');
      setStep('account');
      setVerifySource('signup');
      setPassword('');
      setCode('');
      setGoal('');
      setBand('');
      setExamDate('');
      const region = emailConsentOptInRegion();
      const defaults = defaultEmailOptIns(region);
      setOptInRegion(region);
      setStudyPlanEmails(defaults.studyPlan);
      setMarketingEmails(defaults.marketing);
      setBusy(false);
      setErrorMsg('');
      setNotice('');
      track('signin_gate_shown', { trigger, signed_in: false });
    }
  }, [open, trigger, initialMode]);

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

  // Safety net: if a session appears in another tab while we sit on the
  // verify step (e.g. an old emailed link), supabase-js syncs it here —
  // continue without requiring the code.
  React.useEffect(() => {
    if (open && step === 'verify' && user?.id) {
      setErrorMsg('');
      if (verifySource === 'signin') {
        track('login_success', { method: 'email_otp', trigger });
        finishStandardAuth();
      } else if (verifySource === 'recovery') {
        setPassword('');
        setStep('newpass');
      } else {
        track('signup_verified', { trigger, method: 'link' });
        setStep('about');
      }
    }
  }, [open, step, user?.id, verifySource, trigger, finishStandardAuth]);

  // Resend cooldown ticker.
  React.useEffect(() => {
    if (resendIn <= 0) return undefined;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  if (!mounted || !open) return null;

  const close = closeDialog;

  // "seleem shaalan" -> "Seleem Shaalan" (hyphens/apostrophes kept intact).
  const titleCase = (value) =>
    value.trim().replace(/\S+/g, (word) => word.charAt(0).toUpperCase() + word.slice(1));

  const handleAccountSubmit = async (e) => {
    e.preventDefault();
    const trimmed = email.trim();
    const first = titleCase(firstName);
    const last = titleCase(lastName);
    if (!trimmed || !password || (mode === 'signup' && (password.length < 8 || !first || !last))) return;
    setBusy(true);
    setErrorMsg('');
    setNotice('');
    try {
      if (mode === 'signup') {
        track('signup_start', { method: 'password', trigger, signed_in: false });
        const { data, error } = await signUpWithPassword(trimmed, password, {
          full_name: `${first} ${last}`,
          first_name: first,
          last_name: last,
        });
        if (error) {
          setErrorMsg(error.message || 'Could not create your account. Please try again.');
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
          track('signup_verified', { trigger, method: 'auto' });
          setStep('about');
          return;
        }
        setVerifySource('signup');
        setResendIn(30);
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
              return;
            }
            setVerifySource('signup');
            setResendIn(30);
            setStep('verify');
            return;
          }
          setErrorMsg(
            matchesAuthError(error, 'invalid_credentials', /invalid login credentials/i)
              ? 'Email or password is incorrect. If you signed up before we added passwords, use the emailed code option below.'
              : error.message || 'Could not sign you in. Please try again.'
          );
          return;
        }
        track('login_success', { method: 'password', trigger });
        finishStandardAuth();
      }
    } finally {
      setBusy(false);
    }
  };

  const handleVerifySubmit = async (e) => {
    e.preventDefault();
    const token = code.trim();
    if (token.length < 6) return;
    setBusy(true);
    setErrorMsg('');
    try {
      const { error } = await verifyEmailOtp(
        email.trim(),
        token,
        verifySource === 'signin' ? 'email' : verifySource === 'recovery' ? 'recovery' : 'signup'
      );
      if (error) {
        setErrorMsg('That code didn’t work. Check the latest email or resend a fresh one.');
        return;
      }
      if (verifySource === 'signin') {
        // Existing account signing in with a code — no onboarding questions.
        track('login_success', { method: 'email_otp', trigger });
        finishStandardAuth();
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
      track('signup_verified', { trigger, method: 'otp' });
      setStep('about');
    } finally {
      setBusy(false);
    }
  };

  const handleResend = async () => {
    if (resendIn > 0) return;
    setResendIn(30);
    setErrorMsg('');
    const { error } =
      verifySource === 'signin'
        ? await signInWithEmail(email.trim())
        : verifySource === 'recovery'
          ? await requestPasswordReset(email.trim())
          : await resendSignupEmail(email.trim());
    if (error) {
      setResendIn(0);
      setErrorMsg(error.message || 'Could not resend the email. Please try again.');
    }
  };

  // "Forgot password?" — email a 6-digit recovery code, verified in the same
  // modal, then the user sets a new password on the recovered session.
  const handleForgotPassword = async () => {
    setBusy(true);
    setErrorMsg('');
    try {
      track('password_reset_start', { trigger, signed_in: false });
      const { error } = await requestPasswordReset(email.trim());
      if (error) {
        setErrorMsg(error.message || 'Could not send the reset code. Please try again.');
        return;
      }
      setVerifySource('recovery');
      setResendIn(30);
      setCode('');
      setStep('verify');
    } finally {
      setBusy(false);
    }
  };

  const handleNewPasswordSubmit = async (e) => {
    e.preventDefault();
    if (password.length < 8) return;
    setBusy(true);
    setErrorMsg('');
    try {
      const { error } = await updatePassword(password);
      if (error) {
        setErrorMsg(error.message || 'Could not update your password. Please try again.');
        return;
      }
      track('password_reset_success', { trigger });
      close();
    } finally {
      setBusy(false);
    }
  };

  // Passwordless sign-in for magic-link-era accounts: email a one-time code,
  // verified in the same modal (no link round-trip).
  const handleEmailCode = async () => {
    setBusy(true);
    setErrorMsg('');
    try {
      track('login_start', { method: 'email_otp', trigger, signed_in: false });
      const { error } = await signInWithEmail(email.trim());
      if (error) {
        setErrorMsg(error.message || 'Could not send the code. Please try again.');
        return;
      }
      setVerifySource('signin');
      setResendIn(30);
      setCode('');
      setStep('verify');
    } finally {
      setBusy(false);
    }
  };

  const handleAboutSubmit = async (skipped) => {
    setBusy(true);
    try {
      // Skipping stores nothing at all — a pre-ticked box the user never saw
      // through to a submit is not consent.
      if (!skipped) {
        await saveProfile(user?.id, { goal, band, examDate, studyPlanEmails, marketingEmails });
      }
      track('onboarding_answered', {
        trigger,
        skipped: Boolean(skipped),
        goal: skipped ? null : goal || null,
        target_band: skipped ? null : band || null,
        exam_date: skipped ? null : examDate || null,
        study_plan_emails: skipped ? null : studyPlanEmails,
        marketing_emails: skipped ? null : marketingEmails,
        consent_basis: optInRegion ? 'opt_in' : 'opt_out',
      });
    } finally {
      setBusy(false);
      finishStandardAuth();
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

  const chip = (selected) =>
    cn(
      'flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
      'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      selected
        ? 'border-accent bg-accent/10 text-foreground'
        : 'border-input text-muted-foreground hover:border-accent/50 hover:text-foreground'
    );

  let body;
  if (step === 'verify') {
    body = (
      <>
        {header(
          <ShieldCheck className="h-5 w-5 text-primary" />,
          verifySource === 'signin'
            ? 'Enter your sign-in code'
            : verifySource === 'recovery'
              ? 'Reset your password'
              : 'Confirm your email',
          <>
            Enter the 6-digit code we sent to{' '}
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
              maxLength={6}
              placeholder="123456"
              className="text-center text-lg font-semibold tracking-[0.5em]"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              disabled={busy}
              autoFocus
            />
          </div>
          {errorMsg && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {errorMsg}
            </p>
          )}
          <Button type="submit" variant="accent" className="w-full" disabled={busy || code.length < 6}>
            {busy
              ? 'Verifying…'
              : verifySource === 'signin'
                ? 'Sign in'
                : verifySource === 'recovery'
                  ? 'Continue'
                  : 'Verify email'}
          </Button>
          <button
            type="button"
            onClick={handleResend}
            disabled={resendIn > 0}
            className="text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline disabled:cursor-default disabled:opacity-60 disabled:hover:no-underline"
          >
            {resendIn > 0 ? `Resend code in ${resendIn}s` : 'Resend code'}
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
        </form>
      </>
    );
  } else if (step === 'about') {
    body = (
      <>
        {header(
          <Sparkles className="h-5 w-5 text-primary" />,
          'A quick practice plan',
          'Tell us your goal and deadline so we can shape the right next step.'
        )}
        <div className="flex flex-col gap-4">
          <div>
            <p className="mb-2 text-sm font-semibold text-foreground">What are you preparing for?</p>
            <div className="grid grid-cols-2 gap-2">
              {GOALS.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  type="button"
                  data-dialog-initial-focus={key === GOALS[0].key ? '' : undefined}
                  onClick={() => setGoal(key)}
                  className={chip(goal === key)}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold text-foreground">Target band score?</p>
            <div className="flex flex-wrap gap-2">
              {BANDS.map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => setBand(b)}
                  className={cn(chip(band === b), 'min-w-[3.5rem] justify-center tabular-nums')}
                >
                  {b}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label htmlFor="onboarding-exam-date">When is your test?</Label>
            <div className="relative mt-2">
              <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="onboarding-exam-date"
                type="date"
                value={examDate}
                min={new Date().toISOString().slice(0, 10)}
                onChange={(event) => setExamDate(event.target.value)}
                className="pl-9"
              />
            </div>
            <button
              type="button"
              onClick={() => setExamDate('')}
              className="mt-2 text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              Not booked yet
            </button>
          </div>
          <div className="flex flex-col gap-3 rounded-lg border border-input p-3">
            <label
              htmlFor="onboarding-study-plan-emails"
              className="flex cursor-pointer items-start gap-2.5 text-sm text-foreground"
            >
              <Checkbox
                id="onboarding-study-plan-emails"
                className="mt-0.5"
                checked={studyPlanEmails}
                onCheckedChange={setStudyPlanEmails}
              />
              <span>
                Send me a study plan for my exam date
                <span className="block text-xs text-muted-foreground">
                  Countdown, weekly progress, and streak reminders. Stop any time in one click.
                </span>
              </span>
            </label>
            <label
              htmlFor="onboarding-marketing-emails"
              className="flex cursor-pointer items-start gap-2.5 text-sm text-foreground"
            >
              <Checkbox
                id="onboarding-marketing-emails"
                className="mt-0.5"
                checked={marketingEmails}
                onCheckedChange={setMarketingEmails}
              />
              <span>
                Tips and offers by email
                <span className="block text-xs text-muted-foreground">
                  Occasional IELTS guides and product offers. Separate from your study plan.
                </span>
              </span>
            </label>
          </div>
          <Button
            variant="accent"
            className="w-full"
            disabled={busy || (!goal && !band && !examDate && !studyPlanEmails && !marketingEmails)}
            onClick={() => handleAboutSubmit(false)}
          >
            {busy ? 'Saving…' : 'Start practising'}
          </Button>
          <button
            type="button"
            onClick={() => handleAboutSubmit(true)}
            className="text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Skip for now
          </button>
        </div>
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
          {mode === 'signup' && (
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="signup-first-name">First name</Label>
                <Input
                  id="signup-first-name"
                  type="text"
                  autoComplete="given-name"
                  autoCapitalize="words"
                  required
                  placeholder="First name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  disabled={busy}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="signup-last-name">Last name</Label>
                <Input
                  id="signup-last-name"
                  type="text"
                  autoComplete="family-name"
                  autoCapitalize="words"
                  required
                  placeholder="Last name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  disabled={busy}
                />
              </div>
            </div>
          )}
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
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy}
            />
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
                && (password.length < 8 || !firstName.trim() || !lastName.trim()))
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
                onClick={handleEmailCode}
              >
                Email me a one-time code instead
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
