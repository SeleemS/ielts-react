import { it, expect } from 'vitest';
import { loadEnvConfig } from '@next/env';
import { scoreRecordedInterview } from '../lib/realtimeAudioScorer';
import { readFileSync, writeFileSync } from 'node:fs';

function loadLiveEnv() {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'development';
  loadEnvConfig(process.cwd(), true, { info() {}, error() {} }, true);
  process.env.NODE_ENV = previous;
  if (!process.env.OPENAI_API_KEY) throw new Error('live-key-not-configured');
}

// Explicit opt-in paid transport check, synthetic silence only. Does NOT
// establish pronunciation accuracy or exercise a physical microphone.
it.skipIf(process.env.RUN_LIVE_AUDIO_SMOKE !== '1')('Realtime 2.1 refuses to grade synthetic silence', async () => {
  loadLiveEnv();
  const { result, response } = await scoreRecordedInterview({
    parts: [Buffer.alloc(32 * 48000)], durationSeconds: 32, mode: 'part1',
    transcript: 'No candidate transcript. The recording contains silence.',
  });
  console.log(JSON.stringify({ model: result.model, assessmentStatus: result.assessmentStatus, overallBand: result.overallBand, usage: response.usage }));
  expect(result.overallBand).toBeNull();
  expect(result.criteria.pronunciation.band).toBeNull();
}, 90000);

it.skipIf(process.env.RUN_LIVE_AUDIO_SMOKE !== '1' || !process.env.SPEAKING_SMOKE_WAV)('Realtime 2.1 assesses synthetic speech on four criteria', async () => {
  const file = process.env.SPEAKING_SMOKE_WAV;
  loadLiveEnv();
  const wav = readFileSync(file);
  let pcm;
  for (let offset = 12; offset + 8 < wav.length;) {
    const size = wav.readUInt32LE(offset + 4);
    if (wav.toString('ascii', offset, offset + 4) === 'data') { pcm = wav.subarray(offset + 8, offset + 8 + size); break; }
    offset += 8 + size + (size % 2);
  }
  if (!pcm || pcm.length > 90 * 48000) throw new Error('fixture-missing-or-too-long');
  const { result, response } = await scoreRecordedInterview({ parts: [pcm], durationSeconds: pcm.length / 48000,
    mode: 'part1', transcript: 'EXAMINER: What do you like about your hometown, and what would you change? The candidate answer is in the audio.' });
  writeFileSync('/tmp/ielts-speaking-synthetic-result.json', JSON.stringify({ result, usage: response.usage }, null, 2));
  expect(result.assessmentStatus).toBe('estimated');
  expect(result.criteria.pronunciation.band).toBeTypeOf('number');
  expect(result.audioEvidence.length).toBeGreaterThan(0);
}, 90000);
