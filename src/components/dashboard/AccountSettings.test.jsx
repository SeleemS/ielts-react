// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

const testState = vi.hoisted(() => ({
  profileSave: vi.fn(),
  profilePatch: vi.fn(),
  passwordSave: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }) =>
    React.createElement('a', { href, ...rest }, children),
}));
vi.mock('../../../lib/supabase', () => ({
  getSupabase: () => ({
    auth: {
      updateUser: testState.passwordSave,
    },
    from: () => ({
      update: (fields) => {
        testState.profilePatch(fields);
        return ({
        eq: () => ({
          select: () => ({
            maybeSingle: testState.profileSave,
          }),
        }),
        });
      },
    }),
  }),
}));
vi.mock('../../lib/usePlan', () => ({
  isPremiumActive: () => false,
}));

import AccountSettings from './AccountSettings';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container;
let root;

const baseProfile = {
  display_name: 'Audit Learner',
  target_band: 7,
  exam_date: null,
  prefs: {},
  plan: 'free',
  plan_status: 'inactive',
  plan_renews_at: null,
  plan_expires_at: null,
  billing_pause_until: null,
};

function renderSettings(profile = {}, onProfileChange = vi.fn()) {
  act(() => {
    root.render(
      <AccountSettings
        user={{ id: 'user-1', email: 'audit@example.com' }}
        profile={{ ...baseProfile, ...profile }}
        onProfileChange={onProfileChange}
        onSignOut={testState.signOut}
      />
    );
  });
}

function setInput(id, value) {
  const input = container.querySelector(id);
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value'
  ).set;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function submit(form) {
  await act(async () => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  renderSettings();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

describe('AccountSettings network failures', () => {
  it('recovers the profile form when the request rejects', async () => {
    testState.profileSave.mockRejectedValue(new Error('offline'));
    setInput('#dashboard-name', 'Updated Learner');

    await submit(container.querySelectorAll('form')[0]);

    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'Could not save your profile. Please try again.'
    );
    expect(
      [...container.querySelectorAll('button')].find(
        (button) => button.textContent.includes('Save preferences')
      ).disabled
    ).toBe(false);
  });

  it('recovers the password form when the authentication request rejects', async () => {
    testState.passwordSave.mockRejectedValue(new Error('offline'));
    setInput('#dashboard-password', 'strong-password');
    setInput('#dashboard-password-confirm', 'strong-password');

    await submit(container.querySelectorAll('form')[1]);

    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'Could not update your password. Please try again.'
    );
    expect(
      [...container.querySelectorAll('button')].find(
        (button) => button.textContent.includes('Update password')
      ).disabled
    ).toBe(false);
  });

  it('shows a recoverable error when sign out cannot reach the authentication service', async () => {
    testState.signOut.mockResolvedValue({
      error: new Error('Could not reach the authentication service.'),
    });
    const button = [...container.querySelectorAll('button')].find(
      (item) => item.textContent.trim() === 'Sign out'
    );

    await act(async () => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'Could not reach the authentication service.'
    );
    expect(button.disabled).toBe(false);
  });
});

describe('AccountSettings exam dates', () => {
  it('saves and clears a selected date through input events, preserving preferences after rerender', async () => {
    const prefs = {
      dashboardWeeklyGoal: 5,
      marketing_emails: false,
      study_plan_emails: true,
      customPreference: { enabled: true },
      examDate: '2099-10-15',
    };
    const onProfileChange = vi.fn();
    renderSettings({ exam_date: '2099-10-15', prefs }, onProfileChange);
    testState.profileSave.mockImplementation(async () => ({
      data: testState.profilePatch.mock.calls.at(-1)[0],
      error: null,
    }));

    setInput('#dashboard-exam-date', '2099-10-16');
    await submit(container.querySelectorAll('form')[0]);

    const saved = {
      display_name: baseProfile.display_name,
      target_band: 7,
      exam_date: '2099-10-16',
      prefs: { ...prefs, examDate: '2099-10-16' },
    };
    expect(testState.profilePatch).toHaveBeenLastCalledWith(saved);
    expect(onProfileChange).toHaveBeenLastCalledWith(saved);
    renderSettings(saved, onProfileChange);
    expect(container.querySelector('#dashboard-exam-date').value).toBe('2099-10-16');
    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      'Your learning preferences are saved.'
    );

    setInput('#dashboard-exam-date', '');
    await submit(container.querySelectorAll('form')[0]);

    const cleared = { ...saved, exam_date: null, prefs: { ...prefs, examDate: null } };
    expect(testState.profilePatch).toHaveBeenLastCalledWith(cleared);
    expect(onProfileChange).toHaveBeenLastCalledWith(cleared);
    expect(onProfileChange).toHaveBeenCalledTimes(2);
    renderSettings(cleared, onProfileChange);
    expect(container.querySelector('#dashboard-exam-date').value).toBe('');
  });

  it('lets a learner with a historical saved date update unrelated preferences', async () => {
    renderSettings({ exam_date: '2020-01-15' });
    testState.profileSave.mockResolvedValue({
      data: { ...baseProfile, display_name: 'Updated Learner', exam_date: '2020-01-15' },
      error: null,
    });

    const date = container.querySelector('#dashboard-exam-date');
    expect(date.value).toBe('2020-01-15');
    expect(date.getAttribute('min')).toBeNull();
    setInput('#dashboard-name', 'Updated Learner');
    await submit(container.querySelectorAll('form')[0]);

    expect(testState.profileSave).toHaveBeenCalledOnce();
    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      'Your learning preferences are saved.'
    );
  });

  it('rejects a newly selected past exam date with visible feedback', async () => {
    setInput('#dashboard-exam-date', '2020-01-15');
    await submit(container.querySelectorAll('form')[0]);

    expect(testState.profileSave).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'Choose today or a future exam date.'
    );
  });
});
