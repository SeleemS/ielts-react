import { describe, expect, it, vi } from 'vitest';
import { saveSignupEmailConsent } from './emailConsent';

function client({ prefs = {}, rowAfter = 0 } = {}) {
  let reads = 0;
  const update = vi.fn(() => ({
    eq: () => ({ select: () => ({ maybeSingle: async () => ({ data: { id: 'u1' }, error: null }) }) }),
  }));
  return {
    update,
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            reads += 1;
            return { data: reads > rowAfter ? { prefs } : null };
          },
        }),
      }),
      update,
    }),
  };
}

describe('saveSignupEmailConsent', () => {
  it('stores both answers with an audit block', async () => {
    const supabase = client({ prefs: { goal: 'study' } });
    await expect(saveSignupEmailConsent(supabase, { studyPlan: true, marketing: false })).resolves.toBe(true);
    const { prefs } = supabase.update.mock.calls[0][0];
    expect(prefs).toMatchObject({ goal: 'study', study_plan_emails: true, marketing_emails: false });
    expect(prefs.email_consent).toMatchObject({ source: 'signup' });
  });

  it('never overwrites an earlier answer', async () => {
    const supabase = client({ prefs: { email_consent: { source: 'dashboard' }, marketing_emails: true } });
    await expect(saveSignupEmailConsent(supabase, { studyPlan: false, marketing: false })).resolves.toBe(false);
    expect(supabase.update).not.toHaveBeenCalled();
  });

  it('waits for the users row to appear', async () => {
    vi.useFakeTimers();
    const supabase = client({ rowAfter: 1 });
    const pending = saveSignupEmailConsent(supabase, { studyPlan: true, marketing: true });
    await vi.advanceTimersByTimeAsync(1600);
    await expect(pending).resolves.toBe(true);
    vi.useRealTimers();
  });

  it('returns false instead of throwing when signed out', async () => {
    const supabase = { auth: { getUser: async () => ({ data: { user: null } }) } };
    await expect(saveSignupEmailConsent(supabase, { studyPlan: true, marketing: true })).resolves.toBe(false);
  });
});
