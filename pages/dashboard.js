import * as React from 'react';
import Head from 'next/head';
import NextLink from 'next/link';
import { ArrowRight, CalendarDays, Files, LayoutDashboard, Settings, Sparkles, Target, Trophy } from 'lucide-react';
import Navbar from '../src/components/Navbar';
import Footer from '../src/components/Footer';
import { useAuth } from '../src/lib/auth';
import { getSupabase } from '../lib/supabase';
import StatsOverview from '../src/components/dashboard/StatsOverview';
import BandTrend from '../src/components/dashboard/BandTrend';
import RecentActivity from '../src/components/dashboard/RecentActivity';
import SubmissionHistory from '../src/components/dashboard/SubmissionHistory';
import AccountSettings from '../src/components/dashboard/AccountSettings';
import { LoadingState, SignedOutState, ErrorState } from '../src/components/dashboard/States';
import { buildDashboardData, formatBand, getInitials, SKILL_META } from '../src/components/dashboard/utils';
import LearningInsights from '../src/components/dashboard/LearningInsights';
import InviteCard from '../src/components/dashboard/InviteCard';
import { isPremiumActive } from '../src/lib/usePlan';
import BaselineCard from '../src/components/estimator/BaselineCard';

const ATTEMPTS_SELECT =
  'id, skill, raw_score, total, per_question, band, started_at, submitted_at, created_at, passages ( title, slug, skill ), mock_tests ( title, slug )';
const SCORES_SELECT =
  'id, skill, overall_band, criteria, created_at, attempts ( passage_id, started_at, submitted_at, passages ( title, slug, skill ) )';
const PROFILE_SELECT =
  'display_name, target_band, exam_date, prefs, plan, plan_status, plan_renews_at, plan_expires_at, billing_pause_until, created_at';

const DEFAULT_PROFILE = {
  display_name: null,
  target_band: null,
  exam_date: null,
  prefs: {},
  plan: 'free',
  plan_status: 'inactive',
  plan_renews_at: null,
  plan_expires_at: null,
  billing_pause_until: null,
  created_at: null,
};

function useDashboardData(user) {
  const [state, setState] = React.useState({ status: 'idle', data: null, error: null });
  const userId = user?.id;

  React.useEffect(() => {
    if (!userId) return undefined;
    let active = true;
    setState({ status: 'loading', data: null, error: null });

    (async () => {
      try {
        const supabase = getSupabase();
        // Bounded: an unbounded fetch grows linearly with lifetime activity
        // (per_question JSONB is the heavy column). 200 recent rows per table
        // is far more than any panel renders or the trends window uses.
        const [attemptsRes, scoresRes, profileRes] = await Promise.all([
          supabase
            .from('attempts')
            .select(ATTEMPTS_SELECT)
            .in('skill', ['reading', 'listening'])
            .order('created_at', { ascending: false })
            .limit(200),
          supabase
            .from('scores')
            .select(SCORES_SELECT)
            .in('skill', ['writing', 'speaking'])
            .order('created_at', { ascending: false })
            .limit(200),
          supabase.from('users').select(PROFILE_SELECT).eq('id', userId).maybeSingle(),
        ]);

        if (attemptsRes.error) throw attemptsRes.error;
        if (scoresRes.error) throw scoresRes.error;
        if (profileRes.error) throw profileRes.error;
        if (!active) return;

        setState({
          status: 'ready',
          data: {
            ...buildDashboardData(attemptsRes.data || [], scoresRes.data || []),
            profile: { ...DEFAULT_PROFILE, ...(profileRes.data || {}) },
          },
          error: null,
        });
      } catch (error) {
        if (active) setState({ status: 'error', data: null, error: error?.message || 'Unknown error' });
      }
    })();

    return () => {
      active = false;
    };
  }, [userId]);

  return state;
}

function ReadinessRing({ value, target }) {
  const baseline = target || 9;
  const progress = value === null ? 0 : Math.min(100, Math.round((value / baseline) * 100));
  const radius = 45;
  const circumference = Math.PI * 2 * radius;
  const dash = (progress / 100) * circumference;
  return (
    <div className="relative h-32 w-32 shrink-0" aria-label={`${progress}% of band target`}>
      <svg viewBox="0 0 112 112" className="h-full w-full -rotate-90">
        <circle cx="56" cy="56" r={radius} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="9" />
        <circle cx="56" cy="56" r={radius} fill="none" stroke="#34d399" strokeWidth="9" strokeLinecap="round" strokeDasharray={`${dash} ${circumference - dash}`} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-3xl font-black text-white">{formatBand(value)}</span>
        <span className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">{target ? `of ${formatBand(target)}` : 'Overall'}</span>
      </div>
    </div>
  );
}

