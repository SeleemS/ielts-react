import { resolveSpeakingAuthAction } from './pendingSpeakingSession';

// A completed live interview may outlive the first scoring request. Keep its
// transcript only in tab-scoped sessionStorage (never durable localStorage),
// bind it to the account that ran the session, and expire it after one day.
const STORAGE_KEY = 'ielts-pending-realtime-score';
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_TRANSCRIPT_CHARS = 60000;
const ALLOWED_MODES = new Set(['mock', 'part1', 'part2', 'part3']);
const REQUEST_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createRealtimeScoreRequestId(cryptoApi = globalThis.crypto) {
  const nativeId = cryptoApi?.randomUUID?.();
  if (REQUEST_ID_RE.test(nativeId || '')) return nativeId;

  const bytes = new Uint8Array(16);
  if (cryptoApi?.getRandomValues) cryptoApi.getRandomValues(bytes);
  else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function normalizePendingRealtimeScore(value) {
  if (!value || value.version !== 1) return null;
  const requestId = typeof value.requestId === 'string' ? value.requestId : '';
  const userId = typeof value.userId === 'string' ? value.userId.trim() : '';
  const mode = typeof value.mode === 'string' ? value.mode : '';
  const createdAt = Number(value.createdAt);
  if (
    !REQUEST_ID_RE.test(requestId)
    || !userId
    || !ALLOWED_MODES.has(mode)
    || !Number.isFinite(createdAt)
  ) return null;
  if (!Array.isArray(value.transcript) || (value.transcript.length === 0 && !value.audioAssessment)) return null;

  let totalChars = 0;
  const transcript = [];
  for (const turn of value.transcript) {
    if (
      !turn
      || (turn.role !== 'examiner' && turn.role !== 'candidate')
      || typeof turn.text !== 'string'
      || !turn.text.trim()
    ) {
      return null;
    }
    const text = turn.text.trim();
    totalChars += text.length;
    if (totalChars > MAX_TRANSCRIPT_CHARS) return null;
    transcript.push({ role: turn.role, text });
  }

  const audioAssessment = value.audioAssessment;
  if (audioAssessment != null && (typeof audioAssessment.ticket !== 'string' || audioAssessment.ticket.length > 2000
    || !Number.isInteger(audioAssessment.count) || audioAssessment.count < 1 || audioAssessment.count > 2)) return null;
  return { version: 1, requestId, userId, mode, createdAt, transcript, ...(audioAssessment ? { audioAssessment } : {}) };
}

export function savePendingRealtimeScore(storage, pending) {
  const normalized = normalizePendingRealtimeScore(pending);
  if (!storage || !normalized) return false;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    return true;
  } catch {
    return false;
  }
}

export function loadPendingRealtimeScore(
  storage,
  { now = Date.now(), requestIdFactory = createRealtimeScoreRequestId } = {}
) {
  if (!storage) return null;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const hadRequestId = Boolean(parsed.requestId);
    if (!parsed.requestId) {
      parsed.requestId = requestIdFactory();
    }
    const normalized = normalizePendingRealtimeScore(parsed);
    if (
      !normalized
      || normalized.createdAt > now + 60000
      || now - normalized.createdAt > MAX_AGE_MS
    ) {
      storage.removeItem(STORAGE_KEY);
      return null;
    }
    if (!hadRequestId) {
      storage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    }
    return normalized;
  } catch {
    try {
      storage.removeItem(STORAGE_KEY);
    } catch {}
    return null;
  }
}

export function clearPendingRealtimeScore(storage) {
  try {
    storage?.removeItem(STORAGE_KEY);
  } catch {}
}

export async function submitPendingRealtimeScore({
  currentUserId,
  fetchFn,
  getClient,
  pending,
}) {
  const normalized = normalizePendingRealtimeScore(pending);
  if (!normalized) return { status: 'invalid' };
  if (!currentUserId) return { status: 'sign_in' };
  if (normalized.userId !== currentUserId) return { status: 'owner_mismatch' };

  const auth = await resolveSpeakingAuthAction(getClient);
  if (auth.state === 'retry') return { status: 'auth_error' };
  if (auth.state === 'sign_in') return { status: 'sign_in' };

  try {
    const response = await fetchFn('/api/score/speaking-realtime', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth.headers },
      body: JSON.stringify({
        requestId: normalized.requestId,
        mode: normalized.mode,
        transcript: normalized.transcript,
        ...(normalized.audioAssessment ? { audioAssessment: normalized.audioAssessment } : {}),
      }),
    });
    const body = await response.json().catch(() => ({}));
    if (response.status === 401) return { status: 'sign_in' };
    if (!response.ok || response.status !== 200) {
      return {
        status: 'api_error',
        message: body.error || 'Scoring failed. Please try again.',
      };
    }
    if (!Number.isFinite(body.overallBand) && !(body.overallBand === null && body.assessmentStatus === 'insufficient_evidence')) {
      return {
        status: 'api_error',
        message: 'Scoring returned an incomplete result. Please try again.',
      };
    }
    return { status: 'success', result: body };
  } catch {
    return { status: 'network_error' };
  }
}
