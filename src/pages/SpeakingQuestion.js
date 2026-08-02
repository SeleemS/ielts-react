import React, { useState, useEffect, useCallback, useRef } from 'react';
import Head from 'next/head';
import NextLink from 'next/link';
import { useRouter } from 'next/router';
import {
  Mic,
  Square,
  Play,
  Pause,
  Volume2,
  Clock,
  RotateCcw,
  ChevronDown,
  AlertTriangle,
  Sparkles,
  Lock,
} from 'lucide-react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import RelatedPractice from '../components/RelatedPractice';
import Modal from '../components/AccessibleModal';
import { Button } from '../../components/ui/button';
import { Textarea } from '../../components/ui/textarea';
import { Badge } from '../../components/ui/badge';
import { cn } from '../lib/utils';
import { useAuth } from '../lib/auth';
import { usePlan } from '../lib/usePlan';
import { useFreeSample } from '../lib/useFreeWritingSample';
import SignInDialog from '../components/auth/SignInDialog';
import { getSupabase } from '../../lib/supabase';
import {
  claimPendingSpeakingScore,
  getSpeakingAccessToken,
  releasePendingSpeakingScore,
} from '../lib/pendingSpeakingSession';
import { track } from '../lib/analytics';
import AiQuotaPanel from '../components/AiQuotaPanel';
import {
  speakingAudioControlLabel,
  speakingQuestionAudioContext,
} from '../lib/speakingAudioLabel';

import { sanitizeHtml } from '../../lib/sanitize';
import { SITE_URL } from '../../lib/site';
import {
  buildSpeakingQuestionJsonLd,
  serializeJsonLd,
} from '../../lib/speakingQuestionSeo';
const SCORE_API = '/api/score/speaking';
const UPLOAD_BUCKET = 'speaking-uploads';
// Premium gate: when a signed-in non-premium user submits a recording we
// upload it to their owner-only bucket and remember the path here, so the
// answer survives the trip to the billing page and can be scored on return.
const PENDING_PREFIX = 'ielts-pending-speaking:';
// Hard cap on the recording we upload/score (protects the upstream + storage).
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // ~5 MB
// Sensible recording cap for Part 1 / Part 3 answer sets (Part 2 uses the cue
// card's speakSecondsMax).
const DEFAULT_MAX_SECONDS = 240;

// Speaking rubric criteria (matches the scoring API response keys).
const SPEAKING_CRITERIA = [
  ['fluencyCoherence', 'Fluency & Coherence'],
  ['lexicalResource', 'Lexical Resource'],
  ['grammaticalRange', 'Grammatical Range & Accuracy'],
];

function cryptoRandomId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// Pick a MediaRecorder mime type the browser actually supports.
function pickMimeType() {
  if (typeof window === 'undefined' || typeof window.MediaRecorder === 'undefined') {
    return '';
  }
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
  ];
  for (const c of candidates) {
    try {
      if (window.MediaRecorder.isTypeSupported(c)) return c;
    } catch {
      /* ignore */
    }
  }
  return '';
}

function fmtTime(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

function formatBand(band) {
  return typeof band === 'number' ? band.toFixed(1) : '—';
}

function bandTone(band) {
  if (typeof band !== 'number') return 'bg-secondary text-secondary-foreground';
  if (band >= 7) return 'bg-accent text-accent-foreground';
  if (band >= 5.5) return 'bg-primary text-primary-foreground';
  return 'bg-destructive text-destructive-foreground';
}

function BandPill({ band, className }) {
  return (
    <span
      className={cn(
        'inline-flex min-w-[2.75rem] items-center justify-center rounded-full px-2.5 py-0.5 text-sm font-bold tabular-nums',
        bandTone(band),
        className
      )}
    >
      {formatBand(band)}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Microphone recorder hook (MediaRecorder -> webm/opus, with timer + caps).
// ---------------------------------------------------------------------------
function useRecorder(maxSeconds) {
  const [supported, setSupported] = useState(true);
  const [status, setStatus] = useState('idle'); // idle | recording | stopped | error
  const [seconds, setSeconds] = useState(0);
  const [blob, setBlob] = useState(null);
  const [blobUrl, setBlobUrl] = useState(null);
  const [error, setError] = useState('');

  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const bytesRef = useRef(0);
  const timerRef = useRef(null);
  const blobUrlRef = useRef(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const ok = !!(
      navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === 'function' &&
      typeof window.MediaRecorder !== 'undefined'
    );
    setSupported(ok);
  }, []);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    clearTimer();
    const mr = recorderRef.current;
    if (mr && mr.state !== 'inactive') {
      try {
        mr.stop();
      } catch {
        /* ignore */
      }
    }
  }, [clearTimer]);

  const start = useCallback(async () => {
    setError('');
    // Reset any previous recording.
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
    setBlob(null);
    setBlobUrl(null);
    setSeconds(0);
    chunksRef.current = [];
    bytesRef.current = 0;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = pickMimeType();
      const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      recorderRef.current = mr;

      mr.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data);
          bytesRef.current += e.data.size;
          if (bytesRef.current >= MAX_UPLOAD_BYTES) stop();
        }
      };

      mr.onstop = () => {
        const type = mr.mimeType || mime || 'audio/webm';
        const b = new Blob(chunksRef.current, { type });
        const url = URL.createObjectURL(b);
        blobUrlRef.current = url;
        setBlob(b);
        setBlobUrl(url);
        setStatus('stopped');
        stopStream();
      };

      // 1s timeslice so we can measure size as we go.
      mr.start(1000);
      setStatus('recording');

      const startedAt = Date.now();
      timerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startedAt) / 1000);
        setSeconds(elapsed);
        if (elapsed >= maxSeconds) stop();
      }, 250);
    } catch {
      setError(
        'Microphone access was blocked. Please allow microphone access in your browser and try again.'
      );
      setStatus('error');
      stopStream();
    }
  }, [maxSeconds, stop, stopStream]);

  const reset = useCallback(() => {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
    setBlob(null);
    setBlobUrl(null);
    setSeconds(0);
    setStatus('idle');
    setError('');
  }, []);

  // Cleanup on unmount.
  useEffect(
    () => () => {
      clearTimer();
      stopStream();
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    },
    [clearTimer, stopStream]
  );

  return { supported, status, seconds, blob, blobUrl, error, start, stop, reset };
}

