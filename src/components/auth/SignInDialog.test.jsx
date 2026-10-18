// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

const testState = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signUpWithPassword: vi.fn(),
  resendSignupEmail: vi.fn(),
  replace: vi.fn(),
  verifyEmailOtp: vi.fn(),
  requestPasswordReset: vi.fn(),
  updatePassword: vi.fn(),
  user: null,
}));

vi.mock('next/router', () => ({
  useRouter: () => ({
    asPath: '/',
    replace: testState.replace,
  }),
}));
vi.mock('../../lib/auth', () => ({
  useAuth: () => ({
    user: testState.user,
    signUpWithPassword: testState.signUpWithPassword,
    signInWithPassword: testState.signInWithPassword,
    verifyEmailOtp: testState.verifyEmailOtp,
    resendSignupEmail: testState.resendSignupEmail,
    requestPasswordReset: testState.requestPasswordReset,
    updatePassword: testState.updatePassword,
  }),
}));
vi.mock('../../../lib/supabase', () => ({
  getSupabase: vi.fn(),
}));
vi.mock('../../lib/analytics', () => ({
  track: vi.fn(),
}));
vi.mock('../../lib/fonts', () => ({
  inter: { variable: '' },
}));

import SignInDialog from './SignInDialog';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container;
let root;

function setInput(id, value) {
  const input = document.querySelector(id);
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value'
  ).set;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function renderDialog(initialMode) {
  await act(async () => {
    root.render(
      <SignInDialog
        open
        onOpenChange={vi.fn()}
        initialMode={initialMode}
      />
    );
    await Promise.resolve();
  });
}

beforeEach(() => {
  testState.user = null;
  testState.verifyEmailOtp.mockResolvedValue({error:null});
  testState.requestPasswordReset.mockResolvedValue({error:null});
  testState.updatePassword.mockResolvedValue({error:null});
  testState.signInWithPassword.mockResolvedValue({ error: null });
  testState.resendSignupEmail.mockResolvedValue({ error: null });
  testState.signUpWithPassword.mockResolvedValue({
    data: { user: { identities: [{}] }, session: null },
    error: null,
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('SignInDialog password validation', () => {
  it('lets the authentication service evaluate an existing six-character password', async () => {
    await renderDialog('signin');
    expect(document.body.textContent).not.toContain('Email me a one-time code instead');
    expect(document.body.textContent).toContain('Forgot password?');
    setInput('#signin-email', 'legacy-user@example.com');
    setInput('#signin-password', '123456');

    const password = document.querySelector('#signin-password');
    const submit = document.querySelector('[role="dialog"] button[type="submit"]');
    expect(password.getAttribute('minlength')).toBeNull();
    expect(submit.disabled).toBe(false);

    await act(async () => {
      submit.closest('form').dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true })
      );
      await Promise.resolve();
    });

    expect(testState.signInWithPassword).toHaveBeenCalledWith(
      'legacy-user@example.com',
      '123456'
    );
  });

  it('keeps the eight-character client minimum for new accounts', async () => {
    await renderDialog('signup');
    setInput('#signin-email', 'new-user@example.com');
    setInput('#signin-password', '123456');

    const password = document.querySelector('#signin-password');
    const submit = document.querySelector('[role="dialog"] button[type="submit"]');
    expect(password.getAttribute('minlength')).toBe('8');
    expect(submit.disabled).toBe(true);

    setInput('#signin-password', '12345678');
    expect(submit.disabled).toBe(false);
  });

  it('creates an account with only email and password', async () => {
    await renderDialog('signup');
    setInput('#signin-email', 'new-user@example.com');
    setInput('#signin-password', '12345678');

    const submit = document.querySelector('[role="dialog"] button[type="submit"]');
    expect(submit.disabled).toBe(false);
    expect(document.querySelector('#signup-first-name')).toBeNull();
    expect(document.querySelector('#signup-last-name')).toBeNull();

    testState.signUpWithPassword.mockResolvedValue({ data: { user: { identities: [{}] } }, error: null });
    await act(async () => {
      submit.closest('form').dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true })
      );
      await Promise.resolve();
    });

    expect(testState.signUpWithPassword).toHaveBeenCalledWith(
      'new-user@example.com',
      '12345678'
    );
  });

  it('does not claim a confirmation code was sent when automatic resend fails', async () => {
    testState.signInWithPassword.mockResolvedValue({
      error: Object.assign(new Error('Confirm your email before signing in'), {
        code: 'email_not_confirmed',
      }),
    });
    testState.resendSignupEmail.mockResolvedValue({
      error: new Error('Email service unavailable'),
    });
    await renderDialog('signin');
    setInput('#signin-email', 'unconfirmed@example.com');
    setInput('#signin-password', 'password123');

    const submit = document.querySelector('[role="dialog"] button[type="submit"]');
    await act(async () => {
      submit.closest('form').dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true })
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(testState.resendSignupEmail).toHaveBeenCalledWith(
      'unconfirmed@example.com'
    );
    expect(document.querySelector('[role="alert"]')?.textContent).toContain(
      'Email service unavailable'
    );
    expect(document.querySelector('#signin-password')).toBeNull();
    expect(document.querySelector('#signin-otp')).not.toBeNull();
  });

  it('uses the stable invalid-credentials code instead of exposing provider text', async () => {
    testState.signInWithPassword.mockResolvedValue({
      error: Object.assign(new Error('Authentication failed for supplied login'), {
        code: 'invalid_credentials',
      }),
    });
    await renderDialog('signin');
    setInput('#signin-email', 'learner@example.com');
    setInput('#signin-password', 'password123');

    const submit = document.querySelector('[role="dialog"] button[type="submit"]');
    await act(async () => {
      submit.closest('form').dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true })
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(document.querySelector('[role="alert"]')?.textContent).toBe(
      'Email or password is incorrect. If you’ve forgotten your password, reset it below.'
    );
  });

  it('allows an immediate retry when a manual resend fails', async () => {
    vi.useFakeTimers();
    await renderDialog('signup');
    setInput('#signin-email', 'new-user@example.com');
    setInput('#signin-password', 'password123');

    const submit = document.querySelector('[role="dialog"] button[type="submit"]');
    await act(async () => {
      submit.closest('form').dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true })
      );
      await Promise.resolve();
      await Promise.resolve();
    });
    for (let second = 0; second < 60; second += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_000);
      });
    }

    testState.resendSignupEmail.mockResolvedValue({
      error: new Error('Temporary email outage'),
    });
    const resend = Array.from(document.querySelectorAll('button')).find(
      (button) => button.textContent === 'Resend code'
    );
    await act(async () => {
      resend.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(document.querySelector('[role="alert"]')?.textContent).toContain(
      'Temporary email outage'
    );
    expect(resend.disabled).toBe(false);
    expect(resend.textContent).toBe('Resend code');
  });
});

