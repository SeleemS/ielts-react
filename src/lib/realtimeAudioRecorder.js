export function wavBlob(samples) {
  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  const text = (offset, value) => [...value].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  text(0, 'RIFF'); view.setUint32(4, 36 + samples.byteLength, true); text(8, 'WAVEfmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, 24000, true); view.setUint32(28, 48000, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); text(36, 'data');
  view.setUint32(40, samples.byteLength, true);
  return new Blob([header, samples], { type: 'audio/wav' });
}

export async function createRealtimeAudioRecorder(stream) {
  const Context = window.AudioContext || window.webkitAudioContext;
  if (!Context || typeof AudioWorkletNode === 'undefined') throw new Error('audio-recording-unsupported');
  const context = new Context({ sampleRate: 24000 });
  let source, node;
  const chunks = [];
  let closed = false;
  const dispose = () => {
    if (closed) return;
    closed = true;
    source?.disconnect(); node?.disconnect();
    void context.close().catch(() => {});
  };
  try {
    if (context.sampleRate !== 24000) throw new Error('audio-recording-sample-rate');
    await context.audioWorklet.addModule('/audio/ielts-recorder.js');
    await context.resume();
    source = context.createMediaStreamSource(stream);
    node = new AudioWorkletNode(context, 'ielts-recorder');
    // Processor produces silence; this keeps capture running without mic feedback.
    node.connect(context.destination);
    node.port.onmessage = e => { if (e.data.samples) chunks.push(e.data.samples); };
    return {
      start() { source.connect(node); },
      dispose,
      async stop() {
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => { dispose(); reject(new Error('audio-recording-flush')); }, 3000);
          node.port.onmessage = e => {
            if (e.data.samples) chunks.push(e.data.samples);
            if (e.data.stopped) { clearTimeout(timeout); resolve(); }
          };
          node.port.postMessage('stop');
        });
        dispose();
        const total = chunks.reduce((n, c) => n + c.length, 0);
        const samples = new Int16Array(total);
        let offset = 0;
        for (const chunk of chunks) { samples.set(chunk, offset); offset += chunk.length; }
        chunks.length = 0;
        const blobs = [];
        for (let i = 0; i < total; i += 420 * 24000) blobs.push(wavBlob(samples.subarray(i, i + 420 * 24000)));
        return blobs;
      },
    };
  } catch (error) { dispose(); throw error; }
}

export async function uploadRealtimeAudio(client, pending) {
  const bucket = client.storage.from('speaking-uploads');
  pending.uploadedParts ||= [];
  for (let i = 0; i < pending.audioBlobs.length; i++) {
    if (pending.uploadedParts.includes(i)) continue;
    const path = `${pending.userId}/${pending.requestId}/audio-${i}.wav`;
    const { error } = await bucket.upload(path, pending.audioBlobs[i], { contentType: 'audio/wav', upsert: false });
    // Immutable object names; a lost successful upload response can be retried.
    const duplicate = error && (String(error.statusCode) === '409'
      || (String(error.statusCode) === '400' && /already exists|duplicate/i.test(error.message || '')));
    if (error && !duplicate) throw error;
    pending.uploadedParts.push(i);
  }
  return pending.audioBlobs.length;
}
