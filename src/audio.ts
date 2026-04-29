let ctx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!ctx) {
    ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  }
  if (ctx.state === 'suspended') {
    void ctx.resume();
  }
  return ctx;
}

export function playBell(): void {
  const c = getCtx();
  const now = c.currentTime;
  const partials: Array<{ freq: number; gain: number }> = [
    { freq: 880, gain: 0.25 },
    { freq: 1320, gain: 0.18 },
    { freq: 1760, gain: 0.08 },
  ];
  for (const p of partials) {
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = 'sine';
    osc.frequency.value = p.freq;
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(p.gain, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);
    osc.connect(g).connect(c.destination);
    osc.start(now);
    osc.stop(now + 0.75);
  }
}

export function playChord(midis: Iterable<number>): void {
  const notes = [...midis];
  if (notes.length === 0) return;
  const c = getCtx();
  const now = c.currentTime;
  const dur = 1.1;
  // Per-voice gain scales down with chord size so summed amplitude stays sane.
  const voiceGain = Math.min(0.22, 0.55 / Math.sqrt(notes.length));
  for (const midi of notes) {
    const freq = 440 * Math.pow(2, (midi - 69) / 12);
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(voiceGain, now + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(g).connect(c.destination);
    osc.start(now);
    osc.stop(now + dur + 0.05);
  }
}

export function playBuzzer(): void {
  const c = getCtx();
  const now = c.currentTime;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = 'square';
  osc.frequency.setValueAtTime(180, now);
  osc.frequency.linearRampToValueAtTime(120, now + 0.4);
  g.gain.setValueAtTime(0, now);
  g.gain.linearRampToValueAtTime(0.18, now + 0.02);
  g.gain.linearRampToValueAtTime(0.0001, now + 0.4);
  osc.connect(g).connect(c.destination);
  osc.start(now);
  osc.stop(now + 0.45);
}
