// Web MIDI input. Listens to all connected inputs and fans out note on/off
// events to subscribers. Tracks the set of physically-held MIDI note numbers.

export type MidiListener = {
  onNoteOn?: (midi: number, velocity: number) => void;
  onNoteOff?: (midi: number) => void;
};

const listeners = new Set<MidiListener>();
const heldMidis = new Set<number>();
let initialized = false;
let supported: boolean | null = null;

export function isMidiSupported(): boolean {
  if (supported !== null) return supported;
  supported = typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator;
  return supported;
}

export function getHeldMidis(): Set<number> {
  return new Set(heldMidis);
}

export function addListener(l: MidiListener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export async function initMidi(): Promise<boolean> {
  if (initialized) return true;
  if (!isMidiSupported()) return false;
  try {
    const access = await navigator.requestMIDIAccess({ sysex: false });
    initialized = true;
    attachAllInputs(access);
    access.onstatechange = () => attachAllInputs(access);
    return true;
  } catch {
    return false;
  }
}

function attachAllInputs(access: MIDIAccess): void {
  access.inputs.forEach((input) => {
    input.onmidimessage = handleMessage;
  });
}

function handleMessage(ev: Event): void {
  const data = (ev as MIDIMessageEvent).data;
  if (!data || data.length < 2) return;
  const status = data[0] & 0xf0;
  const note = data[1];
  const velocity = data.length > 2 ? data[2] : 0;
  if (status === 0x90 && velocity > 0) {
    heldMidis.add(note);
    listeners.forEach((l) => l.onNoteOn?.(note, velocity));
  } else if (status === 0x80 || (status === 0x90 && velocity === 0)) {
    heldMidis.delete(note);
    listeners.forEach((l) => l.onNoteOff?.(note));
  }
}
