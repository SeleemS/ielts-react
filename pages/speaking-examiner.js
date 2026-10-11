// pages/speaking-examiner.js
// Live AI speaking examiner (Premium): a real-time voice interview over
// WebRTC with the OpenAI Realtime model, followed by a rubric-anchored
// assessment. The gated audio pilot assesses all four criteria; legacy sessions
// keep the transcript-only score. docs/MONETIZATION.md §9.
import React from 'react';
import { createRealtimeAudioRecorder, uploadRealtimeAudio } from '../src/lib/realtimeAudioRecorder';
import { connectLiveExaminer } from '../src/lib/liveExaminerTransport';
import { createLiveTranscriptAssembler } from '../src/lib/liveTranscript';
function audioAssessmentEnabled() { return process.env.NEXT_PUBLIC_REALTIME_AUDIO_ASSESSMENT === 'true'; }
// Read at call time, not module load: tests flip the flag per case.
function liveExaminerEnabled() { return process.env.NEXT_PUBLIC_LIVE_EXAMINER === 'true'; }
import Head from 'next/head';
import NextLink from 'next/link';
import {
  Mic,
  PhoneOff,
  Sparkles,
  Clock,
  CheckCircle2,
  Headphones,
  MessageSquare,
  Gauge,
  Radio,
  Timer,
  ArrowLeft,
  ArrowRight,
  Ear,
  ListChecks,
} from 'lucide-react';
import Navbar from '../src/components/Navbar';
import Footer from '../src/components/Footer';
import { Card, CardContent } from '../components/ui/card';
import SignInDialog from '../src/components/auth/SignInDialog';
import { useAuth } from '../src/lib/auth';
import { usePlan } from '../src/lib/usePlan';
import { useRealtimeMinutes } from '../src/lib/useRealtimeMinutes';
import { getSupabase } from '../lib/supabase';
import { track } from '../src/lib/analytics';
import {
  claimPendingSpeakingScore,
  releasePendingSpeakingScore,
  resolveSpeakingAuthAction,
} from '../src/lib/pendingSpeakingSession';
import {
  clearPendingRealtimeScore,
  createRealtimeScoreRequestId,
  loadPendingRealtimeScore,
  savePendingRealtimeScore,
  submitPendingRealtimeScore,
} from '../src/lib/realtimeScoreRecovery';
import {
  ScoringProgress,
  CriterionFeedback,
  BandHero,
  BandMeter,
} from '../src/components/question/ScoreUI';

import { SPEAKING_EXAMINER_SEO } from '../lib/speakingExaminerSeo';
const PAGE_TITLE = SPEAKING_EXAMINER_SEO.title;
const PAGE_DESCRIPTION = SPEAKING_EXAMINER_SEO.description;

const MODE_CARDS = [
  {
    mode: 'mock',
    title: 'Full mock interview',
    minutes: 14,
    blurb: 'Parts 1-3, exactly like the real test.',
    tag: 'Closest to the real thing',
    highlights: ['Parts 1, 2 and 3 back to back', 'Adaptive follow-up questions', 'Band across every criterion'],
  },
  {
    mode: 'part1',
    title: 'Part 1 drill',
    minutes: 5,
    blurb: 'Interview questions about familiar topics.',
    tag: 'Warm-up',
    highlights: ['Familiar topics: home, work, study', 'Short, natural answers', 'Great for building fluency'],
  },
  {
    mode: 'part2',
    title: 'Part 2 drill',
    minutes: 5,
    blurb: 'Cue card, one minute prep, long turn.',
    tag: 'Long turn',
    highlights: ['A timed cue card', 'One minute to prepare', 'Up to two minutes of speaking'],
  },
  {
    mode: 'part3',
    title: 'Part 3 drill',
    minutes: 5,
    blurb: 'Abstract discussion questions.',
    tag: 'Discussion',
    highlights: ['Abstract, opinion-led questions', 'Follow-ups that push you', 'Where Band 7+ is won'],
  },
];

const MODE_BY_ID = Object.fromEntries(MODE_CARDS.map((card) => [card.mode, card]));

// Idle hero: what the Live examiner actually gives you.
const BENEFIT_TILES = [
  {
    icon: MessageSquare,
    title: 'The real 3-part format',
    body: 'Part 1 interview, a timed Part 2 cue card and a Part 3 discussion — with follow-up questions that adapt to what you just said.',
  },
  {
    icon: Radio,
    title: 'Full-duplex turn-taking',
    body: 'gpt-live-1 listens while it speaks, so you can pause to think, interject, or ask for a question to be repeated without talking over a robot.',
  },
  {
    icon: Timer,
    title: 'A properly timed cue card',
    body: 'One minute to prepare, then your long turn — say “I’m ready” whenever you want to start early, exactly like the test-day script.',
  },
  {
    icon: Gauge,
    title: 'Band estimate and feedback',
    body: 'When the interview closes you get a practice band with criterion-by-criterion feedback and what to practise next.',
  },
];

const SESSION_TIMELINE = [
  'Examiner greets you',
  'Say your name for an audio check',
  'Part 1 questions',
  'Part 2 cue card — 1 min prep',
  'Part 3 discussion',
  'Automatic end and your band',
];

// Mandatory pre-session briefing: what happens next, per mode.
const BRIEFING_STEPS = {
  mock: [
    'The examiner greets you and asks your name — answer out loud so we can check your microphone.',
    'Part 1: four or five questions about familiar topics like your home, work or studies.',
    'Part 2: you get a cue card, one minute to prepare, then you speak for one to two minutes.',
    'Part 3: a deeper discussion of the Part 2 topic with abstract, opinion-led questions.',
    'The examiner closes the test, the session ends by itself and your band estimate is marked.',
  ],
  part1: [
    'The examiner greets you and asks your name — answer out loud so we can check your microphone.',
    'Part 1 only: four or five interview questions about familiar everyday topics.',
    'The examiner closes the drill, the session ends by itself and your band estimate is marked.',
  ],
  part2: [
    'The examiner greets you and asks your name — answer out loud so we can check your microphone.',
    'Part 2 only: you get a cue card and one minute to prepare — say “I’m ready” to start early.',
    'You speak for one to two minutes, then answer a short rounding-off question.',
    'The examiner closes the drill, the session ends by itself and your band estimate is marked.',
  ],
  part3: [
    'The examiner greets you and asks your name — answer out loud so we can check your microphone.',
    'Part 3 only: abstract discussion questions with follow-ups that push your ideas further.',
    'The examiner closes the drill, the session ends by itself and your band estimate is marked.',
  ],
};

const BRIEFING_CHECKLIST = [
  'Find a quiet room — background voices confuse the audio.',
  'Headphones are recommended so the examiner’s voice stays out of your microphone.',
  'Your browser will ask for microphone permission in a moment — allow it.',
  'Speak in full sentences; developed answers score higher than one-liners.',
  'The examiner waits while you think — a short pause costs you nothing.',
  'In Part 2, say “I’m ready” whenever you want to start your long turn early.',
];