async function submitForm() {
  await act(async () => { document.querySelector('form').dispatchEvent(new Event('submit', {bubbles:true,cancelable:true})); await Promise.resolve(); });
}
async function startSignup() {
  await renderDialog('signup');
  setInput('#signin-email','audit@example.com');setInput('#signin-password','password123');await submitForm();
}
async function advanceCooldown() {
  for(let i=0;i<60;i++) await act(async()=>{await vi.advanceTimersByTimeAsync(1000);});
}
async function clickText(text) {
  await act(async()=>{Array.from(document.querySelectorAll('button')).find(b=>b.textContent===text).click();await Promise.resolve();});
}
it('retains verification after returning from email and supports explicit change email',async()=> {
  await startSignup();await act(async()=>{root.render(<SignInDialog open={false} onOpenChange={vi.fn()}/>);});await renderDialog('signup');
  expect(document.querySelector('#signin-otp')).not.toBeNull();await clickText('Change email or go back');expect(document.querySelector('#signin-email')).not.toBeNull();
});
it('does not advance on an unrelated cross-tab session',async()=> {
  await startSignup();testState.user={id:'other-user'};await renderDialog('signup');expect(document.querySelector('#signin-otp')).not.toBeNull();
});
it.each(['123 456','١٢٣٤٥٦','۱۲۳۴۵۶','12-34-56'])('normalizes formatted or localized OTP %s before submitting',async(code)=> {
  await startSignup();expect(document.querySelector('#signin-otp').getAttribute('maxlength')).toBeNull();setInput('#signin-otp',code);await submitForm();
  expect(testState.verifyEmailOtp).toHaveBeenCalledWith('audit@example.com','123456','signup');
});
it('rejects excess digits instead of silently verifying a truncated code',async()=> {
  await startSignup();setInput('#signin-otp','12345678');expect(document.querySelector('button[type=submit]').disabled).toBe(true);await submitForm();expect(testState.verifyEmailOtp).not.toHaveBeenCalled();
});
it.each([
  [{message:'Failed to fetch'},'Check your connection'],
  [{status:429,message:'Too many requests'},'wait a minute'],
  [{code:'otp_expired',message:'Token expired'},'invalid or has expired']
])('explains verification failure %j',async(error,copy)=> {
  await startSignup();testState.verifyEmailOtp.mockResolvedValue({error});setInput('#signin-otp','123456');await submitForm();expect(document.querySelector('[role=alert]').textContent).toContain(copy);
});
it('prevents resend while verification is pending',async()=> {
  vi.useFakeTimers();await startSignup();await advanceCooldown();let finish;testState.verifyEmailOtp.mockImplementation(()=>new Promise(r=>{finish=r;}));
  setInput('#signin-otp','123456');await submitForm();const resend=Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Resend code');expect(resend.disabled).toBe(true);await clickText('Resend code');expect(testState.resendSignupEmail).not.toHaveBeenCalled();
  await act(async()=>{finish({error:null});await Promise.resolve();});
});
it('prevents verification during resend',async()=> {
  vi.useFakeTimers();await startSignup();await advanceCooldown();let finish;testState.resendSignupEmail.mockImplementation(()=>new Promise(r=>{finish=r;}));setInput('#signin-otp','123456');await clickText('Resend code');await submitForm();expect(testState.verifyEmailOtp).not.toHaveBeenCalled();
  await act(async()=>{finish({error:null});await Promise.resolve();});expect(document.querySelector('#signin-otp').value).toBe('');
});
it.each([true,false])('recovery completes with intended email and redirectOnFinish=%s',async(redirect)=> {
  await act(async()=>{root.render(<SignInDialog open initialMode="signin" redirectOnFinish={redirect} onOpenChange={vi.fn()}/>);});setInput('#signin-email','audit@example.com');await clickText('Forgot password?');setInput('#signin-otp','123456');await submitForm();
  setInput('#signin-newpass','newpassword123');await submitForm();expect(testState.updatePassword).toHaveBeenCalledWith('newpassword123','audit@example.com');
  if(redirect) expect(testState.replace).toHaveBeenCalledWith('/dashboard');else expect(testState.replace).not.toHaveBeenCalled();
});