// ---------------------------------------------------------------------------
// Examiner audio playback (one clip at a time).
// ---------------------------------------------------------------------------
function useExaminerAudio() {
  const audioRef = useRef(null);
  const [playingId, setPlayingId] = useState(null);
  const [loadingId, setLoadingId] = useState(null);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setPlayingId(null);
    setLoadingId(null);
  }, []);

  const toggle = useCallback(
    (url, id) => {
      if (!url) return;
      if (playingId === id && audioRef.current) {
        stop();
        return;
      }
      if (audioRef.current) audioRef.current.pause();
      const a = new Audio(url);
      audioRef.current = a;
      setLoadingId(id);
      setPlayingId(null);
      a.onplaying = () => { setLoadingId(null); setPlayingId(id); };
      a.onended = () => { setPlayingId(null); setLoadingId(null); };
      a.onerror = () => { setPlayingId(null); setLoadingId(null); };
      a.play().catch(() => { setPlayingId(null); setLoadingId(null); });
    },
    [playingId, stop]
  );

  useEffect(
    () => () => {
      if (audioRef.current) audioRef.current.pause();
    },
    []
  );

  return { toggle, stop, playingId, loadingId };
}

// ---------------------------------------------------------------------------
// Examiner "play question" button.
// ---------------------------------------------------------------------------
function ExaminerButton({
  url,
  id,
  playingId,
  loadingId,
  onToggle,
  label = 'examiner question',
}) {
  const disabled = !url;
  const isPlaying = playingId === id;
  const isLoading = loadingId === id;
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={disabled}
      onClick={() => onToggle(url, id)}
      className="shrink-0"
      aria-label={speakingAudioControlLabel({
        disabled,
        isLoading,
        isPlaying,
        context: label,
      })}
    >
      {isLoading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : isPlaying ? <Pause className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
      {isLoading ? 'Loading…' : isPlaying ? 'Pause' : 'Play'}
    </Button>
  );
}

