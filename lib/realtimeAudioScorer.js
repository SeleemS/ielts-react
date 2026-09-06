import WebSocket from 'ws';
import { AUDIO_ASSESSMENT_MODEL, audioAssessmentPrompt, parseAudioAssessment, readAssessmentWav } from './speakingAudioAssessment';

export async function loadAssessmentAudio({ userId, requestId, count, maxSeconds, fetchFn = fetch }) {
  const parts = [];
  let durationSeconds = 0;
  for (let index = 0; index < count; index += 1) {
    const path = `${userId}/${requestId}/audio-${index}.wav`;
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const response = await fetchFn(`${url}/storage/v1/object/speaking-uploads/${path}`, {
      headers: { Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` },
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error('recording-unavailable');
    const limit = Math.min(420, maxSeconds - durationSeconds) * 48000 + 44;
    if (Number(response.headers.get('content-length')) > limit) {
      await response.body?.cancel();
      throw new Error('recording-too-large');
    }
    const reader = response.body.getReader();
    const chunks = [];
    let bytes = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.length;
        if (bytes > limit) throw new Error('recording-too-large');
        chunks.push(Buffer.from(value));
      }
    } finally { await reader.cancel(); }
    const wav = readAssessmentWav(Buffer.concat(chunks), maxSeconds - durationSeconds);
    parts.push(wav.pcm);
    durationSeconds += wav.durationSeconds;
  }
  if (durationSeconds < 30) throw new Error('recording-too-short');
  return { parts, durationSeconds };
}

// A short-lived server WebSocket replays candidate-only audio after the call.
// No browser-provided grades, arbitrary URLs, or provider keys are trusted.
export function scoreRecordedInterview({ parts, durationSeconds, mode, transcript, WebSocketClass = WebSocket, timeoutMs = 60000, onResponse = async () => {} }) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocketClass(`wss://api.openai.com/v1/realtime?model=${AUDIO_ASSESSMENT_MODEL}`, {
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      maxPayload: 1024 * 1024,
      handshakeTimeout: 15000,
    });
    let finished = false;
    let sent = false;
    const timer = setTimeout(() => finish(new Error('audio-assessment-timeout')), timeoutMs);
    function finish(error, value) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      ws.close();
      if (error) reject(error); else resolve(value);
    }
    const send = event => new Promise((done, fail) => ws.send(JSON.stringify(event), error => error ? fail(error) : done()));
    ws.on('error', () => finish(new Error('audio-assessment-connection')));
    ws.on('close', () => { if (!finished) finish(new Error('audio-assessment-disconnected')); });
    ws.on('open', () => {
      send({ type: 'session.update', session: {
        type: 'realtime', model: AUDIO_ASSESSMENT_MODEL, output_modalities: ['text'],
        reasoning: { effort: 'low' }, max_output_tokens: 4000,
        instructions: audioAssessmentPrompt(mode, durationSeconds),
        audio: { input: { format: { type: 'audio/pcm', rate: 24000 }, turn_detection: null } },
      } }).catch(finish);
    });
    ws.on('message', async data => {
      if (finished) return;
      try {
        const event = JSON.parse(data.toString());
        if (event.type === 'error') return finish(new Error(`audio-assessment-provider-error:${event.error?.code || 'unknown'}:${event.error?.param || 'unknown'}`));
        if (event.type === 'session.updated' && !sent) {
          sent = true;
          await send({ type: 'conversation.item.create', item: { type: 'message', role: 'user', content: [{
            type: 'input_text', text: `Context only; assess the audio that follows.\n${transcript}`,
          }] } });
          for (const part of parts) {
            for (let offset = 0; offset < part.length; offset += 48000) {
              if (finished) return;
              await send({ type: 'input_audio_buffer.append', audio: part.subarray(offset, offset + 48000).toString('base64') });
            }
          }
          await send({ type: 'input_audio_buffer.commit' });
          await send({ type: 'response.create', response: { output_modalities: ['text'] } });
        }
        if (event.type === 'response.done') {
          await onResponse(event.response);
          if (event.response?.status !== 'completed') return finish(new Error('audio-assessment-incomplete'));
          const text = (event.response.output || []).flatMap(item => item.content || [])
            .filter(c => c.type === 'text' || c.type === 'output_text').map(c => c.text || '').join('');
          const result = parseAudioAssessment(text, durationSeconds);
          finish(null, { result, response: event.response });
        }
      } catch (error) { finish(new Error(`audio-assessment-failed:${error.message?.startsWith('invalid-') ? error.message : 'invalid-output'}`)); }
    });
  });
}