function daysUntil(dateValue) {
  if (!dateValue) return null;
  const date = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return Math.max(0, Math.ceil((date - new Date()) / 86400000));
}

function DashboardHero({ user, profile, data }) {
  const targetBand = profile.target_band == null ? null : Number(profile.target_band);
  const recommended = SKILL_META[data.recommendedSkill];
  const examDays = daysUntil(profile.exam_date || profile.prefs?.examDate);
  const targetGap = targetBand !== null && data.overallBand !== null ? targetBand - data.overallBand : null;

  return (
    <section className="relative overflow-hidden rounded-[2rem] bg-slate-950 px-5 py-7 text-white shadow-[0_30px_80px_-40px_rgba(2,6,23,0.95)] sm:px-8 sm:py-8 lg:px-10">
      <div className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full bg-emerald-500/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 left-1/3 h-52 w-52 rounded-full bg-cyan-400/10 blur-3xl" />
      <div className="relative grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div>
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 text-sm font-black ring-1 ring-white/15">{getInitials(profile.display_name, user.email)}</span>
            <div><p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-300">My learning dashboard</p><p className="mt-0.5 text-xs text-slate-400">{profile.display_name ? `Welcome back, ${profile.display_name}` : user.email}</p></div>
          </div>
          <h1 className="mt-6 max-w-2xl text-3xl font-black leading-tight tracking-tight sm:text-4xl">
            {data.totalPractised ? 'Every practice session is moving your band forward.' : 'Your next IELTS band starts with one focused session.'}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
            {targetGap !== null && targetGap > 0
              ? `You are approximately ${targetGap.toFixed(1)} band points from your ${formatBand(targetBand)} target. Focus on ${recommended.label} next.`
              : data.overallBand !== null
                ? `You are building a balanced score profile. Keep ${recommended.label} in this week's practice mix.`
                : 'Set your first Reading, Listening, or Writing baseline and this dashboard will shape a personal practice plan.'}
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <NextLink href={recommended.href} className="group inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 text-sm font-bold text-white no-underline shadow-lg shadow-emerald-950/30 transition hover:bg-emerald-400">
              Practice {recommended.label} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </NextLink>
            <NextLink href="/mock-test" className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-5 text-sm font-bold text-white no-underline transition hover:bg-white/10">
              <Sparkles className="h-4 w-4 text-emerald-300" /> Take a full mock
            </NextLink>
          </div>
        </div>
        <div className="flex items-center gap-5 rounded-3xl border border-white/10 bg-white/[0.055] p-4 backdrop-blur-sm sm:p-5">
          <ReadinessRing value={data.overallBand} target={targetBand} />
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Target readiness</p>
            <p className="mt-2 text-lg font-black">{targetBand ? `Band ${formatBand(targetBand)}` : 'Set your goal'}</p>
            <div className="mt-3 space-y-2 text-xs text-slate-300">
              <p className="flex items-center gap-2"><Trophy className="h-3.5 w-3.5 text-amber-300" /> {data.strongestSkill ? `${SKILL_META[data.strongestSkill].label} leads` : 'Baseline pending'}</p>
              <p className="flex items-center gap-2"><CalendarDays className="h-3.5 w-3.5 text-emerald-300" /> {examDays === null ? 'No exam date set' : examDays === 0 ? 'Exam day' : `${examDays} days to exam`}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

const TABS = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'submissions', label: 'Submissions', icon: Files },
  { id: 'settings', label: 'Settings', icon: Settings },
];

function DashboardNav({ active, onChange }) {
  return (
    <nav className="sticky top-[4.5rem] z-20 flex gap-1 overflow-x-auto rounded-2xl border border-slate-200/80 bg-white/90 p-1.5 shadow-[0_12px_40px_-28px_rgba(15,23,42,0.65)] backdrop-blur-xl" aria-label="Dashboard sections">
      {TABS.map(({ id, label, icon: Icon }) => (
        <button key={id} type="button" onClick={() => onChange(id)} aria-current={active === id ? 'page' : undefined} className={`inline-flex h-10 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-2 text-xs font-bold transition sm:flex-none sm:gap-2 sm:px-4 sm:text-sm ${active === id ? 'bg-slate-950 text-white shadow-md' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'}`}>
          <Icon className={`h-4 w-4 ${active === id ? 'text-emerald-300' : ''}`} /> {label}
        </button>
      ))}
    </nav>
  );
}

