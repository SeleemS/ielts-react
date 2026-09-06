// pages/speaking-examiner.js
// Live AI speaking examiner (Premium): a real-time voice interview over
// WebRTC with the OpenAI Realtime model, followed by a rubric-anchored
// transcript score from the standard scoring pass. docs/MONETIZATION.md §9.
import React from 'react';
import Head from 'next/head';
import NextLink from 'next/link';
import { Mic, PhoneOff, Sparkles, Clock, CheckCircle2, Headphones, MessageSquare, Gauge } from 'lucide-react';
import Navbar from '../src/components/Navbar';
import Footer from '../src/components/Footer';
import { Card, CardContent } from '../components/ui/card';
import SignInDialog from '../src/components/auth/SignInDialog';
import ExaminerIntroModal from '../src/components/question/ExaminerIntroModal';
import { useAuth } from '../src/lib/auth';
import { usePlan } from '../src/lib/usePlan';
import { useRealtimeMinutes } from '../src/lib/useRealtimeMinutes';
import { getSupabase } from '../lib/supabase';
import { track } from '../src/lib/analytics';
import { getLocalPref, setLocalPref, loadUserPref, saveUserPref } from '../src/lib/prefs';
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
  { mode: 'mock', title: 'Full mock interview', minutes: 14, blurb: 'Parts 1-3, exactly like the real test.' },
  { mode: 'part1', title: 'Part 1 drill', minutes: 5, blurb: 'Interview questions about familiar topics.' },
  { mode: 'part2', title: 'Part 2 drill', minutes: 5, blurb: 'Cue card, one minute prep, long turn.' },
  { mode: 'part3', title: 'Part 3 drill', minutes: 5, blurb: 'Abstract discussion questions.' },
];

