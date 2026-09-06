/* Candidate microphone only; never connect the examiner's output here. */
class IeltsRecorder extends AudioWorkletProcessor {
  constructor() {
    super();
    this.active = true;
    this.buffer = new Int16Array(24000);
    this.offset = 0;
    this.total = 0;
    this.port.onmessage = event => {
      if (event.data === 'stop') {
        this.active = false;
        this.flush();
        this.port.postMessage({ stopped: true });
      }
    };
  }
  flush() {
    if (!this.offset) return;
    const buffer = this.buffer.slice(0, this.offset);
    this.port.postMessage({ samples: buffer }, [buffer.buffer]);
    this.offset = 0;
  }
  process(inputs) {
    if (!this.active) return true;
    const input = inputs[0]?.[0];
    if (!input) return true;
    for (const value of input) {
      if (this.total >= 840 * 24000) { this.active = false; this.flush(); break; }
      const sample = Math.max(-1, Math.min(1, value));
      this.buffer[this.offset++] = Math.round(sample * (sample < 0 ? 32768 : 32767));
      this.total++;
      if (this.offset === this.buffer.length) this.flush();
    }
    return true;
  }
}
registerProcessor('ielts-recorder', IeltsRecorder);