it('suppresses same-tick duplicate verification before React renders busy',async()=> {
  await startSignup();let finish;testState.verifyEmailOtp.mockImplementation(()=>new Promise(r=>{finish=r;}));setInput('#signin-otp','123456');
  await act(async()=>{const form=document.querySelector('form');form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await Promise.resolve();});
  expect(testState.verifyEmailOtp).toHaveBeenCalledTimes(1);await act(async()=>{finish({error:null});await Promise.resolve();});
});
it('retains verified recovery step on close and reopen without another reset email',async()=> {
  await renderDialog('signin');setInput('#signin-email','audit@example.com');await clickText('Forgot password?');setInput('#signin-otp','123456');await submitForm();
  await act(async()=>{root.render(<SignInDialog open={false} onOpenChange={vi.fn()}/>);});await renderDialog('signin');expect(document.querySelector('#signin-newpass')).not.toBeNull();expect(testState.requestPasswordReset).toHaveBeenCalledTimes(1);
});
it('keeps resend cooldown on provider rate limit',async()=> {
  vi.useFakeTimers();await startSignup();await advanceCooldown();testState.resendSignupEmail.mockResolvedValue({error:{status:429,message:'Too many requests'}});await clickText('Resend code');
  expect(Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Resend code in 60s').disabled).toBe(true);
});

it('lets failed recovery start over without automatically sending another reset email',async()=> {
  await renderDialog('signin');setInput('#signin-email','audit@example.com');await clickText('Forgot password?');setInput('#signin-otp','123456');await submitForm();
  testState.updatePassword.mockResolvedValue({error:new Error('Recovery session has expired. Request a new code.')});setInput('#signin-newpass','newpassword123');await submitForm();
  expect(document.querySelector('[role=alert]').textContent).toContain('expired');await clickText('Request a new reset code');
  expect(document.querySelector('#signin-newpass')).toBeNull();expect(document.querySelector('#signin-password').value).toBe('');expect(document.querySelector('#signin-email').value).toBe('audit@example.com');expect(testState.requestPasswordReset).toHaveBeenCalledTimes(1);
  await clickText('Forgot password?');expect(testState.requestPasswordReset).toHaveBeenCalledTimes(2);expect(document.querySelector('#signin-otp').value).toBe('');
});

it.each([true, false])('finishes verified signup immediately with redirectOnFinish=%s', async (redirect) => {
  const onOpenChange = vi.fn();
  await act(async () => {
    root.render(<SignInDialog open initialMode="signup" redirectOnFinish={redirect} onOpenChange={onOpenChange} trigger="pricing_upgrade" />);
  });
  setInput('#signin-email', 'learner@example.com');
  setInput('#signin-password', 'password123');
  await submitForm();
  expect(onOpenChange).not.toHaveBeenCalled();
  setInput('#signin-otp', '123456');
  await submitForm();
  expect(onOpenChange).toHaveBeenCalledWith(false);
  expect(document.body.textContent).not.toContain('A quick practice plan');
  if (redirect) expect(testState.replace).toHaveBeenCalledWith('/dashboard');
  else expect(testState.replace).not.toHaveBeenCalled();
  const { track } = await import('../../lib/analytics');
  expect(track).toHaveBeenCalledWith('signup_start', expect.objectContaining({ experiment: 'signup_email_first_v1', trigger: 'pricing_upgrade' }));
  expect(track).toHaveBeenCalledWith('signup_verified', expect.objectContaining({ experiment: 'signup_email_first_v1', method: 'otp' }));
});

it('finishes auto-confirmed signup without optional onboarding or a verification detour', async () => {
  testState.signUpWithPassword.mockResolvedValue({data:{user:{identities:[{}]},session:{access_token:'test'}},error:null});
  const onOpenChange = vi.fn();
  await act(async () => { root.render(<SignInDialog open redirectOnFinish={false} onOpenChange={onOpenChange} />); });
  setInput('#signin-email', 'learner@example.com');setInput('#signin-password','password123');
  await submitForm();
  expect(onOpenChange).toHaveBeenCalledWith(false);
  expect(testState.replace).not.toHaveBeenCalled();
  expect(testState.verifyEmailOtp).not.toHaveBeenCalled();
  expect(document.querySelector('#signin-otp')).toBeNull();
});

it('does not finish or navigate when mailbox verification rejects the session', async () => {
  const onOpenChange = vi.fn();
  await act(async () => {root.render(<SignInDialog open redirectOnFinish={false} onOpenChange={onOpenChange} />);});
  setInput('#signin-email','learner@example.com');setInput('#signin-password','password123');await submitForm();
  testState.verifyEmailOtp.mockResolvedValue({error:new Error('Verification did not match this email. Please request a new code.')});
  setInput('#signin-otp','123456');await submitForm();
  expect(onOpenChange).not.toHaveBeenCalled();expect(testState.replace).not.toHaveBeenCalled();
  expect(document.querySelector('#signin-otp')).not.toBeNull();
});

describe('SignInDialog sign-up email checks', () => {
  async function submitSignup(email) {
    setInput('#signin-email', email);
    setInput('#signin-password', 'longenough1');
    await act(async () => {
      document.querySelector('[role="dialog"] button[type="submit"]').click();
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  afterEach(() => {
    delete globalThis.fetch;
  });

  it('asks about a likely domain typo once, then lets the learner fix or keep it', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    await renderDialog('signup');
    await submitSignup('learner@gamil.com');
    expect(testState.signUpWithPassword).not.toHaveBeenCalled();
    const fix = [...document.querySelectorAll('#signin-email-fix button')][0];
    expect(fix.textContent).toBe('learner@gmail.com');

    act(() => fix.click());
    expect(document.querySelector('#signin-email').value).toBe('learner@gmail.com');
    await act(async () => {
      document.querySelector('[role="dialog"] button[type="submit"]').click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(testState.signUpWithPassword).toHaveBeenCalledWith('learner@gmail.com', 'longenough1');
  });

  it('blocks throwaway inboxes before calling the auth service', async () => {
    globalThis.fetch = vi.fn();
    await renderDialog('signup');
    await submitSignup('x@mailinator.com');
    expect(testState.signUpWithPassword).not.toHaveBeenCalled();
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('temporary inboxes expire');
  });

  it('sends a Gmail look-alike of an existing account to sign in', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: false, reason: 'alias', hint: 'ja•••@gmail.com' }),
    });
    await renderDialog('signup');
    await submitSignup('janesmith+2@gmail.com');
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(testState.signUpWithPassword).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('This inbox already has an account (ja•••@gmail.com)');
    expect(document.body.textContent).toContain('Welcome back');
  });

  it('still signs up when the pre-check is unreachable', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('offline'));
    await renderDialog('signup');
    await submitSignup('fresh@school.edu');
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(testState.signUpWithPassword).toHaveBeenCalledWith('fresh@school.edu', 'longenough1');
    expect(document.body.textContent).toContain('check your Spam, Junk or Promotions folder');
  });
});