function EmptyNudge() {
  return (
    <div className="rounded-3xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-cyan-50 p-5 sm:flex sm:items-center sm:justify-between sm:gap-5 sm:p-6">
      <div className="flex gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-emerald-700 shadow-sm"><Target className="h-5 w-5" /></span><div><h2 className="text-base font-black text-slate-900">Build your first baseline</h2><p className="mt-1 text-sm leading-6 text-slate-600">Start with Reading, Listening, or your free Writing score. Premium adds a Speaking baseline and full four-skill comparisons.</p></div></div>
      <NextLink href="/readingquestion" className="mt-4 inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white no-underline sm:mt-0">Start now <ArrowRight className="h-4 w-4" /></NextLink>
    </div>
  );
}

function FreeUpgradeCard({ examDate }) {
  const examDays = daysUntil(examDate);
  return (
    <section className="rounded-3xl bg-slate-950 p-5 text-white shadow-[0_24px_65px_-35px_rgba(2,6,23,0.85)] sm:flex sm:items-center sm:justify-between sm:gap-6 sm:p-7">
      <div>
        <div className="flex items-center gap-2 text-emerald-300">
          <Sparkles className="h-4 w-4" />
          <span className="text-xs font-bold uppercase tracking-[0.18em]">Turn practice into a plan</span>
        </div>
        <h2 className="mt-3 text-xl font-black">Unlock full AI feedback and your Writing and Speaking trends</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
          {examDays == null
            ? 'See all four scoring criteria, corrected examples, live examiner minutes, and full timed mocks.'
            : `Your test is ${examDays === 0 ? 'today' : `in ${examDays} days`}. Use full feedback to focus the time you have left.`}
        </p>
      </div>
      <NextLink href="/pricing" className="mt-5 inline-flex shrink-0 items-center gap-2 rounded-xl bg-emerald-500 px-5 py-3 text-sm font-bold text-white no-underline hover:bg-emerald-400 sm:mt-0">
        See Premium options <ArrowRight className="h-4 w-4" />
      </NextLink>
    </section>
  );
}

function DashboardBody({ user, signOut }) {
  const { status, data, error } = useDashboardData(user);
  const [activeTab, setActiveTab] = React.useState('overview');
  const [profileOverride, setProfileOverride] = React.useState(null);

  if (status === 'loading' || status === 'idle') return <LoadingState />;
  if (status === 'error') return <ErrorState message={error} />;

  const profile = { ...data.profile, ...(profileOverride || {}) };
  const targetBand = profile.target_band == null ? null : Number(profile.target_band);
  const weeklyGoal = Number(profile.prefs?.dashboardWeeklyGoal) || 3;
  const isPremium = isPremiumActive(
    profile.plan,
    profile.plan_status,
    profile.plan_renews_at,
    profile.plan_expires_at,
    profile.billing_pause_until
  );
  const changeTab = (tab) => {
    setActiveTab(tab);
    window.requestAnimationFrame(() => document.getElementById('dashboard-content')?.focus({ preventScroll: true }));
  };

  return (
    <div className="space-y-5">
      <DashboardHero user={user} profile={profile} data={data} />
      <DashboardNav active={activeTab} onChange={changeTab} />
      <div id="dashboard-content" tabIndex={-1} className="space-y-5 outline-none">
        {activeTab === 'overview' && (
          <>
            {!data.hasData && <EmptyNudge />}
            {!isPremium && <FreeUpgradeCard examDate={profile.exam_date || profile.prefs?.examDate} />}
            <BaselineCard />
            <StatsOverview data={data} weeklyGoal={weeklyGoal} />
            <BandTrend skills={data.skills} targetBand={targetBand} isPremium={isPremium} />
            <LearningInsights data={data} targetBand={targetBand} />
            <InviteCard />
            <RecentActivity items={data.items} onViewAll={() => changeTab('submissions')} />
          </>
        )}
        {activeTab === 'submissions' && <SubmissionHistory items={data.items} />}
        {activeTab === 'settings' && (
          <AccountSettings
            user={user}
            profile={profile}
            onProfileChange={(changes) => setProfileOverride((current) => ({ ...(current || {}), ...changes }))}
            onSignOut={signOut}
          />
        )}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { user, loading, signOut } = useAuth();

  return (
    <>
      <Head>
        <title>Your IELTS Progress Dashboard | IELTS-Bank</title>
        <meta name="robots" content="noindex" />
      </Head>
      <div className="flex min-h-screen flex-col bg-slate-50 text-slate-950">
        <Navbar />
        <main className="relative mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
          <div className="pointer-events-none absolute inset-x-0 top-0 -z-0 h-72 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.08),transparent_45%)]" />
          <div className="relative z-10">
            {loading ? <LoadingState /> : !user ? <SignedOutState /> : <DashboardBody user={user} signOut={signOut} />}
          </div>
        </main>
        <Footer />
      </div>
    </>
  );
}
