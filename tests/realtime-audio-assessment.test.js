import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { issueAssessmentTicket, verifyAssessmentTicket } from '../lib/realtimeAssessmentTicket';
import { normalizeAudioAssessment, parseAudioAssessment, readAssessmentWav } from '../lib/speakingAudioAssessment';
import { wavBlob } from '../src/lib/realtimeAudioRecorder';
import { scoreRecordedInterview, loadAssessmentAudio } from '../lib/realtimeAudioScorer';
import { realtimeUsageRow, estimateSpeakingCost } from '../lib/realtimeCost';

const validResult = () => ({ criteria: Object.fromEntries(['fluencyCoherence', 'lexicalResource', 'grammaticalRange', 'pronunciation']
  .map((key, i) => [key, { band: [7, 6, 6, 5][i], strengths: ['Clear evidence.'], improvements: ['Practise stress.'] }])),
  summary: 'A practice estimate.', improvements: ['Develop answers.', 'Practise linking.', 'Practise stress.'],
  audioEvidence: [{ startSeconds: 1, endSeconds: 3, observation: 'Stress falls on the final syllable.' }], limitations: ['Part 1 only.'], confidence: 'medium' });

describe('recorded speaking assessment trust boundaries', () => {
  it('binds paid tickets to account, mode, request, duration and expiry', () => {
    vi.stubEnv('REALTIME_ASSESSMENT_SECRET', 'x'.repeat(40));
    const issued = issueAssessmentTicket({ userId: 'u', mode: 'mock', durationSeconds: 840 }, 1000);
    const identity = { userId: 'u', mode: 'mock', requestId: issued.requestId };
    expect(verifyAssessmentTicket(issued.ticket, identity, 1001)?.durationSeconds).toBe(840);
    expect(verifyAssessmentTicket(issued.ticket, { ...identity, userId: 'other' }, 1001)).toBeNull();
    expect(verifyAssessmentTicket(issued.ticket, { ...identity, mode: 'part1' }, 1001)).toBeNull();
    expect(verifyAssessmentTicket(issued.ticket, { ...identity, requestId: 'other' }, 1001)).toBeNull();
    expect(verifyAssessmentTicket(issued.ticket + 'x', identity, 1001)).toBeNull();
    expect(verifyAssessmentTicket(issued.ticket, identity, 86401001)).toBeNull();
    vi.unstubAllEnvs();
  });
  it('calculates the four-criterion mean on the server and withholds unsupported overall scores', () => {
    expect(normalizeAudioAssessment(validResult(), 30).overallBand).toBe(6);
    const missing = validResult(); missing.criteria.pronunciation.band = null; missing.audioEvidence = [];
    expect(normalizeAudioAssessment(missing, 30)).toMatchObject({ overallBand: null, assessmentStatus: 'insufficient_evidence' });
  });
  it('accepts complete JSON wrappers and empty strengths only for unassessed criteria', () => {
    const missing=validResult(); missing.criteria.pronunciation={band:null,strengths:[],improvements:['Record clear speech.']};missing.audioEvidence=[];
    expect(parseAudioAssessment('('+JSON.stringify(missing)+')',30).overallBand).toBeNull();
    expect(()=>parseAudioAssessment(JSON.stringify(missing)+' trailing text',30)).toThrow();
    missing.criteria.pronunciation.band=7;
    expect(()=>parseAudioAssessment(JSON.stringify(missing),30)).toThrow();
  });
  it('rejects invented timestamp ranges, missing evidence and invalid bands', () => {
    const missing = validResult(); missing.audioEvidence = [];
    expect(() => normalizeAudioAssessment(missing, 30)).toThrow();
    const range = validResult(); range.audioEvidence[0].endSeconds = 50;
    expect(() => normalizeAudioAssessment(range, 30)).toThrow();
    const band = validResult(); band.criteria.pronunciation.band = 6.7;
    expect(() => normalizeAudioAssessment(band, 30)).toThrow();
  });
  it('accepts recorder WAV bytes but rejects tampering and duration overruns', async () => {
    const bytes = Buffer.from(await wavBlob(new Int16Array(24000)).arrayBuffer());
    expect(readAssessmentWav(bytes, 1).durationSeconds).toBe(1);
    expect(() => readAssessmentWav(bytes, 0.5)).toThrow();
    bytes.writeUInt32LE(48000, 24);
    expect(() => readAssessmentWav(bytes, 2)).toThrow();
  });
  it('bounds streamed downloads even when content-length is absent', async () => {
    const response = new Response(new Uint8Array(48000 * 2));
    await expect(loadAssessmentAudio({userId:'u', requestId:'r', count:1, maxSeconds:1, fetchFn:async()=>response})).rejects.toThrow('recording-too-large');
  });
  it('prices audio and text independently, including cached modality tokens', () => {
    const response = {id:'r', usage:{input_tokens:1000, output_tokens:100, input_token_details:{audio_tokens:800,text_tokens:200,cached_tokens:100,cached_tokens_details:{audio_tokens:80,text_tokens:20}},output_token_details:{audio_tokens:0,text_tokens:100}}};
    expect(realtimeUsageRow({userId:'u',response,durationSeconds:60,mode:'part1'}).cost_usd).toBeCloseTo(0.0262);
    delete response.usage.input_token_details;
    expect(realtimeUsageRow({userId:'u',response,durationSeconds:60}).cost_usd).toBeNull();
    expect(estimateSpeakingCost({minutes:14}).total).toBeCloseTo(0.99928);
  });
  it('waits for configuration, uploads PCM, requests text once and closes the socket', async () => {
    let socket;
    class Fake extends EventEmitter {
      constructor() { super(); socket=this; this.events=[]; queueMicrotask(()=>this.emit('open')); }
      close=vi.fn();
      send(raw, callback) {
        const e=JSON.parse(raw); this.events.push(e); callback();
        if(e.type==='session.update') queueMicrotask(()=>this.emit('message',JSON.stringify({type:'session.updated'})));
        if(e.type==='response.create') queueMicrotask(()=>this.emit('message',JSON.stringify({type:'response.done',response:{status:'completed',output:[{content:[{type:'text',text:JSON.stringify(validResult())}]}]}})));
      }
    }
    const scored = await scoreRecordedInterview({parts:[Buffer.alloc(96000)],durationSeconds:30,mode:'part1',transcript:'context',WebSocketClass:Fake});
    expect(scored.result.overallBand).toBe(6);
    expect(socket.events.filter(e=>e.type==='response.create')).toHaveLength(1);
    expect(socket.events.filter(e=>e.type==='input_audio_buffer.append')).toHaveLength(2);
    expect(socket.close).toHaveBeenCalledOnce();
  });
  it('does not leave a socket alive on provider error or timeout', async () => {
    let socket;
    class Fake extends EventEmitter { constructor(){super();socket=this;} close=vi.fn(); }
    const promise=scoreRecordedInterview({parts:[],durationSeconds:30,mode:'part1',transcript:'',WebSocketClass:Fake,timeoutMs:10});
    await expect(promise).rejects.toThrow('timeout'); expect(socket.close).toHaveBeenCalledOnce();
  });
});