// ---------------------------------------------------------------------------
// Shared recorder panel.
// ---------------------------------------------------------------------------
function RecorderPanel({ recorder, maxSeconds, minSeconds }) {
  const { supported, status, seconds, blobUrl, error } = recorder;

  if (!supported) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">Recording isn’t supported in this browser</p>
            <p className="mt-1">
              Audio recording needs a modern browser with microphone access (try the
              latest Chrome, Edge, Firefox or Safari). You can still read the questions and
              practise out loud.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const isRecording = status === 'recording';
  const hasRecording = status === 'stopped' && !!blobUrl;
  const nearMin = minSeconds ? Math.min((seconds / minSeconds) * 100, 100) : 0;

  return (
    <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-foreground">
          Your recording
        </h2>
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold tabular-nums text-muted-foreground">
          <Clock className="h-4 w-4" />
          {fmtTime(seconds)}
          <span className="text-muted-foreground/70">/ {fmtTime(maxSeconds)}</span>
        </span>
      </div>

      {isRecording && (
        <div className="mb-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-destructive">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive/60" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-destructive" />
            </span>
            Recording…
          </div>
          {minSeconds ? (
            <>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                <div
                  className={cn(
                    'h-full rounded-full transition-all',
                    seconds >= minSeconds ? 'bg-accent' : 'bg-primary'
                  )}
                  style={{ width: `${nearMin}%` }}
                />
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                {seconds >= minSeconds
                  ? 'You’ve reached the minimum length — keep going or stop when ready.'
                  : `Aim to speak for at least ${fmtTime(minSeconds)}.`}
              </p>
            </>
          ) : null}
        </div>
      )}

      {hasRecording && (
        <div className="mb-4">
          <audio src={blobUrl} controls className="w-full" />
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {!isRecording ? (
          <Button type="button" variant="accent" onClick={recorder.start}>
            <Mic className="h-4 w-4" />
            {hasRecording ? 'Record again' : 'Start recording'}
          </Button>
        ) : (
          <Button type="button" variant="destructive" onClick={recorder.stop}>
            <Square className="h-4 w-4" />
            Stop recording
          </Button>
        )}
        {hasRecording && !isRecording && (
          <Button type="button" variant="ghost" onClick={recorder.reset}>
            <RotateCcw className="h-4 w-4" />
            Clear
          </Button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Part 2 preparation timer + notes.
// ---------------------------------------------------------------------------
function PrepTimer({ prepSeconds, notes, onNotesChange }) {
  const [phase, setPhase] = useState('idle'); // idle | running | done
  const [left, setLeft] = useState(prepSeconds);
  const intervalRef = useRef(null);

  useEffect(
    () => () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    },
    []
  );

  const startPrep = () => {
    setLeft(prepSeconds);
    setPhase('running');
    const startedAt = Date.now();
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      const remaining = prepSeconds - elapsed;
      if (remaining <= 0) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
        setLeft(0);
        setPhase('done');
      } else {
        setLeft(remaining);
      }
    }, 250);
  };

  return (
    <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-foreground">
          Preparation
        </h2>
        {phase === 'running' && (
          <span className="inline-flex items-center gap-1.5 text-lg font-bold tabular-nums text-accent">
            <Clock className="h-4 w-4" />
            {fmtTime(left)}
          </span>
        )}
      </div>

      {phase === 'idle' && (
        <p className="mb-3 text-sm text-muted-foreground">
          You have {fmtTime(prepSeconds)} to prepare. Make notes below, then start speaking.
        </p>
      )}
      {phase === 'done' && (
        <p className="mb-3 text-sm font-medium text-accent">
          Preparation time is up — start your recording when you’re ready.
        </p>
      )}

      <Textarea
        value={notes}
        onChange={(e) => onNotesChange(e.target.value)}
        placeholder="Jot down a few notes to structure your answer…"
        className="min-h-[120px] resize-y"
        aria-label="Preparation notes"
      />

      {phase === 'idle' && (
        <Button type="button" variant="outline" className="mt-3" onClick={startPrep}>
          <Clock className="h-4 w-4" />
          Start {fmtTime(prepSeconds)} preparation
        </Button>
      )}
      {phase === 'running' && (
        <p className="mt-3 text-xs text-muted-foreground">
          The timer is running. You can begin recording early if you feel ready.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Score report (plain React — NO dangerouslySetInnerHTML of model output).
// ---------------------------------------------------------------------------
// A criterion withheld from the free-sample response. The API never sent the
// real content (reduced server-side), so there is nothing to "unhide" here.
function LockedCriterion({ label }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-secondary/30 p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-bold text-muted-foreground">{label}</h3>
        <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
          <Lock className="h-3 w-3" /> Premium
        </span>
      </div>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Unlock Premium for this criterion&apos;s band and examiner feedback.
      </p>
    </div>
  );
}

function ScoreReport({ result, slug = '' }) {
  const criteria = result.criteria || {};
  const improvements = Array.isArray(result.improvements) ? result.improvements : [];
  const pronunciation = result.pronunciation || {};
  const isTeaser = result.free === true;
  const [transcriptOpen, setTranscriptOpen] = useState(false);

  return (
    <div className="space-y-5">
      {/* Overall band */}
      <div className="flex items-center justify-between rounded-lg border border-border bg-secondary/40 px-5 py-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Overall Band
          </div>
          <div className="text-xs text-muted-foreground">IELTS Speaking</div>
        </div>
        <span
          className={cn(
            'inline-flex h-14 w-14 items-center justify-center rounded-full text-2xl font-extrabold tabular-nums',
            bandTone(result.overallBand)
          )}
        >
          {formatBand(result.overallBand)}
        </span>
      </div>

      {/* Per-criterion cards. On the free sample only the first criterion
          arrives from the API; the rest render as locked placeholders. */}
      <div className="space-y-3">
        {SPEAKING_CRITERIA.map(([key, label]) => {
          if (isTeaser && !criteria[key]) {
            return <LockedCriterion key={key} label={label} />;
          }
          const c = criteria[key] || {};
          return (
            <div key={key} className="rounded-lg border border-border bg-card p-4">
              <div className="mb-1.5 flex items-center justify-between gap-3">
                <h3 className="text-sm font-bold text-foreground">{label}</h3>
                <BandPill band={c.band} />
              </div>
              {c.feedback && (
                <p className="text-sm leading-relaxed text-muted-foreground">{c.feedback}</p>
              )}
            </div>
          );
        })}

        {/* Pronunciation — not assessed by the AI. */}
        <div className="rounded-lg border border-dashed border-border bg-secondary/30 p-4">
          <div className="mb-1.5 flex items-center justify-between gap-3">
            <h3 className="text-sm font-bold text-foreground">Pronunciation</h3>
            <span className="inline-flex items-center rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
              Not assessed by AI
            </span>
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {pronunciation.note ||
              'Pronunciation is best judged by a human examiner and is not scored automatically.'}
          </p>
        </div>
      </div>

      {/* Summary */}
      {result.summary && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="mb-1.5 text-sm font-bold text-foreground">Examiner Summary</h3>
          <p className="text-sm leading-relaxed text-muted-foreground">{result.summary}</p>
        </div>
      )}

      {/* Improvements */}
      {improvements.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="mb-2 text-sm font-bold text-foreground">How to Improve</h3>
          <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted-foreground">
            {improvements.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Transcript (collapsible) */}
      {result.transcript && (
        <div className="rounded-lg border border-border bg-card p-4">
          <button
            type="button"
            onClick={() => setTranscriptOpen((v) => !v)}
            aria-expanded={transcriptOpen}
            className="flex w-full items-center justify-between gap-3 text-left"
          >
            <h3 className="text-sm font-bold text-foreground">Transcript of your answer</h3>
            <ChevronDown
              className={cn(
                'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
                transcriptOpen && 'rotate-180'
              )}
            />
          </button>
          {transcriptOpen && (
            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
              {result.transcript}
            </p>
          )}
        </div>
      )}

      {/* Free-sample upgrade handoff (mirrors the writing teaser). */}
      {isTeaser && (
        <div className="rounded-xl border border-primary/25 bg-background/95 p-5 text-center shadow-lg">
          <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Lock className="h-5 w-5" />
          </span>
          <h3 className="mt-3 text-base font-bold text-foreground">
            That was your free Speaking sample
          </h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            You&apos;ve seen your overall band and Fluency &amp; Coherence. Premium unlocks the
            other two criteria, the examiner summary, and improvement advice — for every
            recording.
          </p>
          <Button asChild variant="accent" className="mt-4">
            <NextLink
              href="/pricing?upgrade=speaking"
              onClick={() =>
                track('paywall_upgrade_click', {
                  source: 'speaking_sample',
                  skill: 'speaking',
                  band: result.overallBand,
                  slug,
                })
              }
              className="no-underline"
            >
              <Sparkles className="h-4 w-4" />
              Unlock full feedback — Premium
            </NextLink>
          </Button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Question list (Part 1 & Part 3).
// ---------------------------------------------------------------------------
function QuestionList({ heading, questions, examiner }) {
  return (
    <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-foreground">
        {heading}
      </h2>
      <p className="mb-4 text-xs text-muted-foreground">
        Play each question, then record one continuous answer covering them all.
      </p>
      <ol className="space-y-3">
        {questions.map((q, i) => {
          const id = `q-${i}`;
          return (
            <li
              key={id}
              className="flex items-start justify-between gap-3 rounded-md border border-border/70 bg-secondary/20 p-3"
            >
              <div className="flex min-w-0 items-start gap-2.5">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                  {i + 1}
                </span>
                <p className="text-sm leading-relaxed text-foreground">{q.text}</p>
              </div>
              <ExaminerButton
                url={q.audioUrl}
                id={id}
                playingId={examiner.playingId}
                loadingId={examiner.loadingId}
                onToggle={examiner.toggle}
                label={speakingQuestionAudioContext(i, q.text)}
              />
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cue card (Part 2).
// ---------------------------------------------------------------------------
function CueCard({ cueCard, examiner }) {
  return (
    <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-foreground">
          Cue card
        </h2>
        <ExaminerButton
          url={cueCard.audioUrl}
          id="cue"
          playingId={examiner.playingId}
          loadingId={examiner.loadingId}
          onToggle={examiner.toggle}
          label="examiner reading the cue card"
        />
      </div>
      <p className="text-base font-bold text-foreground">{cueCard.topic}</p>
      {cueCard.bullets?.length > 0 && (
        <>
          <p className="mt-3 text-sm font-semibold text-muted-foreground">You should say:</p>
          <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm leading-relaxed text-foreground">
            {cueCard.bullets.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        </>
      )}
      {cueCard.explainLine && (
        <p className="mt-3 text-sm italic text-foreground">{cueCard.explainLine}</p>
      )}

      {cueCard.roundOff?.length > 0 && (
        <div className="mt-5 border-t border-border pt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Rounding-off questions
          </p>
          <ul className="space-y-2">
            {cueCard.roundOff.map((q, i) => {
              const id = `ro-${i}`;
              return (
                <li key={id} className="flex items-start justify-between gap-3">
                  <p className="text-sm leading-relaxed text-foreground">{q.text}</p>
                  <ExaminerButton
                    url={q.audioUrl}
                    id={id}
                    playingId={examiner.playingId}
                    loadingId={examiner.loadingId}
                    onToggle={examiner.toggle}
                  />
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Model answer (Band 8-9) — below the practice area. The answer arrives via
// getStaticProps (speaking_details.model_answer_html), so the teaser is in the
// server-rendered HTML for SEO. Free users see roughly the first 120 words
// behind a fade-out with an unlock card; Premium unlocks the full answer plus
// the examiner rationale. Display-only gate: usePlan().isPremium is fine here
// because this is content presentation, not scoring (which is server-gated).
// ---------------------------------------------------------------------------
const MODEL_ANSWER_HTML_CLASS =
  'text-sm leading-7 text-foreground [&_p]:mb-4 [&_h3]:mb-1.5 [&_h3]:mt-5 [&_h3]:text-sm [&_h3]:font-bold [&_h3:first-child]:mt-0 [&_ul]:mb-4 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:mb-1';

function ModelAnswerSection({ item }) {
  const { isPremium } = usePlan();
  const html = item?.modelAnswerHtml || '';
  if (!html) return null;
  const band = item.modelAnswerBand || '8-9';

  return (
    <section
      aria-labelledby="model-answer-heading"
      className="mt-10 rounded-lg border border-border bg-card p-5 shadow-sm"
    >
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h2
          id="model-answer-heading"
          className="text-sm font-bold uppercase tracking-wide text-foreground"
        >
          Model answer (Band {band})
        </h2>
        <Badge variant="secondary">Part {item.part}</Badge>
      </div>
      <p className="mb-4 text-xs text-muted-foreground">
        Original model answer written by our team for practice — not an official IELTS
        answer.
      </p>

      <div className="relative">
        <div
          className={cn(MODEL_ANSWER_HTML_CLASS, !isPremium && 'max-h-64 overflow-hidden')}
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }}
        />
        {!isPremium && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-card to-transparent"
          />
        )}
      </div>

      {isPremium ? (
        item.modelAnswerRationale ? (
          <div className="mt-5 rounded-md border border-border bg-secondary/30 p-4">
            <h3 className="mb-1.5 text-sm font-bold text-foreground">
              Why this reaches Band {band}
            </h3>
            <p className="text-sm leading-6 text-muted-foreground">
              {item.modelAnswerRationale}
            </p>
          </div>
        ) : null
      ) : (
        <div className="mt-4 rounded-xl border border-primary/25 bg-background/95 p-5 text-center">
          <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Lock className="h-5 w-5" />
          </span>
          <h3 className="mt-3 text-base font-bold text-foreground">
            Unlock the full model answer
          </h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Premium shows the complete Band {band} answer and the examiner&apos;s note on
            exactly what makes it high-scoring — on every speaking question.
          </p>
          <Button asChild variant="accent" className="mt-4">
            <NextLink
              href="/pricing?upgrade=speaking"
              onClick={() =>
                track('paywall_upgrade_click', {
                  source: 'speaking_model_answer',
                  skill: 'speaking',
                  part: item.part,
                  slug: item.slug,
                })
              }
              className="no-underline"
            >
              <Sparkles className="h-4 w-4" />
              Unlock model answers — Premium
            </NextLink>
          </Button>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Main practice page.
// ---------------------------------------------------------------------------
const SpeakingQuestion = ({ id: routeId, item, description, related = [] }) => {
  const { user } = useAuth();
  const { isPremium, loading: planLoading } = usePlan();
  const { used: sampleUsed } = useFreeSample('speaking');
  const router = useRouter();
  const examiner = useExaminerAudio();

  const part = item?.part;
  const isPart2 = part === 2;
  const maxSeconds = isPart2 ? item?.cueCard?.speakSecondsMax || 120 : DEFAULT_MAX_SECONDS;
  const minSeconds = isPart2 ? item?.cueCard?.speakSecondsMin || 60 : 0;

  const recorder = useRecorder(maxSeconds);

  const [notes, setNotes] = useState('');
  const [signInOpen, setSignInOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [quotaOpen, setQuotaOpen] = useState(false);
  const [quotaResetsAt, setQuotaResetsAt] = useState(null);
  // A recording saved to the user's account at the premium gate, waiting to
  // be scored (survives the round trip to the billing page).
  const [pendingRecording, setPendingRecording] = useState(null);
  const pendingScoreLock = useRef(false);

  const pendingKey = `${PENDING_PREFIX}${item?.slug || routeId}`;

  // Restore a saved-but-unscored recording pointer for this question.
  useEffect(() => {
    if (!user?.id || typeof window === 'undefined') return;
    try {
      const saved = JSON.parse(window.localStorage.getItem(pendingKey) || 'null');
      if (saved && saved.userId === user.id && saved.audioPath) {
        setPendingRecording(saved);
      }
    } catch {
      /* ignore malformed entry */
    }
  }, [pendingKey, user?.id]);

  const clearPendingRecording = useCallback(() => {
    setPendingRecording(null);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.removeItem(pendingKey);
      } catch {
        /* ignore */
      }
    }
  }, [pendingKey]);

  useEffect(() => {
    if (!recorder.blob) return;
    track('speaking_record_complete', {
      skill: 'speaking',
      slug: item?.slug || routeId,
      part,
      duration_seconds: recorder.seconds,
      size_bytes: recorder.blob.size,
      signed_in: Boolean(user),
    });
  }, [recorder.blob, recorder.seconds, item?.slug, part, routeId, user]);

  const partLabel = part ? `Part ${part}` : 'Speaking';
  const topic = item?.topic || item?.title || '';

  const errorForStatus = (statusCode, data) => {
    if (statusCode === 401) return 'Your session has expired. Please sign in again to get feedback.';
    if (statusCode === 403) return 'You don’t have permission to score this recording.';
    if (statusCode === 429)
      return (data && data.error) || 'You’ve reached the scoring limit. Please try again later.';
    if (statusCode === 400)
      return (data && data.error) || 'There was a problem with your submission. Please re-record and try again.';
    if (statusCode === 502)
      return 'The scoring service is temporarily unavailable. Please try again in a moment.';
    return (data && data.error) || 'Failed to score your recording. Please try again.';
  };

  // Premium gate: the recording is already uploaded to the user's owner-only
  // bucket (their account) — remember the path so it survives the trip to the
  // billing page, then send them there.
  const goToPremium = (audioPath) => {
    if (audioPath && user?.id && typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(
          pendingKey,
          JSON.stringify({
            userId: user.id,
            audioPath,
            part,
            timestamp: new Date().toISOString(),
          })
        );
      } catch {
        /* localStorage unavailable — non-fatal */
      }
    }
    track('paywall_redirect', { skill: 'speaking', slug: item.slug, source: 'speaking_submit' });
    router.push('/pricing?upgrade=speaking');
  };

  // POST an already-uploaded recording to the scorer and handle the outcome.
  const scoreAudioPath = async (audioPath, accessToken, fromPending = false) => {
    setIsLoading(true);
    try {
      const response = await fetch(SCORE_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          passageSlug: item.slug,
          part: fromPending ? pendingRecording?.part || part : part,
          audioPath,
          resume_saved: fromPending,
        }),
      });

      let data = null;
      try {
        data = await response.json();
      } catch {
        /* non-JSON error body */
      }

      if (response.ok && data) {
        clearPendingRecording();
        setResult(data);
        track('ai_score_result', { skill: 'speaking', slug: item.slug, outcome: 'ok', band: data.overallBand, part, signed_in: true });
        setFeedbackOpen(true);
        import('canvas-confetti').then(({ default: confetti }) => confetti({ spread: 100, particleCount: 200, origin: { y: 0.5 }, zIndex: 3000, scalar: 1.4 })).catch(() => {});
      } else if (response.status === 402 && data?.reason === 'premium_required') {
        // Server-side premium gate (covers a stale client plan).
        track('ai_score_result', { skill: 'speaking', slug: item.slug, outcome: 'premium_gate', part, signed_in: true });
        goToPremium(audioPath);
      } else if (
        fromPending &&
        [400, 403, 404, 413, 422].includes(response.status)
      ) {
        // Terminal validation/audio failures remove (or cannot access) the
        // object, so this pointer can never succeed on a later retry.
        clearPendingRecording();
        setErrorMsg('Your saved recording is no longer available. Please record your answer again.');
      } else {
        if (response.status === 402 || response.status === 429) {
          setQuotaResetsAt(data?.resetsAt || null);
          setQuotaOpen(true);
        }
        track('ai_score_result', { skill: 'speaking', slug: item.slug, outcome: response.status === 402 || response.status === 429 ? 'rate_limited' : 'error', http_status: response.status, part, signed_in: true });
        setErrorMsg(errorForStatus(response.status, data));
      }
    } catch {
      track('ai_score_result', { skill: 'speaking', slug: item.slug, outcome: 'error', error_type: 'network', part, signed_in: true });
      setErrorMsg('A network error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGetFeedback = async () => {
    setErrorMsg('');

    if (!recorder.blob) {
      setErrorMsg('Please record your answer before requesting feedback.');
      return;
    }

    // Sign-in gate: scoring is a Premium account feature.
    if (!user) {
      setSignInOpen(true);
      return;
    }

    track('speaking_submit', { skill: 'speaking', slug: item.slug, part, duration_seconds: recorder.seconds, signed_in: true });

    setIsLoading(true);
    try {
      const session = await getSpeakingAccessToken(getSupabase);
      if (session.error) {
        setIsLoading(false);
        track('ai_score_result', { skill: 'speaking', slug: item.slug, outcome: 'error', error_type: 'auth_session', part, from_pending: false, signed_in: true });
        setErrorMsg('Could not verify your session. Please refresh and try again.');
        return;
      }
      const accessToken = session.accessToken;
      if (!accessToken) {
        setIsLoading(false);
        setSignInOpen(true);
        return;
      }

      const supabase = getSupabase();

      // Upload the recording to the owner-only speaking-uploads bucket. This
      // also happens for non-premium users: it captures the answer to their
      // account before they're sent to the billing page.
      const blobType = recorder.blob.type || 'audio/webm';
      const ext = blobType.includes('mp4') ? 'mp4' : blobType.includes('ogg') ? 'ogg' : 'webm';
      const audioPath = `${user.id}/${cryptoRandomId()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from(UPLOAD_BUCKET)
        .upload(audioPath, recorder.blob, { contentType: blobType, upsert: false });

      if (uploadError) {
        setIsLoading(false);
        setErrorMsg('Could not upload your recording. Please try again.');
        return;
      }

      // Premium gate BEFORE the scoring call — but free users with their
      // lifetime Speaking sample still available go through to the server
      // (consume_ai_score v8 grants exactly one sampled score). When the plan
      // or sample state is still loading we let the server decide (the 402
      // premium_required handler catches it).
      if (!planLoading && !isPremium && sampleUsed === true) {
        setIsLoading(false);
        track('premium_gate', { skill: 'speaking', slug: item.slug, stage: 'upgrade' });
        goToPremium(audioPath);
        return;
      }

      await scoreAudioPath(audioPath, accessToken);
    } catch {
      setIsLoading(false);
      track('ai_score_result', { skill: 'speaking', slug: item.slug, outcome: 'error', error_type: 'network', part, signed_in: true });
      setErrorMsg('A network error occurred. Please try again.');
    }
  };

  // Score the recording saved at the premium gate (banner CTA below).
  const handleScorePending = async () => {
    setErrorMsg('');
    if (!pendingRecording?.audioPath) return;
    if (!user) {
      setSignInOpen(true);
      return;
    }
    if (!claimPendingSpeakingScore(pendingScoreLock)) return;
    setIsLoading(true);
    try {
      const session = await getSpeakingAccessToken(getSupabase);
      if (session.error) {
        track('ai_score_result', { skill: 'speaking', slug: item.slug, outcome: 'error', error_type: 'auth_session', part, from_pending: true, signed_in: true });
        setErrorMsg('Could not verify your session. Please refresh and try again.');
        return;
      }
      if (!session.accessToken) {
        setSignInOpen(true);
        return;
      }
      track('speaking_submit', { skill: 'speaking', slug: item.slug, part, from_pending: true, signed_in: true });
      await scoreAudioPath(pendingRecording.audioPath, session.accessToken, true);
    } finally {
      releasePendingSpeakingScore(pendingScoreLock);
      setIsLoading(false);
    }
  };

  // SEO.
  const pageTitle = topic
    ? `${topic} | IELTS Speaking ${partLabel} Practice | IELTS-Bank`
    : 'IELTS Speaking Practice | IELTS-Bank';
  const metaDescription =
    description ||
    `Practise IELTS Speaking ${partLabel} with an examiner voice and record your answer for instant AI band feedback.`;
  const canonicalUrl = `${SITE_URL}/speakingquestion/${encodeURIComponent(routeId || '')}`;
  const ogImage = `${SITE_URL}/api/og?title=${encodeURIComponent(
    topic || 'IELTS Speaking Practice'
  )}&type=speaking&subtitle=${encodeURIComponent(partLabel)}`;

  if (!item) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="mx-auto max-w-3xl px-4 py-20 text-center">
          <h1 className="text-lg font-semibold text-muted-foreground">Loading question…</h1>
        </div>
      </div>
    );
  }

  const jsonLd = buildSpeakingQuestionJsonLd({
    canonicalUrl,
    topic,
    description: metaDescription,
    partLabel,
    difficulty: item.difficulty,
  });

  return (
    <>
      <Head>
        <title>{pageTitle}</title>
        <meta name="description" content={metaDescription} />
        <meta name="robots" content="index, follow" />
        <link rel="canonical" href={canonicalUrl} />
        <meta property="og:title" content={pageTitle} />
        <meta property="og:description" content={metaDescription} />
        <meta property="og:type" content="article" />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:site_name" content="IELTS-Bank" />
        <meta property="og:image" content={ogImage} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:type" content="image/png" />
        <meta property="og:image:alt" content={`IELTS Speaking ${partLabel} practice: ${topic}`} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={pageTitle} />
        <meta name="twitter:description" content={metaDescription} />
        <meta name="twitter:image" content={ogImage} />
        <meta name="twitter:image:alt" content={`IELTS Speaking ${partLabel} practice: ${topic}`} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
        />
      </Head>

      <div className="flex min-h-screen flex-col bg-background">
        <Navbar />

        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 pb-16 sm:px-6 lg:px-8">
          <div className="mb-6">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge variant="emerald">{partLabel}</Badge>
              {item.difficulty && <Badge variant="secondary">{item.difficulty}</Badge>}
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">{topic}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              IELTS Speaking Practice — AI-Powered Feedback
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Left: the prompt / cue card / questions */}
            <div className="space-y-6">
              {isPart2 && item.cueCard && (
                <CueCard cueCard={item.cueCard} examiner={examiner} />
              )}
              {part === 1 && item.part1 && (
                <QuestionList
                  heading="Part 1 questions"
                  questions={item.part1.questions}
                  examiner={examiner}
                />
              )}
              {part === 3 && item.part3 && (
                <QuestionList
                  heading="Part 3 discussion questions"
                  questions={item.part3.questions}
                  examiner={examiner}
                />
              )}
            </div>

            {/* Right: prep (Part 2) + recorder */}
            <div className="space-y-6">
              {isPart2 && item.cueCard && (
                <PrepTimer
                  prepSeconds={item.cueCard.prepSeconds || 60}
                  notes={notes}
                  onNotesChange={setNotes}
                />
              )}
              <RecorderPanel
                recorder={recorder}
                maxSeconds={maxSeconds}
                minSeconds={minSeconds}
              />

              {user && pendingRecording && !result ? (
                <div className="rounded-lg border border-accent/40 bg-accent/5 p-4">
                  <p className="text-sm font-semibold text-foreground">
                    Your earlier recording is saved to your account
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Get it scored now — no need to record again.
                  </p>
                  <Button className="mt-3" variant="accent" disabled={isLoading} onClick={handleScorePending}>
                    <Sparkles className="h-4 w-4" />
                    Score my saved recording
                  </Button>
                </div>
              ) : null}

              {errorMsg && (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {errorMsg}
                </div>
              )}

              <div className="flex flex-col items-stretch gap-2">
                <Button
                  variant="accent"
                  size="lg"
                  onClick={handleGetFeedback}
                  disabled={isLoading || !recorder.blob}
                >
                  {isLoading ? 'Analyzing…' : 'Get AI feedback'}
                </Button>
                {!user && (
                  <p className="text-center text-xs text-muted-foreground">
                    AI feedback is a Premium feature — you’ll be asked to sign up first, and
                    your recording is saved to your account so it’s never lost.
                  </p>
                )}
                <AiQuotaPanel userId={user?.id} remaining={result?.quotaRemaining} open={quotaOpen} onClose={() => setQuotaOpen(false)} resetsAt={quotaResetsAt} />
              </div>
            </div>
          </div>
          <ModelAnswerSection item={item} />
          <RelatedPractice skill="speaking" items={related} className="mt-10" />
        </main>

        <Footer />
      </div>

      {/* Sign-in gate */}
      <SignInDialog
        open={signInOpen}
        onOpenChange={setSignInOpen}
        redirectOnFinish={false}
        title="Sign up to get your speaking scored"
        description="AI Speaking feedback is a Premium feature. Create your account first — your recording stays right here, ready to submit."
        trigger="speaking_score"
      />

      {/* Feedback modal — structured, plain-text render (no HTML injection) */}
      <Modal
        open={feedbackOpen && !!result}
        onClose={() => setFeedbackOpen(false)}
        title="Your AI Feedback & Score"
      >
        {result && <ScoreReport result={result} slug={item.slug} />}
        {result ? <div className="mt-5 rounded-lg border border-accent/30 bg-accent/5 p-4"><p className="text-sm font-semibold text-foreground">Try another answer while the feedback is fresh{result.quotaRemaining != null ? ` — ${result.quotaRemaining} score${result.quotaRemaining === 1 ? '' : 's'} left today.` : '.'}</p><Button className="mt-3" variant="outline" onClick={() => { setFeedbackOpen(false); setResult(null); recorder.reset(); }}>Record another answer</Button></div> : null}
        <div className="mt-5 flex justify-end">
          <Button onClick={() => setFeedbackOpen(false)}>Close</Button>
        </div>
      </Modal>

      {/* Loading modal */}
      <Modal open={isLoading} onClose={() => {}} title="Analyzing your recording" dismissible={false}>
        <div className="flex flex-col items-center gap-4 py-6 text-center">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-secondary border-t-accent" />
          <p className="text-sm text-muted-foreground">
            Transcribing and scoring against the IELTS Speaking rubric.
            <br />
            This can take up to 60 seconds.
          </p>
        </div>
      </Modal>
    </>
  );
};

export default SpeakingQuestion;
