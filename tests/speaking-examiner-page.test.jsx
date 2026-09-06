// @vitest-environment jsdom
import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ refresh: vi.fn(), userId: 'qa-fixture', recorder: null, upload: vi.fn() }));
vi.mock('../src/lib/realtimeAudioRecorder', () => ({ createRealtimeAudioRecorder: async () => { if (state.recorder instanceof Error) throw state.recorder; return state.recorder; }, uploadRealtimeAudio: (...args) => state.upload(...args) }));
vi.mock('next/head', () => ({ default: () => null }));
vi.mock('next/link', () => ({ default: ({ href, children }) => <a href={href}>{children}</a> }));
vi.mock('../src/components/Navbar', () => ({ default: () => null }));
vi.mock('../src/components/Footer', () => ({ default: () => null }));
vi.mock('../src/components/auth/SignInDialog', () => ({ default: () => null }));
vi.mock('../src/components/question/ExaminerIntroModal', () => ({ default: () => null }));
vi.mock('../src/components/question/ScoreUI', () => ({ ScoringProgress: () => null, CriterionFeedback: () => null, BandHero: () => null, BandMeter: () => null }));
vi.mock('../src/lib/auth', () => ({ useAuth: () => ({ user: { id: state.userId }, loading: false }) }));
vi.mock('../src/lib/usePlan', () => ({ usePlan: () => ({ isPremium: true, loading: false }) }));
vi.mock('../src/lib/useRealtimeMinutes', () => ({ useRealtimeMinutes: () => ({ remainingSeconds: 3600, refresh: state.refresh }) }));
vi.mock('../src/lib/analytics', () => ({ track: () => {} }));
vi.mock('../src/lib/prefs', () => ({ getLocalPref: () => true, setLocalPref: () => {}, loadUserPref: async () => true, saveUserPref: () => {} }));
vi.mock('../lib/supabase', () => ({ getSupabase: () => ({ auth: { getSession: async () => ({ data: { session: { access_token: 'fixture-token' } }, error: null }) } }) }));
import SpeakingExaminerPage from '../pages/speaking-examiner';
let root, container, media, track, peers, fetchMock, intervalSpy, clearIntervalSpy;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const response = (body, ok = true) => ({ ok, status: ok ? 200 : 503, json: async () => body, text: async () => 'fixture-answer' });
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
async function start() { await act(async () => [...container.querySelectorAll('button')].filter(b => b.textContent.trim() === 'Start')[1].click()); }
function unmount() { act(() => root.unmount()); root = null; }
beforeEach(async () => {
  vi.useFakeTimers();
  intervalSpy = vi.spyOn(globalThis, 'setInterval');
  clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');
  state.recorder = { start: vi.fn(), dispose: vi.fn(), stop: vi.fn(async () => [new Blob(['audio'])]) };
  state.upload.mockReset().mockResolvedValue(1);
  sessionStorage.clear(); state.userId = 'qa-fixture';
  peers = [];
  track = { enabled: true, stop: vi.fn() };
  media = { getTracks: () => [track] };
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(media) } });
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.stubGlobal('RTCPeerConnection', class {
    constructor() { this.channel = { send: vi.fn() }; this.close = vi.fn(); peers.push(this); }
    addTrack = vi.fn();
    createDataChannel = () => this.channel;
    createOffer = async () => ({ type: 'offer', sdp: 'fixture-offer' });
    setLocalDescription = async () => {};
    setRemoteDescription = async () => {};
  });
  fetchMock = vi.fn().mockResolvedValueOnce(response({ clientSecret: 'fixture-ephemeral', model: 'fixture-model', durationSeconds: 300 })).mockResolvedValue(response({}));
  vi.stubGlobal('fetch', fetchMock);
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  await act(async () => root.render(<SpeakingExaminerPage />));
});
afterEach(() => { if (root) unmount(); container.remove(); vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.clearAllMocks(); });
describe('synthetic WebRTC page lifecycle (no device or provider calls)', () => {
  it('requests microphone before minting and greets exactly once, then unmutes after the greeting', async () => {
    await start();
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(navigator.mediaDevices.getUserMedia.mock.invocationCallOrder[0]).toBeLessThan(fetchMock.mock.invocationCallOrder[0]);
    expect(container.textContent).toContain('Interview in progress');
    expect(track.enabled).toBe(false);
    peers[0].channel.onopen(); peers[0].channel.onopen();
    expect(peers[0].channel.send).toHaveBeenCalledExactlyOnceWith(JSON.stringify({ type: 'response.create' }));
    peers[0].channel.onmessage({ data: JSON.stringify({ type: 'response.done' }) });
    expect(track.enabled).toBe(true);
    unmount();
    expect(track.stop).toHaveBeenCalledOnce();
    expect(peers[0].close).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('records candidate audio and preserves an uploaded recording for score retry without recording again', async () => {
    vi.stubEnv('NEXT_PUBLIC_REALTIME_AUDIO_ASSESSMENT', 'true');
    const requestId='22222222-2222-4222-8222-222222222222';
    fetchMock.mockReset().mockResolvedValueOnce(response({clientSecret:'fixture',model:'gpt-realtime-2.1',durationSeconds:300,assessment:{ticket:'signed-ticket',requestId}})).mockResolvedValueOnce(response({}));
    await start();
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).audioAssessment).toBe(true);
    expect(state.recorder.start).toHaveBeenCalledOnce();
    await act(async () => peers[0].channel.onmessage({data:JSON.stringify({type:'conversation.item.input_audio_transcription.completed',transcript:Array(45).fill('word').join(' ')})}));
    fetchMock.mockResolvedValueOnce(response({error:'retry'},false));
    await act(async () => [...container.querySelectorAll('button')].find(b=>b.textContent.includes('End interview')).click());
    expect(state.recorder.stop).toHaveBeenCalledOnce();
    expect(state.upload).toHaveBeenCalledOnce();
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toMatchObject({requestId,audioAssessment:{ticket:'signed-ticket',count:1}});
    expect(sessionStorage.getItem('ielts-pending-realtime-score')).not.toContain('audioBlobs');
    fetchMock.mockResolvedValueOnce(response({overallBand:null,assessmentStatus:'insufficient_evidence'}));
    await act(async () => [...container.querySelectorAll('button')].find(b=>b.textContent.includes('Retry scoring my interview')).click());
    expect(state.upload).toHaveBeenCalledOnce();
    expect(sessionStorage.length).toBe(0);
  });
  it('does not reserve minutes if pronunciation recording cannot initialize', async () => {
    vi.stubEnv('NEXT_PUBLIC_REALTIME_AUDIO_ASSESSMENT', 'true');
    state.recorder=new Error('audio-recording-unsupported');
    await start();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(container.textContent).toContain('could not record audio');
  });
  it('denied microphone permission does not reserve paid minutes', async () => {
    navigator.mediaDevices.getUserMedia.mockRejectedValue(Object.assign(new Error('denied'), { name: 'NotAllowedError' }));
    await start();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]').textContent).toContain('Microphone access is required');
  });
  it('failed SDP closes media and clears the delayed microphone unmute', async () => {
    fetchMock.mockReset().mockResolvedValueOnce(response({ clientSecret: 'fixture', model: 'fixture', durationSeconds: 300 })).mockResolvedValueOnce(response({}, false));
    await start();
    expect(track.stop).toHaveBeenCalledOnce();
    expect(peers[0].close).toHaveBeenCalledOnce();
    expect(container.querySelector('[role="alert"]').textContent).toContain('Could not connect');
    expect(vi.getTimerCount()).toBe(0);
  });
  it('stops a microphone granted after navigation without minting a session', async () => {
    const pending = deferred(); navigator.mediaDevices.getUserMedia.mockReturnValue(pending.promise);
    await start(); unmount();
    await act(async () => pending.resolve(media));
    expect(track.stop).toHaveBeenCalledOnce();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(peers).toHaveLength(0);
  });
  it('does not open WebRTC after navigating away during minting', async () => {
    const pending = deferred(); fetchMock.mockReset().mockReturnValueOnce(pending.promise);
    await start(); unmount();
    await act(async () => pending.resolve(response({ clientSecret: 'fixture', model: 'fixture', durationSeconds: 300 })));
    expect(track.stop).toHaveBeenCalledOnce();
    expect(peers).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('does not restart the session clock after navigation during SDP negotiation', async () => {
    const pending = deferred();
    fetchMock.mockReset().mockResolvedValueOnce(response({ clientSecret: 'fixture', model: 'fixture', durationSeconds: 300 })).mockReturnValueOnce(pending.promise);
    await start(); unmount();
    await act(async () => pending.resolve(response({})));
    expect(track.stop).toHaveBeenCalledOnce();
    expect(peers[0].close).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('retains an ended transcript after scoring failure and retries the same request without reopening media', async () => {
    await start();
    const transcript = 'I enjoy learning about different places because it helps me understand how people live and work. Last year I visited a small town with my family and we spent several days exploring the local market and speaking with friendly residents about their traditions.';
    await act(async () => peers[0].channel.onmessage({ data: JSON.stringify({ type: 'conversation.item.input_audio_transcription.completed', transcript }) }));
    fetchMock.mockResolvedValueOnce(response({ error: 'Try again' }, false));
    await act(async () => [...container.querySelectorAll('button')].find(b => b.textContent.includes('End interview')).click());
    expect(track.stop).toHaveBeenCalledOnce();
    expect(peers[0].close).toHaveBeenCalledOnce();
    expect(container.textContent).toContain('Your interview is still ready to score');
    const firstScore = JSON.parse(fetchMock.mock.calls[2][1].body);
    expect(firstScore).toMatchObject({ mode: 'part1', transcript: [{ role: 'candidate', text: transcript }] });
    expect(sessionStorage.length).toBe(1);
    fetchMock.mockResolvedValueOnce(response({ overallBand: 7 }));
    await act(async () => [...container.querySelectorAll('button')].find(b => b.textContent.includes('Retry scoring my interview')).click());
    expect(JSON.parse(fetchMock.mock.calls[3][1].body)).toEqual(firstScore);
    expect(sessionStorage.length).toBe(0);
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledOnce();
    const clockIndex = intervalSpy.mock.calls.findIndex(([, delay]) => delay === 1000);
    expect(clearIntervalSpy).toHaveBeenCalledWith(intervalSpy.mock.results[clockIndex].value);
  });

  it('keeps the selected mode when the session clock automatically scores the transcript', async () => {
    fetchMock.mockReset().mockResolvedValueOnce(response({ clientSecret: 'fixture', model: 'fixture', durationSeconds: 1 })).mockResolvedValueOnce(response({})).mockResolvedValue(response({ overallBand: 7 }));
    await start();
    const transcript = Array.from({ length: 45 }, (_, i) => `word${i}`).join(' ');
    await act(async () => peers[0].channel.onmessage({ data: JSON.stringify({ type: 'conversation.item.input_audio_transcription.completed', transcript }) }));
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toMatchObject({ mode: 'part1', transcript: [{ role: 'candidate', text: transcript }] });
    expect(container.textContent).not.toContain('could not be recovered');
  });

  it('does not score an automatically ended interview into a different signed-in account', async () => {
    fetchMock.mockReset().mockResolvedValueOnce(response({ clientSecret: 'fixture', model: 'fixture', durationSeconds: 1 })).mockResolvedValueOnce(response({}));
    await start();
    const transcript = Array.from({ length: 45 }, (_, i) => `word${i}`).join(' ');
    await act(async () => peers[0].channel.onmessage({ data: JSON.stringify({ type: 'conversation.item.input_audio_transcription.completed', transcript }) }));
    state.userId = 'different-fixture';
    await act(async () => root.render(<SpeakingExaminerPage />));
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain('Sign in with the account that completed this interview');
  });

});