function fmtTime(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Minimum candidate words before an interview can be ended for a score (the
// scoring API enforces the same threshold server-side).
const MIN_SCORABLE_WORDS = 40;
// How long the candidate can be silent before a quiet examiner is presented as
// "thinking" rather than as dead air.
const THINKING_GRACE_MS = 900;

function getBrowserSessionStorage() {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

// Connection animation: concentric pulse rings around a mic orb with staged
// status text — replaces the bare spinner.
const CONNECT_STEPS = [
  'Requesting your microphone…',
  'Reserving your examiner…',
  'Establishing a secure audio line…',
  'Almost there — say hello when the examiner greets you…',
];
const LIVE_CONNECT_STEPS = [
  'Requesting your microphone…',
  'Waking up your gpt-live-1 examiner…',
  'Opening a full-duplex audio line…',
  'Say hello when the examiner greets you…',
];
function ConnectingExaminer({ steps = CONNECT_STEPS }) {
  const [step, setStep] = React.useState(0);
  React.useEffect(() => {
    const t = setInterval(() => setStep((s) => Math.min(s + 1, steps.length - 1)), 1800);
    return () => clearInterval(t);
  }, [steps]);
  return (
    <div className="mt-12 flex flex-col items-center gap-6">
      <div className="relative flex h-32 w-32 items-center justify-center">
        <span className="absolute inset-0 animate-ping rounded-full bg-accent/20 [animation-duration:2s]" />
        <span className="absolute inset-4 animate-ping rounded-full bg-accent/25 [animation-duration:2s] [animation-delay:300ms]" />
        <span className="absolute inset-8 animate-pulse rounded-full bg-accent/30" />
        <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-lg">
          <Mic className="h-7 w-7" />
        </span>
      </div>
      <p key={step} className="text-sm font-medium text-muted-foreground animate-in fade-in duration-500">
        {steps[step]}
      </p>
    </div>
  );
}

const SPEAKING_STAGES = [
  { icon: MessageSquare, label: 'Reviewing your transcript' },
  { icon: Headphones, label: 'Assessing fluency & coherence' },
  { icon: Sparkles, label: 'Weighing your vocabulary' },
  { icon: CheckCircle2, label: 'Checking grammatical range' },
  { icon: Gauge, label: 'Benchmarking against band descriptors' },
  { icon: Clock, label: 'Preparing your feedback' },
];
const SPEAKING_TIPS = [
  'Examiners reward answers that are developed — a reason and an example beat a one-liner.',
  'Pausing to think is fine; filling every silence with “you know” costs more.',
  'Paraphrasing the question in your answer shows lexical range.',
  'Occasional self-correction is natural; frequent repairs can interrupt fluency.',
  'In Part 2, using the full two minutes almost always helps your fluency band.',
];

const EXAMINER_STATUS = {
  speaking: { label: 'Examiner is speaking…', className: 'border-primary/30 bg-primary/10 text-primary' },
  thinking: { label: 'Examiner is thinking', className: 'border-amber-500/30 bg-amber-500/10 text-amber-700' },
  listening: { label: 'Listening — take your time', className: 'border-accent/30 bg-accent/10 text-accent' },
};

// The candidate must never be left staring at dead air: every pause is labelled.
function ExaminerStatusPill({ state }) {
  const status = EXAMINER_STATUS[state] || EXAMINER_STATUS.listening;
  return (
    <span
      role="status"
      aria-live="polite"
      data-examiner-state={state}
      data-analytics-id="examiner_status"
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${status.className}`}
    >
      {state === 'thinking' ? (
        <span aria-hidden="true" className="flex items-center gap-0.5">
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:0ms]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:150ms]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:300ms]" />
        </span>
      ) : state === 'speaking' ? (
        <Radio aria-hidden="true" className="h-3.5 w-3.5 animate-pulse" />
      ) : (
        <Ear aria-hidden="true" className="h-3.5 w-3.5" />
      )}
      {status.label}
      {state === 'thinking' ? '…' : ''}
    </span>
  );
}

export default function SpeakingExaminerPage() {
  const { user, loading: authLoading } = useAuth();
  const { isPremium, loading: planLoading } = usePlan();
  const minutes = useRealtimeMinutes();

  // phase: idle | briefing | connecting | live | scoring | score_error | done
  const [phase, setPhase] = React.useState('idle');
  // The mode chosen on the idle screen; it drives the briefing and the live panel.
  const [activeMode, setActiveMode] = React.useState(null);
  const [error, setError] = React.useState('');
  const [signInOpen, setSignInOpen] = React.useState(false);
  const [captions, setCaptions] = React.useState([]); // [{role, text}]
  const [secondsLeft, setSecondsLeft] = React.useState(0);
  const [result, setResult] = React.useState(null);
  const [pendingScore, setPendingScore] = React.useState(null);

  const recorderRef = React.useRef(null);
  const assessmentRef = React.useRef(null);
  const pcRef = React.useRef(null);
  const micRef = React.useRef(null);
  const transcriptRef = React.useRef([]);
  const timerRef = React.useRef(null);
  const audioRef = React.useRef(null);
  const endedRef = React.useRef(false);
  const captionsBoxRef = React.useRef(null);
  // Greeting kick-off must fire exactly once per session — a re-opened data
  // channel or duplicate open event must never trigger a second greeting.
  const greetedRef = React.useRef(false);
  // Waveform visualizer: one shared AudioContext with an analyser per party.
  const audioCtxRef = React.useRef(null);
  const analyserExamRef = React.useRef(null);
  const analyserMicRef = React.useRef(null);
  const rafRef = React.useRef(0);
  const canvasRef = React.useRef(null);
  const speakingStateRef = React.useRef(null);
  const [speaking, setSpeaking] = React.useState(null); // 'examiner' | 'candidate' | null
  // Examiner presence: 'listening' | 'thinking' | 'speaking'. A silent examiner
  // must always be explained, never rendered as dead air.
  const [examinerState, setExaminerState] = React.useState('listening');
  const examinerStateRef = React.useRef('listening');
  const thinkingRef = React.useRef(false);
  const silenceTimerRef = React.useRef(null);
  // Live candidate word count — gates the End button.
  const [candidateWords, setCandidateWords] = React.useState(0);
  // Auto-end when the examiner closes the test.
  const autoEndRef = React.useRef(null);
  const sessionOwnerRef = React.useRef(null);
  const sessionModeRef = React.useRef(null);
  const currentUserIdRef = React.useRef(user?.id || null);
  currentUserIdRef.current = user?.id || null;
  const scoreAttemptRef = React.useRef(false);
  const connectionGenerationRef = React.useRef(0);
  const micFailsafeRef = React.useRef(null);
  // Live (gpt-live-1) transport state — unused on the Realtime path.
  const liveTransportRef = React.useRef(null);
  const liveAssemblerRef = React.useRef(null);
  const liveSessionIdRef = React.useRef(null);
  const liveUnmuteRequestedRef = React.useRef(false);
  const sessionTransportRef = React.useRef('realtime');

  React.useEffect(() => {
    const saved = loadPendingRealtimeScore(getBrowserSessionStorage());
    if (!saved) return;
    setPendingScore({ ...saved, stored: true });
    setPhase('score_error');
  }, []);

  React.useEffect(() => {
    if (captionsBoxRef.current) {
      captionsBoxRef.current.scrollTop = captionsBoxRef.current.scrollHeight;
    }
  }, [captions]);

  React.useEffect(() => {
    if (phase === 'idle' && !planLoading && !isPremium) {
      track('premium_gate', {
        source: 'speaking_examiner',
        stage: 'impression',
        signed_in: Boolean(user?.id),
      });
    }
  }, [isPremium, phase, planLoading, user?.id]);

  React.useEffect(() => () => teardown(), []); // unmount cleanup

  // ---- examiner presence ---------------------------------------------------
  function applyExaminerState(next) {
    if (examinerStateRef.current === next) return;
    examinerStateRef.current = next;
    setExaminerState(next);
  }

  function clearSilenceTimer() {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    silenceTimerRef.current = null;
  }

  function resetExaminerState() {
    clearSilenceTimer();
    thinkingRef.current = false;
    examinerStateRef.current = 'listening';
    setExaminerState('listening');
  }

  // The transport tells us when the model hands off to its backend.
  function markExaminerThinking(isThinking) {
    thinkingRef.current = Boolean(isThinking);
    clearSilenceTimer();
    if (isThinking) {
      applyExaminerState('thinking');
      return;
    }
    applyExaminerState(speakingStateRef.current === 'examiner' ? 'speaking' : 'listening');
  }

  // The examiner's audio (or its first transcript fragment) has started.
  function markExaminerSpeaking() {
    thinkingRef.current = false;
    clearSilenceTimer();
    applyExaminerState('speaking');
  }

  // Driven by the waveform analyser: who currently holds the floor.
  function handleSpeakerChange(active, previous) {
    if (active === 'examiner') {
      markExaminerSpeaking();
      return;
    }
    if (active === 'candidate') {
      thinkingRef.current = false;
      clearSilenceTimer();
      applyExaminerState('listening');
      return;
    }
    clearSilenceTimer();
    if (thinkingRef.current) {
      applyExaminerState('thinking');
      return;
    }
    applyExaminerState('listening');
    // The candidate just stopped: if the examiner has not taken over shortly,
    // present the gap as deliberate thought rather than silence.
    if (previous === 'candidate') {
      silenceTimerRef.current = setTimeout(() => {
        silenceTimerRef.current = null;
        if (speakingStateRef.current === null) applyExaminerState('thinking');
      }, THINKING_GRACE_MS);
    }
  }

  function teardown() {
    clearSilenceTimer();
    recorderRef.current?.dispose();
    recorderRef.current = null;
    // A Live session keeps billing until it is closed server-side; fire the
    // close handshake without blocking teardown (the cron sweep is the backstop).
    const liveTransport = liveTransportRef.current;
    liveTransportRef.current = null;
    if (liveTransport) {
      try {
        void Promise.resolve(liveTransport.close({ reason: 'teardown' })).catch(() => {});
      } catch {}
    }
    liveAssemblerRef.current = null;
    // Invalidate pending permission/mint/SDP work before releasing resources.
    connectionGenerationRef.current += 1;
    if (micFailsafeRef.current) clearTimeout(micFailsafeRef.current);
    micFailsafeRef.current = null;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    if (autoEndRef.current) clearTimeout(autoEndRef.current);
    autoEndRef.current = null;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    try {
      micRef.current?.getTracks().forEach((t) => t.stop());
    } catch {}
    try {
      pcRef.current?.close();
    } catch {}
    try {
      audioCtxRef.current?.close();
    } catch {}
    micRef.current = null;
    pcRef.current = null;
    audioCtxRef.current = null;
    analyserExamRef.current = null;
    analyserMicRef.current = null;
    speakingStateRef.current = null;
    if (audioRef.current) audioRef.current.srcObject = null;
  }

  // ---- waveform visualizer -------------------------------------------------
  function attachAnalyser(stream) {
    try {
      if (!audioCtxRef.current) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        audioCtxRef.current = new Ctx();
      }
      const analyser = audioCtxRef.current.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.75;
      audioCtxRef.current.createMediaStreamSource(stream).connect(analyser);
      return analyser;
    } catch {
      return null; // visualizer is progressive enhancement — never block audio
    }
  }

  function startVisualizer() {
    const BARS = 56;
    const read = (analyser, out) => {
      if (!analyser) return 0;
      const data = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(data);
      const step = Math.max(1, Math.floor((data.length * 0.7) / BARS));
      let sum = 0;
      for (let i = 0; i < BARS; i += 1) {
        const v = data[i * step] / 255;
        out[i] = v;
        sum += v * v;
      }
      return Math.sqrt(sum / BARS);
    };
    const ex = new Array(BARS).fill(0);
    const me = new Array(BARS).fill(0);
    const loop = () => {
      rafRef.current = requestAnimationFrame(loop);
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr)) canvas.width = Math.round(w * dpr);
      if (canvas.height !== Math.round(h * dpr)) canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const exLevel = read(analyserExamRef.current, ex);
      const meLevel = read(analyserMicRef.current, me);
      const active =
        exLevel > 0.08 || meLevel > 0.08 ? (exLevel >= meLevel ? 'examiner' : 'candidate') : null;
      if (active !== speakingStateRef.current) {
        const previous = speakingStateRef.current;
        speakingStateRef.current = active;
        setSpeaking(active);
        handleSpeakerChange(active, previous);
      }

      // Mirrored bars around the midline: examiner (navy) up, you (emerald) down.
      const mid = h / 2;
      const gap = 2;
      const bw = Math.max(2, (w - gap * (BARS - 1)) / BARS);
      for (let i = 0; i < BARS; i += 1) {
        const x = i * (bw + gap);
        const up = Math.max(1.5, ex[i] * (mid - 3));
        const dn = Math.max(1.5, me[i] * (mid - 3));
        ctx.fillStyle = 'hsla(215, 60%, 25%, 0.9)';
        ctx.fillRect(x, mid - up, bw, up);
        ctx.fillStyle = 'hsla(160, 84%, 39%, 0.9)';
        ctx.fillRect(x, mid + 1, bw, dn);
      }
    };
    if (!rafRef.current) rafRef.current = requestAnimationFrame(loop);
  }

  function pushTranscript(role, text) {
    if (!text || !text.trim()) return;
    const trimmed = text.trim();
    // Guard against duplicate event deliveries of the same turn.
    const last = transcriptRef.current[transcriptRef.current.length - 1];
    if (last && last.role === role && last.text === trimmed) return;
    transcriptRef.current = [...transcriptRef.current, { role, text: trimmed }];
    setCaptions(transcriptRef.current);
    if (role === 'candidate') {
      setCandidateWords(
        transcriptRef.current
          .filter((t) => t.role === 'candidate')
          .reduce((n, t) => n + t.text.split(/\s+/).filter(Boolean).length, 0)
      );
    }
    // The examiner formally closes the test -> fetch the score automatically.
    if (role === 'examiner' && /that is the end of the speaking/i.test(trimmed) && !autoEndRef.current) {
      autoEndRef.current = setTimeout(() => endInterview(), 2500);
    }
  }

  // Live emits bare fragments with no turn boundaries: the assembler owns the
  // grouping, and captions/word count/auto-end all read the assembled turns.
  function pushLiveFragment(role, fragment) {
    const assembler = liveAssemblerRef.current;
    if (!assembler) return;
    const turns = assembler.push(role, fragment).map((t) => ({ role: t.role, text: t.text }));
    transcriptRef.current = turns;
    setCaptions(turns);
    setCandidateWords(
      turns
        .filter((t) => t.role === 'candidate')
        .reduce((n, t) => n + t.text.split(/\s+/).filter(Boolean).length, 0)
    );
    const lastExaminer = [...turns].reverse().find((t) => t.role === 'examiner');
    if (lastExaminer && /that is the end of the speaking/i.test(lastExaminer.text) && !autoEndRef.current) {
      autoEndRef.current = setTimeout(() => endInterview({ reason: 'examiner_closed' }), 2500);
    }
  }

  // Every session starts with the briefing: nobody is thrown into a
  // conversation without knowing what is about to happen.
  function chooseMode(mode) {
    setError('');
    if (!user) {
      setSignInOpen(true);
      return;
    }
    setActiveMode(mode);
    setPhase('briefing');
    track('examiner_briefing_shown', { mode });
  }

  function cancelBriefing() {
    setPhase('idle');
    setActiveMode(null);
  }

  async function startSession(mode) {
    setError('');
    if (!user) {
      setSignInOpen(true);
      return;
    }
    setActiveMode(mode);
    setPhase('connecting');
    resetExaminerState();
    sessionModeRef.current = mode;
    transcriptRef.current = [];
    setCaptions([]);
    setCandidateWords(0);
    setResult(null);
    endedRef.current = false;
    autoEndRef.current = null;
    liveSessionIdRef.current = null;
    liveUnmuteRequestedRef.current = false;
    sessionTransportRef.current = liveExaminerEnabled() ? 'live' : 'realtime';
    track('realtime_session_start', { mode, transport: sessionTransportRef.current });
    const generation = ++connectionGenerationRef.current;
    const isCurrent = () => generation === connectionGenerationRef.current;

    try {
      const auth = await resolveSpeakingAuthAction(getSupabase);
      if (!isCurrent()) return;
      if (auth.state === 'retry') {
        track('realtime_session_error', { mode, stage: 'start', error_type: 'auth_session', transport: sessionTransportRef.current });
        setError('Could not verify your session. Please refresh and try again.');
        setPhase('idle');
        return;
      }
      if (auth.state === 'sign_in') {
        setSignInOpen(true);
        setPhase('idle');
        return;
      }
      const headers = auth.headers;
      sessionOwnerRef.current = user.id;

      // 1. Mic first — no point burning minutes if permission is denied.
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!isCurrent()) {
        mic.getTracks().forEach((t) => t.stop());
        return;
      }
      micRef.current = mic;
      greetedRef.current = false;
      analyserMicRef.current = attachAnalyser(mic);

      assessmentRef.current = null;
      if (audioAssessmentEnabled()) {
        const recorder = await createRealtimeAudioRecorder(mic);
        if (!isCurrent()) { recorder.dispose(); return; }
        recorderRef.current = recorder;
      }

      // 2a. Live (gpt-live-1): one round trip mints and exchanges SDP.
      if (liveExaminerEnabled()) {
        await startLiveSession({ mode, mic, headers, isCurrent });
        return;
      }

      // 2. Mint the metered session token.
      const mintRes = await fetch('/api/realtime/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ mode, ...(audioAssessmentEnabled() ? { audioAssessment: true } : {}) }),
      });
      const mint = await mintRes.json().catch(() => ({}));
      if (!isCurrent()) return;
      if (!mintRes.ok) {
        teardown();
        setPhase('idle');
        setError(mint.error || 'Could not start the session.');
        minutes.refresh();
        return;
      }

      assessmentRef.current = mint.assessment || null;
      if (audioAssessmentEnabled() && !mint.assessment) throw new Error('assessment-not-enabled');

      // 3. WebRTC to OpenAI Realtime.
      const pc = new RTCPeerConnection();
      pcRef.current = pc;
      pc.ontrack = (e) => {
        if (!isCurrent()) return;
        if (audioRef.current) {
          audioRef.current.srcObject = e.streams[0];
          // iOS Safari can silently ignore autoPlay for a srcObject assigned
          // after the starting tap — kick playback explicitly.
          audioRef.current.play().catch(() => {});
        }
        analyserExamRef.current = attachAnalyser(e.streams[0]);
      };
      const micTrack = mic.getTracks()[0];
      // Keep the mic MUTED until the examiner finishes the greeting — early
      // room noise was tripping VAD and making the examiner stumble/restart
      // its first line.
      micTrack.enabled = false;
      pc.addTrack(micTrack, mic);
      const unmuteMic = () => {
        if (isCurrent()) micTrack.enabled = true;
      };
      micFailsafeRef.current = setTimeout(unmuteMic, 9000);

      const dc = pc.createDataChannel('oai-events');
      dc.onopen = () => {
        if (!isCurrent()) return;
        // Kick off the examiner's greeting EXACTLY once per session.
        if (greetedRef.current) return;
        greetedRef.current = true;
        dc.send(JSON.stringify({ type: 'response.create' }));
      };
      dc.onmessage = (e) => {
        if (!isCurrent()) return;
        try {
          const ev = JSON.parse(e.data);
          if (
            ev.type === 'conversation.item.input_audio_transcription.completed' ||
            ev.type === 'conversation.item.audio_transcription.completed'
          ) {
            pushTranscript('candidate', ev.transcript);
            if (examinerStateRef.current !== 'thinking') applyExaminerState('listening');
          } else if (ev.type === 'response.output_audio_transcript.done') {
            // ONE event name only — subscribing to aliases duplicated turns.
            pushTranscript('examiner', ev.transcript);
          } else if (ev.type === 'response.created') {
            // The model is composing its reply — label the pause.
            markExaminerThinking(true);
          } else if (ev.type === 'response.output_audio_transcript.delta') {
            // First audio of the reply: the examiner has the floor again.
            markExaminerSpeaking();
          } else if (ev.type === 'response.done') {
            markExaminerThinking(false);
            // Greeting finished — open the candidate's mic.
            clearTimeout(micFailsafeRef.current);
            micFailsafeRef.current = null;
            unmuteMic();
          } else if (ev.type === 'error') {
            console.error('realtime event error:', ev.error?.message || ev);
          }
        } catch {}
      };

      const offer = await pc.createOffer();
      if (!isCurrent()) return;
      await pc.setLocalDescription(offer);
      if (!isCurrent()) return;
      const sdpRes = await fetch(
        `https://api.openai.com/v1/realtime/calls?model=${encodeURIComponent(mint.model)}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${mint.clientSecret}`,
            'Content-Type': 'application/sdp',
          },
          body: offer.sdp,
        }
      );
      if (!isCurrent()) return;
      if (!sdpRes.ok) throw new Error(`webrtc answer failed (${sdpRes.status})`);
      const answer = await sdpRes.text();
      if (!isCurrent()) return;
      await pc.setRemoteDescription({ type: 'answer', sdp: answer });
      if (!isCurrent()) return;

      // 4. Session clock — hard stop at the paid duration.
      setSecondsLeft(mint.durationSeconds);
      timerRef.current = setInterval(() => {
        setSecondsLeft((s) => {
          if (s <= 1) {
            endInterview();
            return 0;
          }
          return s - 1;
        });
      }, 1000);

      recorderRef.current?.start();
      setPhase('live');
      startVisualizer();
      minutes.refresh();
    } catch (e) {
      if (!isCurrent()) return;
      teardown();
      setPhase('idle');
      setError(
        e?.name === 'NotAllowedError'
          ? 'Microphone access is required — please allow it and try again.'
          : e?.message?.startsWith('audio-recording')
            ? 'This browser could not record audio for pronunciation assessment. Try an up-to-date Chrome or Safari browser.'
            : 'Could not connect to the examiner. Please try again.'
      );
    }
  }

  // gpt-live-1 path: our server performs the SDP exchange, the examiner greets
  // itself (no response.create), and turn assembly happens client-side.
  async function startLiveSession({ mode, mic, headers, isCurrent }) {
    liveAssemblerRef.current = createLiveTranscriptAssembler();
    const unmuteMic = () => {
      if (!isCurrent() || liveUnmuteRequestedRef.current) return;
      if (micFailsafeRef.current) clearTimeout(micFailsafeRef.current);
      micFailsafeRef.current = null;
      liveUnmuteRequestedRef.current = true;
      liveTransportRef.current?.unmute();
    };

    let transport;
    try {
      transport = await connectLiveExaminer({
        mic,
        mode,
        headers,
        audioAssessment: audioAssessmentEnabled(),
        isCurrent,
        onRemoteStream: (stream) => {
          if (!isCurrent() || !stream) return;
          if (audioRef.current) {
            audioRef.current.srcObject = stream;
            // iOS Safari can ignore autoPlay for a late srcObject assignment.
            audioRef.current.play().catch(() => {});
          }
          analyserExamRef.current = attachAnalyser(stream);
        },
        onStarted: ({ sessionId }) => {
          liveSessionIdRef.current = sessionId;
        },
        onTranscript: (role, fragment) => {
          // The examiner's first words mean the greeting is under way.
          if (role === 'examiner') {
            unmuteMic();
            markExaminerSpeaking();
          } else if (examinerStateRef.current !== 'thinking') {
            applyExaminerState('listening');
          }
          pushLiveFragment(role, fragment);
        },
        // gpt-live-1 delegates to its backend between turns; surface the pause.
        onThinking: (isThinking) => {
          if (!isCurrent()) return;
          markExaminerThinking(isThinking);
        },
        onClosed: ({ reason }) => {
          // 'close_requested' is our own hangup; anything else ended the test.
          if (reason !== 'close_requested' && isCurrent()) endInterview({ reason });
        },
        onError: (err) => {
          console.error('live event error:', err?.message || err);
        },
      });
    } catch (e) {
      if (!isCurrent()) return;
      if (typeof e?.status === 'number') {
        teardown();
        setPhase('idle');
        setError(e.payload?.error || 'Could not start the session.');
        minutes.refresh();
        return;
      }
      throw e;
    }
    if (!isCurrent()) {
      try { await transport.close({ reason: 'abandoned' }); } catch {}
      return;
    }
    liveTransportRef.current = transport;
    pcRef.current = transport.pc;

    const mint = transport.mint;
    assessmentRef.current = mint.assessment || null;
    if (audioAssessmentEnabled() && !mint.assessment) throw new Error('assessment-not-enabled');

    if (liveUnmuteRequestedRef.current) transport.unmute();
    else micFailsafeRef.current = setTimeout(unmuteMic, 9000);

    setSecondsLeft(mint.durationSeconds);
    timerRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          endInterview({ reason: 'timer' });
          return 0;
        }
        return s - 1;
      });
    }, 1000);

    recorderRef.current?.start();
    setPhase('live');
    startVisualizer();
    minutes.refresh();
  }

  async function endInterview(options) {
    if (endedRef.current) return;
    endedRef.current = true;
    setPhase('scoring');
    const endReason = typeof options?.reason === 'string' ? options.reason : 'close_requested';
    let audioBlobs;
    const recorder = recorderRef.current;
    recorderRef.current = null;
    // Freeze capture before closing media. Flush the final audio frames.
    try { if (recorder) audioBlobs = await recorder.stop(); }
    catch {
      teardown(); setPhase('idle');
      setError('The recording could not be recovered, so pronunciation was not assessed.');
      return;
    }
    // Stop the Live meter before scoring: closing costs a round trip we would
    // rather pay now than leave to the server-side deadline sweep.
    const liveTransport = liveTransportRef.current;
    liveTransportRef.current = null;
    if (liveTransport) {
      try { await liveTransport.close({ reason: endReason }); } catch {}
    }
    teardown();
    const transcript = transcriptRef.current;
    // Timer/data-channel callbacks were created before the mode state render.
    // Keep the session identity in refs so automatic endings use this session.
    const sessionMode = sessionModeRef.current;
    track('realtime_session_end', {
      mode: sessionMode,
      turns: transcript.length,
      transport: sessionTransportRef.current,
    });

    const candidateWords = transcript
      .filter((t) => t.role === 'candidate')
      .reduce((n, t) => n + t.text.split(/\s+/).filter(Boolean).length, 0);
    if (!audioBlobs && candidateWords < MIN_SCORABLE_WORDS) {
      setPhase('idle');
      setError('The session ended before there was enough speech to score.');
      return;
    }

    const scorePayload = {
      version: 1,
      requestId: assessmentRef.current?.requestId || createRealtimeScoreRequestId(),
      userId: sessionOwnerRef.current || user?.id || '',
      mode: sessionMode,
      createdAt: Date.now(),
      transcript,
      ...(audioBlobs ? { audioBlobs, assessmentTicket: assessmentRef.current.ticket } : {}),
    };
    // Raw audio stays in memory until uploaded, never in session/localStorage.
    const stored = !audioBlobs && savePendingRealtimeScore(getBrowserSessionStorage(), scorePayload);
    const recoverableScore = { ...scorePayload, stored };
    setPendingScore(recoverableScore);
    await scorePendingInterview(recoverableScore);
  }

  async function scorePendingInterview(pending) {
    if (!pending || !claimPendingSpeakingScore(scoreAttemptRef)) return;
    setPhase('scoring');
    setError('');
    try {
      if (pending.audioBlobs && !pending.audioAssessment) {
        if (!currentUserIdRef.current || currentUserIdRef.current !== pending.userId) {
          setPhase('score_error'); setError('Sign in with the account that recorded this interview to upload its audio.'); return;
        }
        try {
          const count = await uploadRealtimeAudio(getSupabase(), pending);
          pending.audioAssessment = { ticket: pending.assessmentTicket, count };
          delete pending.audioBlobs;
          delete pending.uploadedParts;
          delete pending.assessmentTicket;
          pending.stored = savePendingRealtimeScore(getBrowserSessionStorage(), pending);
          setPendingScore({ ...pending });
        } catch {
          setPhase('score_error');
          setError('The recording upload did not finish. Keep this tab open and retry; your audio is still here.');
          return;
        }
      }
      const outcome = await submitPendingRealtimeScore({
        currentUserId: currentUserIdRef.current,
        fetchFn: fetch,
        getClient: getSupabase,
        pending,
      });
      if (outcome.status === 'success') {
        clearPendingRealtimeScore(getBrowserSessionStorage());
        setPendingScore(null);
        // Hold the reveal: the scoring animation fast-forwards to 100% first
        // (its onFinished flips the phase to 'done').
        setResult(outcome.result);
        track('realtime_session_scored', {
          mode: pending.mode,
          band: outcome.result.overallBand,
        });
        return;
      }

      setPhase('score_error');
      const recovery = pending.stored
        ? 'Your transcript is saved in this tab. Refresh and retry scoring.'
        : 'Your transcript is still available on this page. Retry without refreshing.';
      const errorType = outcome.status === 'auth_error' ? 'auth_session' : outcome.status;
      track('realtime_session_error', {
        mode: pending.mode,
        stage: 'score',
        error_type: errorType,
        transport: sessionTransportRef.current,
      });
      if (outcome.status === 'auth_error') {
        setError(`Could not verify your session. ${recovery}`);
      } else if (outcome.status === 'sign_in') {
        setSignInOpen(true);
        setError(`Sign in again to score this interview. ${recovery}`);
      } else if (outcome.status === 'owner_mismatch') {
        setError('Sign in with the account that completed this interview before retrying its score.');
      } else if (outcome.status === 'api_error') {
        setError(`${outcome.message} ${recovery}`);
      } else if (outcome.status === 'network_error') {
        setError(`Scoring could not connect. ${recovery}`);
      } else {
        clearPendingRealtimeScore(getBrowserSessionStorage());
        setPendingScore(null);
        setPhase('idle');
        setError('This saved interview transcript could not be recovered. Please start a new session.');
      }
    } finally {
      releasePendingSpeakingScore(scoreAttemptRef);
    }
  }

  function discardPendingScore() {
    clearPendingRealtimeScore(getBrowserSessionStorage());
    setPendingScore(null);
    setError('');
    setResult(null);
    setPhase('idle');
    transcriptRef.current = [];
    setCaptions([]);
    setCandidateWords(0);
    endedRef.current = false;
    sessionOwnerRef.current = null;
    sessionModeRef.current = null;
    setActiveMode(null);
    resetExaminerState();
  }

  const handleScoringFinished = React.useCallback(() => {
    setPhase('done');
    import('canvas-confetti')
      .then(({ default: confetti }) =>
        confetti({ spread: 100, particleCount: 180, origin: { y: 0.4 }, zIndex: 3000, scalar: 1.3 })
      )
      .catch(() => {});
  }, []);

  const minutesLeft = Math.floor(minutes.remainingSeconds / 60);
  const isLive = liveExaminerEnabled();
  const briefingCard = activeMode ? MODE_BY_ID[activeMode] : null;

  return (
    <>
      <Head>
        <title>{PAGE_TITLE}</title>
        <meta name="description" content={PAGE_DESCRIPTION} />
        <link rel="canonical" href={SPEAKING_EXAMINER_SEO.canonical} />
        <meta property="og:type" content="website" />
        <meta property="og:title" content={PAGE_TITLE} />
        <meta property="og:description" content={PAGE_DESCRIPTION} />
        <meta property="og:url" content={SPEAKING_EXAMINER_SEO.canonical} />
        <meta property="og:site_name" content="IELTS-Bank" />
        <meta property="og:image" content={SPEAKING_EXAMINER_SEO.ogImage} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:type" content="image/png" />
        <meta property="og:image:alt" content={SPEAKING_EXAMINER_SEO.imageAlt} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={PAGE_TITLE} />
        <meta name="twitter:description" content={PAGE_DESCRIPTION} />
        <meta name="twitter:image" content={SPEAKING_EXAMINER_SEO.ogImage} />
        <meta name="twitter:image:alt" content={SPEAKING_EXAMINER_SEO.imageAlt} />
      </Head>
      <Navbar />
      <main className="mx-auto w-full max-w-3xl px-4 pb-16 pt-10">
        {/* ---------- hero ---------- */}
        <header
          className={
            phase === 'idle'
              ? 'relative overflow-hidden rounded-3xl border bg-gradient-to-br from-primary/10 via-background to-accent/10 px-5 py-10 text-center sm:px-10 sm:py-14'
              : 'text-center'
          }
          data-analytics-surface="speaking_examiner"
        >
          {phase === 'idle' ? (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-accent/10 blur-3xl"
            />
          ) : null}
          <p className="relative mx-auto mb-4 inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">
            <Sparkles className="h-3.5 w-3.5" />
            <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent-foreground">
              New
            </span>
            Powered by gpt-live-1
          </p>
          <h1 className="relative text-3xl font-bold tracking-tight sm:text-4xl">
            A real examiner that listens while it speaks
          </h1>
          <p className="relative mx-auto mt-3 max-w-2xl text-muted-foreground">
            Your interview runs on OpenAI&apos;s gpt-live-1, released in September 2026 — a
            full-duplex voice model, so the examiner hears you even mid-sentence. Real 3-part
            format, adaptive follow-ups, and a practice band with feedback at the end.
          </p>
        </header>

        {error ? (
          <div role="alert" className="mx-auto mt-6 max-w-xl rounded-lg border border-red-300 bg-red-50 p-4 text-center text-sm text-red-900">
            {error}
          </div>
        ) : null}

        {/* ---------- what makes it different ---------- */}
        {phase === 'idle' ? (
          <>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {BENEFIT_TILES.map(({ icon: Icon, title, body }) => (
                <div
                  key={title}
                  className="rounded-2xl border bg-card p-5 shadow-sm transition-shadow hover:shadow-md"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 text-accent">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <h2 className="mt-3 text-sm font-semibold text-foreground">{title}</h2>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{body}</p>
                </div>
              ))}
            </div>

            <section
              aria-label="How a session goes"
              className="mt-8 rounded-2xl border bg-gradient-to-br from-primary/5 via-card to-accent/5 p-5 sm:p-6"
            >
              <h2 className="text-sm font-semibold text-foreground">How a session goes</h2>
              <ol className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                {SESSION_TIMELINE.map((stepLabel, i) => (
                  <li key={stepLabel} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
                      {i + 1}
                    </span>
                    <span className="font-medium text-foreground">{stepLabel}</span>
                    {i < SESSION_TIMELINE.length - 1 ? (
                      <ArrowRight aria-hidden="true" className="hidden h-3.5 w-3.5 sm:block" />
                    ) : null}
                  </li>
                ))}
              </ol>
            </section>
          </>
        ) : null}

        {audioAssessmentEnabled() && phase === 'idle' ? <p className="mt-4 rounded-lg border p-4 text-sm text-muted-foreground">
          Your microphone audio will be recorded and sent to OpenAI for feedback on all four speaking criteria, including pronunciation.
          Use headphones to keep the examiner’s voice out of your recording. Audio is stored privately for retries, deleted after a confirmed assessment, and otherwise scheduled for deletion after 30 days.
        </p> : null}

        {/* ---------- gate: signed-out / free ---------- */}
        {phase === 'idle' && !planLoading && !isPremium ? (
          <div
            role="status"
            data-analytics-id="speaking_examiner_paywall"
            className="mx-auto mt-8 max-w-xl overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/10 via-card to-accent/10 p-6 text-center shadow-sm"
          >
            <p className="text-lg font-semibold">The live examiner is part of Pro</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Sit a full 3-part Speaking interview that listens while it speaks, then get a band
              estimate and feedback on each criterion. Pro includes 30–60 examiner minutes a
              month depending on your region, plus Writing and Speaking scoring.
            </p>
            <NextLink
              href="/pricing?upgrade=speaking"
              onClick={() => track('paywall_upgrade_click', { source: 'speaking_examiner' })}
              className="mt-5 inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-accent-foreground no-underline hover:opacity-90"
            >
              <Sparkles className="h-4 w-4" /> See Pro plans
            </NextLink>
            <p className="mt-3 text-xs text-muted-foreground">
              Not sure yet?{' '}
              <NextLink href="/speakingquestion" className="font-semibold text-accent">
                Get one free Speaking sample score
              </NextLink>{' '}
              from a recorded answer first. 14-day money-back guarantee on Pro.
            </p>
          </div>
        ) : null}

        {/* ---------- idle: mode selection ---------- */}
        {phase === 'idle' && isPremium ? (
          <>
            <p className="mt-6 text-center text-sm text-muted-foreground">
              <Clock className="mr-1 inline h-4 w-4 align-[-2px]" />
              {minutes.loading
                ? 'Loading your examiner minutes…'
                : minutes.quotaSeconds === 0
                  ? 'Your current pass does not include live examiner minutes.'
                  : `${minutesLeft} examiner minutes left this period`}
            </p>
            {!minutes.loading && minutes.quotaSeconds === 0 ? (
              <p className="mt-2 text-center text-sm">
                <NextLink href="/pricing#plans" className="font-semibold text-primary underline">
                  Add examiner minutes with the Exam Pass or a subscription
                </NextLink>
              </p>
            ) : null}
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {MODE_CARDS.map((card) => (
                <Card
                  key={card.mode}
                  className="rounded-2xl transition-shadow hover:shadow-md"
                  data-analytics-id={`examiner_mode_${card.mode}`}
                >
                  <CardContent className="flex h-full flex-col p-5">
                    <div className="flex items-start justify-between gap-3">
                      <h2 className="font-semibold">{card.title}</h2>
                      <span className="shrink-0 rounded-full bg-secondary px-2.5 py-0.5 text-[11px] font-semibold text-secondary-foreground">
                        {card.tag}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{card.blurb}</p>
                    <ul className="mt-3 flex-1 space-y-1.5">
                      {card.highlights.map((item) => (
                        <li key={item} className="flex items-start gap-2 text-xs text-muted-foreground">
                          <CheckCircle2 aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
                          {item}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                      <Clock aria-hidden="true" className="h-3.5 w-3.5" />~{card.minutes} minutes
                    </p>
                    <button
                      type="button"
                      onClick={() => chooseMode(card.mode)}
                      disabled={minutes.remainingSeconds < card.minutes * 60}
                      className="mt-3 inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
                    >
                      <Mic className="h-4 w-4" /> Start
                    </button>
                    {minutes.remainingSeconds < card.minutes * 60 && !minutes.loading ? (
                      <p className="mt-2 text-center text-xs text-muted-foreground">
                        Not enough minutes left
                        {minutes.resetsAt && minutes.quotaSeconds > 0
                          ? ` — refills ${new Date(minutes.resetsAt).toLocaleDateString()}`
                          : ''}
                      </p>
                    ) : null}
                  </CardContent>
                </Card>
              ))}
            </div>
            <p className="mt-6 text-center text-xs text-muted-foreground">
              You&apos;ll need a microphone. The examiner speaks and listens in real time; your
              band score and feedback arrive when the interview ends.
            </p>
          </>
        ) : null}

        {/* ---------- pre-session briefing (every session) ---------- */}
        {phase === 'briefing' && briefingCard ? (
          <section
            aria-labelledby="examiner-briefing-title"
            data-analytics-id="examiner_briefing"
            data-analytics-surface="speaking_examiner"
            className="mt-8 overflow-hidden rounded-2xl border bg-card shadow-sm animate-in fade-in duration-300"
          >
            <div className="border-b bg-gradient-to-br from-primary/10 via-card to-accent/10 px-5 py-5 sm:px-7">
              <p className="text-xs font-semibold uppercase tracking-wide text-accent">
                Before you begin
              </p>
              <h2 id="examiner-briefing-title" className="mt-1 text-xl font-bold tracking-tight">
                {briefingCard.title}
              </h2>
              <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                <Clock aria-hidden="true" className="h-4 w-4" />
                About {briefingCard.minutes} minutes
              </p>
            </div>

            <div className="px-5 py-5 sm:px-7">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <ListChecks aria-hidden="true" className="h-4 w-4 text-accent" /> What happens next
              </h3>
              <ol className="mt-3 space-y-3">
                {(BRIEFING_STEPS[briefingCard.mode] || BRIEFING_STEPS.mock).map((stepText, i) => (
                  <li key={stepText} className="flex items-start gap-3 text-sm leading-relaxed text-muted-foreground">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
                      {i + 1}
                    </span>
                    {stepText}
                  </li>
                ))}
              </ol>

              <div className="mt-6 rounded-xl border bg-muted/30 p-4">
                <h3 className="text-sm font-semibold text-foreground">Quick check before we connect</h3>
                <ul className="mt-2.5 space-y-2">
                  {BRIEFING_CHECKLIST.map((item) => (
                    <li key={item} className="flex items-start gap-2.5 text-sm leading-relaxed text-muted-foreground">
                      <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              <p className="mt-5 flex items-start gap-2.5 rounded-xl border border-accent/30 bg-accent/5 p-4 text-sm leading-relaxed text-muted-foreground">
                <Mic aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                <span>
                  The examiner speaks first. It will greet you and ask for your name — answer out
                  loud so we can confirm your microphone is working before the test begins.
                </span>
              </p>

              <div className="mt-6 flex flex-col gap-2 sm:flex-row-reverse">
                <button
                  type="button"
                  onClick={() => startSession(briefingCard.mode)}
                  data-analytics-id="examiner_briefing_connect"
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-accent-foreground hover:opacity-90"
                >
                  <Mic className="h-4 w-4" /> I&rsquo;m ready — connect me
                </button>
                <button
                  type="button"
                  onClick={cancelBriefing}
                  data-analytics-id="examiner_briefing_back"
                  className="inline-flex items-center justify-center gap-2 rounded-lg border px-5 py-3 text-sm font-semibold hover:bg-muted sm:flex-none"
                >
                  <ArrowLeft className="h-4 w-4" /> Back
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {/* ---------- connecting ---------- */}
        {phase === 'connecting' ? (
          <ConnectingExaminer steps={isLive ? LIVE_CONNECT_STEPS : CONNECT_STEPS} />
        ) : null}

        {/* ---------- live interview ---------- */}
        {phase === 'live' ? (
          <div
            className="mt-8 overflow-hidden rounded-2xl border bg-card shadow-lg"
            data-analytics-id="examiner_live_panel"
            data-analytics-surface="speaking_examiner"
          >
            {/* header */}
            <div className="border-b bg-gradient-to-br from-primary/10 via-card to-accent/10 px-5 py-3">
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                <span className="inline-flex items-center gap-2 text-sm font-semibold">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
                  </span>
                  Interview in progress
                </span>
                <span className="font-mono text-lg font-semibold tabular-nums">{fmtTime(secondsLeft)}</span>
              </div>
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <ExaminerStatusPill state={examinerState} />
                {briefingCard ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground">
                    <MessageSquare aria-hidden="true" className="h-3.5 w-3.5" />
                    {briefingCard.title}
                  </span>
                ) : null}
              </div>
            </div>

            {/* waveform */}
            <div className="border-b bg-muted/20 px-5 pb-2 pt-4">
              <canvas ref={canvasRef} className="h-20 w-full" aria-hidden="true" />
              <div className="mt-2 flex items-center justify-between text-xs font-medium">
                <span
                  className={
                    speaking === 'examiner'
                      ? 'inline-flex items-center gap-1.5 text-primary'
                      : 'inline-flex items-center gap-1.5 text-muted-foreground/50'
                  }
                >
                  <span className="h-2 w-2 rounded-full bg-primary" /> Examiner
                  {speaking === 'examiner' ? ' — speaking…' : ''}
                </span>
                <span
                  className={
                    speaking === 'candidate'
                      ? 'inline-flex items-center gap-1.5 text-accent'
                      : 'inline-flex items-center gap-1.5 text-muted-foreground/50'
                  }
                >
                  <span className="h-2 w-2 rounded-full bg-accent" /> You
                  {speaking === 'candidate' ? ' — speaking…' : ''}
                </span>
              </div>
            </div>

            {/* transcript */}
            <div
              ref={captionsBoxRef}
              className="h-64 space-y-2.5 overflow-y-auto bg-muted/10 px-5 py-4 text-sm"
              aria-live="polite"
            >
              {captions.length === 0 ? (
                <p className="text-muted-foreground">
                  The examiner will greet you in a moment — say hello back and follow their lead.
                  Your words appear here as you speak.
                </p>
              ) : (
                captions.map((c, i) =>
                  c.role === 'examiner' ? (
                    <div key={i} className="flex justify-start">
                      <div className="max-w-[85%] rounded-2xl rounded-tl-sm border border-border bg-card px-3.5 py-2 leading-relaxed shadow-sm">
                        {c.text}
                      </div>
                    </div>
                  ) : (
                    <div key={i} className="flex justify-end">
                      <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-accent/10 px-3.5 py-2 leading-relaxed text-foreground">
                        {c.text}
                      </div>
                    </div>
                  )
                )
              )}
            </div>

            {/* footer */}
            <div className="flex flex-col items-center gap-2 border-t px-5 py-4">
              <button
                type="button"
                onClick={endInterview}
                disabled={candidateWords < MIN_SCORABLE_WORDS && !(assessmentRef.current && assessmentRef.current.durationSeconds - secondsLeft >= 30)}
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <PhoneOff className="h-4 w-4" /> End interview &amp; get my score
              </button>
              <p className="text-xs text-muted-foreground">
                {candidateWords < MIN_SCORABLE_WORDS
                  ? `Keep going — speak a little more for a fair score (${candidateWords}/${MIN_SCORABLE_WORDS} words so far). The interview also ends by itself.`
                  : 'Take your time — the examiner waits while you think. The interview ends by itself when the test finishes.'}
              </p>
              {isLive ? (
                <p className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                  <Sparkles aria-hidden="true" className="h-3 w-3" /> Powered by gpt-live-1 —
                  full-duplex, so you can interject
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        {/* ---------- scoring ---------- */}
        {phase === 'scoring' ? (
          <div className="mx-auto mt-8 max-w-xl rounded-xl border bg-card p-6 shadow-sm sm:p-7">
            <h2 className="mb-2 text-lg font-bold tracking-tight text-foreground">
              Marking your interview
            </h2>
            <ScoringProgress
              done={Boolean(result)}
              onFinished={handleScoringFinished}
              stages={pendingScore?.audioAssessment || pendingScore?.audioBlobs
                ? [{ icon: Headphones, label: 'Listening to your recording' }, ...SPEAKING_STAGES.slice(1, 4), { icon: Headphones, label: 'Assessing pronunciation and intelligibility' }, ...SPEAKING_STAGES.slice(4)]
                : SPEAKING_STAGES}
              tips={SPEAKING_TIPS}
              heading={pendingScore?.audioAssessment || pendingScore?.audioBlobs ? "Assessing your recording against the speaking rubric" : "Marking your transcript against the official rubric"}
            />
          </div>
        ) : null}

        {/* ---------- recover a completed interview score ---------- */}
        {phase === 'score_error' && pendingScore ? (
          <div className="mx-auto mt-8 max-w-xl rounded-xl border bg-card p-6 text-center shadow-sm">
            <h2 className="text-lg font-bold">Your interview is still ready to score</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              You do not need to repeat the interview. Retry the saved transcript when your
              connection or session is ready.
            </p>
            <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => scorePendingInterview(pendingScore)}
                disabled={authLoading}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                <Sparkles className="h-4 w-4" />
                {authLoading ? 'Checking your account…' : 'Retry scoring my interview'}
              </button>
              <button
                type="button"
                onClick={discardPendingScore}
                className="rounded-lg border px-5 py-2.5 text-sm font-semibold hover:bg-muted"
              >
                Discard transcript and start over
              </button>
            </div>
          </div>
        ) : null}

        {/* ---------- results ---------- */}
        {phase === 'done' && result ? (
          <div className="mt-8 space-y-4">
            {Number.isFinite(result.overallBand) ? (
              <BandHero
                band={result.overallBand}
                subtitle={`${
                  result.assessmentBasis === 'candidate_audio'
                    ? 'Estimated speaking band · four criteria'
                    : 'Transcript-based practice estimate'
                } · interviewed by the ${
                  sessionTransportRef.current === 'live' ? 'gpt-live-1 full-duplex' : 'Realtime'
                } examiner`}
              />
            ) : <p className="rounded-xl border p-5 font-semibold">Not enough clear audio for an overall band. Review the feedback and try again.</p>}

            {result.summary ? (
              <div className="rounded-xl border bg-card p-5 shadow-sm">
                <p className="text-sm font-semibold text-foreground">Examiner&apos;s summary</p>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {result.summary}
                </p>
              </div>
            ) : null}

            <div className="grid gap-4 md:grid-cols-2">
              {[
                ['Fluency & Coherence', result.criteria?.fluencyCoherence],
                ['Lexical Resource', result.criteria?.lexicalResource],
                ['Grammatical Range & Accuracy', result.criteria?.grammaticalRange],
                ...(result.assessmentBasis === 'candidate_audio' ? [['Pronunciation', result.criteria?.pronunciation]] : []),
              ].map(([label, c]) => (
                <Card key={label}>
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-foreground">{label}</p>
                      <span className="rounded-full bg-accent/10 px-2.5 py-0.5 text-sm font-bold tabular-nums text-accent">
                        {typeof c?.band === 'number' ? c.band.toFixed(1) : '—'}
                      </span>
                    </div>
                    <div className="mt-2.5">
                      <BandMeter band={c?.band} />
                    </div>
                    <div className="mt-4">
                      <CriterionFeedback criterion={c} />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <p className="rounded-md bg-secondary/60 px-4 py-3 text-xs leading-5 text-muted-foreground">
              {result.assessmentBasis === 'candidate_audio'
                ? 'AI practice estimate, not an official IELTS score. All four criteria carry equal weight. Pronunciation reflects clarity, sounds, stress, rhythm and intonation—not accent identity. A drill only samples one part of the test.'
                : "Pronunciation cannot be judged from a transcript. This practice estimate covers only fluency/coherence, vocabulary and grammar."}
            </p>
            {result.audioEvidence?.length ? <Card><CardContent className="p-5">
              <h2 className="font-semibold">Pronunciation observations</h2>
              <p className="mt-1 text-xs text-muted-foreground">Approximate times in your microphone recording.</p>
              <ul className="mt-3 space-y-2 text-sm">{result.audioEvidence.map((e, i) => <li key={i}>
                <span className="font-medium">{fmtTime(Math.floor(e.startSeconds))}–{fmtTime(Math.floor(e.endSeconds))}: </span>{e.observation}
              </li>)}</ul>
            </CardContent></Card> : null}
            {result.limitations?.length ? <div className="rounded-xl border p-5">
              <h2 className="font-semibold">Assessment limits</h2>
              <ul className="mt-2 list-disc pl-5 text-sm text-muted-foreground">{result.limitations.map((item, i) => <li key={i}>{item}</li>)}</ul>
            </div> : null}

            {Array.isArray(result.improvements) && result.improvements.length ? (
              <div className="rounded-xl border bg-card p-5 shadow-sm">
                <p className="text-sm font-semibold text-foreground">What to practise next</p>
                <ul className="mt-3 space-y-2">
                  {result.improvements.map((tip, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm leading-relaxed text-muted-foreground">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/10 text-[11px] font-bold text-accent">
                        {i + 1}
                      </span>
                      {tip}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="pt-2 text-center">
              <button
                type="button"
                onClick={() => {
                  setPhase('idle');
                  setResult(null);
                  setActiveMode(null);
                  minutes.refresh();
                }}
                className="rounded-lg border px-5 py-2.5 text-sm font-semibold hover:bg-muted"
              >
                Take another session
              </button>
            </div>
          </div>
        ) : null}

        {/* remote examiner audio */}
        <audio ref={audioRef} autoPlay playsInline className="hidden" />
      </main>
      <Footer />
      <SignInDialog
        open={signInOpen}
        onOpenChange={setSignInOpen}
        title={pendingScore ? 'Sign in to score your interview' : 'Sign in to meet your examiner'}
        description={
          pendingScore
            ? "Use the account that completed this interview — the transcript will stay here."
            : "Create your account or sign in — you'll stay right on this page."
        }
        trigger="speaking_examiner"
      />
    </>
  );
}