function fmtTime(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Minimum candidate words before an interview can be ended for a score (the
// scoring API enforces the same threshold server-side).
const MIN_SCORABLE_WORDS = 40;
const INTRO_PREF = 'examinerIntroDismissed';

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
function ConnectingExaminer() {
  const [step, setStep] = React.useState(0);
  React.useEffect(() => {
    const t = setInterval(() => setStep((s) => Math.min(s + 1, CONNECT_STEPS.length - 1)), 1800);
    return () => clearInterval(t);
  }, []);
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
        {CONNECT_STEPS[step]}
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
  'Self-correcting a small mistake is a positive sign, not a penalty.',
  'In Part 2, using the full two minutes almost always helps your fluency band.',
];

export default function SpeakingExaminerPage() {
  const { user, loading: authLoading } = useAuth();
  const { isPremium, loading: planLoading } = usePlan();
  const minutes = useRealtimeMinutes();

  // phase: idle | connecting | live | scoring | score_error | done
  const [phase, setPhase] = React.useState('idle');
  const [error, setError] = React.useState('');
  const [signInOpen, setSignInOpen] = React.useState(false);
  const [captions, setCaptions] = React.useState([]); // [{role, text}]
  const [secondsLeft, setSecondsLeft] = React.useState(0);
  const [result, setResult] = React.useState(null);
  const [pendingScore, setPendingScore] = React.useState(null);

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
  // Intro modal (shown before the first interview unless dismissed forever).
  const [introOpen, setIntroOpen] = React.useState(false);
  const introDismissedRef = React.useRef(false);
  const pendingModeRef = React.useRef(null);
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

  React.useEffect(() => {
    const saved = loadPendingRealtimeScore(getBrowserSessionStorage());
    if (!saved) return;
    setPendingScore({ ...saved, stored: true });
    setPhase('score_error');
  }, []);

  React.useEffect(() => {
    if (getLocalPref(INTRO_PREF)) {
      introDismissedRef.current = true;
      return undefined;
    }
    let active = true;
    if (user?.id) {
      loadUserPref(user.id, INTRO_PREF).then((dismissed) => {
        if (active && dismissed) {
          introDismissedRef.current = true;
          setLocalPref(INTRO_PREF, true);
        }
      });
    }
    return () => {
      active = false;
    };
  }, [user?.id]);

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

  function teardown() {
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
        speakingStateRef.current = active;
        setSpeaking(active);
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

  async function startSession(mode) {
    setError('');
    if (!user) {
      setSignInOpen(true);
      return;
    }
    // First interview: show the explainer once, then continue with this mode.
    if (!introDismissedRef.current) {
      pendingModeRef.current = mode;
      setIntroOpen(true);
      introDismissedRef.current = true; // once per visit unless "don't show again"
      track('examiner_intro_shown', {});
      return;
    }
    setPhase('connecting');
    sessionModeRef.current = mode;
    transcriptRef.current = [];
    setCaptions([]);
    setCandidateWords(0);
    setResult(null);
    endedRef.current = false;
    autoEndRef.current = null;
    track('realtime_session_start', { mode });
    const generation = ++connectionGenerationRef.current;
    const isCurrent = () => generation === connectionGenerationRef.current;

    try {
      const auth = await resolveSpeakingAuthAction(getSupabase);
      if (!isCurrent()) return;
      if (auth.state === 'retry') {
        track('realtime_session_error', { mode, stage: 'start', error_type: 'auth_session' });
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

      // 2. Mint the metered session token.
      const mintRes = await fetch('/api/realtime/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ mode }),
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
          } else if (ev.type === 'response.output_audio_transcript.done') {
            // ONE event name only — subscribing to aliases duplicated turns.
            pushTranscript('examiner', ev.transcript);
          } else if (ev.type === 'response.done') {
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
          : 'Could not connect to the examiner. Please try again.'
      );
    }
  }

  async function endInterview() {
    if (endedRef.current) return;
    endedRef.current = true;
    teardown();
    const transcript = transcriptRef.current;
    // Timer/data-channel callbacks were created before the mode state render.
    // Keep the session identity in refs so automatic endings use this session.
    const sessionMode = sessionModeRef.current;
    track('realtime_session_end', {
      mode: sessionMode,
      turns: transcript.length,
    });

    const candidateWords = transcript
      .filter((t) => t.role === 'candidate')
      .reduce((n, t) => n + t.text.split(/\s+/).filter(Boolean).length, 0);
    if (candidateWords < MIN_SCORABLE_WORDS) {
      setPhase('idle');
      setError('The session ended before there was enough speech to score.');
      return;
    }

    const scorePayload = {
      version: 1,
      requestId: createRealtimeScoreRequestId(),
      userId: sessionOwnerRef.current || user?.id || '',
      mode: sessionMode,
      createdAt: Date.now(),
      transcript,
    };
    const stored = savePendingRealtimeScore(getBrowserSessionStorage(), scorePayload);
    const recoverableScore = { ...scorePayload, stored };
    setPendingScore(recoverableScore);
    await scorePendingInterview(recoverableScore);
  }

  async function scorePendingInterview(pending) {
    if (!pending || !claimPendingSpeakingScore(scoreAttemptRef)) return;
    setPhase('scoring');
    setError('');
    try {
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
  }

  const handleScoringFinished = React.useCallback(() => {
    setPhase('done');
    import('canvas-confetti')
      .then(({ default: confetti }) =>
        confetti({ spread: 100, particleCount: 180, origin: { y: 0.4 }, zIndex: 3000, scalar: 1.3 })
      )
      .catch(() => {});
  }, []);

  const handleIntroClose = ({ dontShowAgain }) => {
    setIntroOpen(false);
    if (dontShowAgain) {
      setLocalPref(INTRO_PREF, true);
      if (user?.id) saveUserPref(user.id, INTRO_PREF, true);
    }
  };

  const minutesLeft = Math.floor(minutes.remainingSeconds / 60);

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
        <header className="text-center">
          <p className="mx-auto mb-3 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5" /> Premium · Live AI examiner
          </p>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            A real speaking interview, any time you want one
          </h1>
          <p className="mt-3 text-muted-foreground">
            Talk to an AI examiner that runs the real 3-part IELTS Speaking format — adaptive
            questions, a timed cue card, and a band score with feedback at the end.
          </p>
        </header>

        {error ? (
          <div role="alert" className="mx-auto mt-6 max-w-xl rounded-lg border border-red-300 bg-red-50 p-4 text-center text-sm text-red-900">
            {error}
          </div>
        ) : null}

        {/* ---------- gate: signed-out / free ---------- */}
        {phase === 'idle' && !planLoading && !isPremium ? (
          <div role="status" className="mx-auto mt-8 max-w-xl rounded-xl border bg-card p-6 text-center shadow-sm">
            <p className="text-lg font-semibold">This is a Premium feature</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Premium includes 30–60 AI examiner minutes every month, depending on regional plan,
              plus fair-use Writing and Speaking scoring.
            </p>
            <NextLink
              href="/pricing"
              onClick={() => track('paywall_upgrade_click', { source: 'speaking_examiner' })}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground no-underline hover:opacity-90"
            >
              <Sparkles className="h-4 w-4" /> Get Premium
            </NextLink>
          </div>
        ) : null}

        {/* ---------- idle: mode selection ---------- */}
        {phase === 'idle' && isPremium ? (
          <>
            <p className="mt-6 text-center text-sm text-muted-foreground">
              <Clock className="mr-1 inline h-4 w-4 align-[-2px]" />
              {minutes.loading
                ? 'Loading your examiner minutes…'
                : `${minutesLeft} examiner minutes left this period`}
            </p>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {MODE_CARDS.map((card) => (
                <Card key={card.mode}>
                  <CardContent className="flex h-full flex-col p-5">
                    <h2 className="font-semibold">{card.title}</h2>
                    <p className="mt-1 flex-1 text-sm text-muted-foreground">{card.blurb}</p>
                    <p className="mt-2 text-xs text-muted-foreground">~{card.minutes} minutes</p>
                    <button
                      type="button"
                      onClick={() => startSession(card.mode)}
                      disabled={minutes.remainingSeconds < card.minutes * 60}
                      className="mt-3 inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
                    >
                      <Mic className="h-4 w-4" /> Start
                    </button>
                    {minutes.remainingSeconds < card.minutes * 60 && !minutes.loading ? (
                      <p className="mt-2 text-center text-xs text-muted-foreground">
                        Not enough minutes left
                        {minutes.resetsAt
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

        {/* ---------- connecting ---------- */}
        {phase === 'connecting' ? <ConnectingExaminer /> : null}

        {/* ---------- live interview ---------- */}
        {phase === 'live' ? (
          <div className="mt-8 overflow-hidden rounded-2xl border bg-card shadow-sm">
            {/* header */}
            <div className="flex items-center justify-between border-b px-5 py-3">
              <span className="inline-flex items-center gap-2 text-sm font-medium">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
                </span>
                Interview in progress
              </span>
              <span className="font-mono text-lg font-semibold tabular-nums">{fmtTime(secondsLeft)}</span>
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
                disabled={candidateWords < MIN_SCORABLE_WORDS}
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <PhoneOff className="h-4 w-4" /> End interview &amp; get my score
              </button>
              <p className="text-xs text-muted-foreground">
                {candidateWords < MIN_SCORABLE_WORDS
                  ? `Keep going — speak a little more for a fair score (${candidateWords}/${MIN_SCORABLE_WORDS} words so far). The interview also ends by itself.`
                  : 'Take your time — the examiner waits while you think. The interview ends by itself when the test finishes.'}
              </p>
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
              stages={SPEAKING_STAGES}
              tips={SPEAKING_TIPS}
              heading="Marking your transcript against the official rubric"
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
            <BandHero band={result.overallBand} subtitle="Live speaking interview" />

            {result.summary ? (
              <div className="rounded-xl border bg-card p-5 shadow-sm">
                <p className="text-sm font-semibold text-foreground">Examiner&apos;s summary</p>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {result.summary}
                </p>
              </div>
            ) : null}

            <div className="grid gap-4 lg:grid-cols-3">
              {[
                ['Fluency & Coherence', result.criteria?.fluencyCoherence],
                ['Lexical Resource', result.criteria?.lexicalResource],
                ['Grammatical Range & Accuracy', result.criteria?.grammaticalRange],
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
              <span className="font-semibold text-foreground">A note on pronunciation:</span>{' '}
              pronunciation can&apos;t be judged fairly from a transcript, so this estimate covers
              the three criteria above. In the real test it counts for a quarter of your score —
              keep practising aloud with the examiner.
            </p>

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
      <ExaminerIntroModal
        open={introOpen}
        onClose={handleIntroClose}
        onStart={() => {
          const pending = pendingModeRef.current;
          pendingModeRef.current = null;
          if (pending) startSession(pending);
        }}
      />
    </>
  );
}
