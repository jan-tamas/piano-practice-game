import type { PitchClass } from './types';

// C3 = MIDI 48. We display C3..F5 → 30 keys, 18 white + 12 black.
const RANGE_START = 48;        // C3
const RANGE_END_INCL = 77;     // F5

const PC_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const BLACK_PCS = new Set<PitchClass>([1, 3, 6, 8, 10]);

type KeyDef = {
  midi: number;
  pc: PitchClass;
  octave: number;
  isBlack: boolean;
  whiteIndex: number;          // for white: its own index 0..17. for black: index of white key immediately to its left.
  label: string;               // e.g. "C3"
};

export type KeyHighlight = 'correct' | 'wrong' | 'missed';

function buildKeys(): KeyDef[] {
  const keys: KeyDef[] = [];
  let whiteIndex = -1;
  for (let m = RANGE_START; m <= RANGE_END_INCL; m++) {
    const pc = (m % 12) as PitchClass;
    const octave = Math.floor(m / 12) - 1;
    const isBlack = BLACK_PCS.has(pc);
    if (!isBlack) whiteIndex++;
    keys.push({
      midi: m,
      pc,
      octave,
      isBlack,
      whiteIndex,
      label: `${PC_NAMES[pc]}${octave}`,
    });
  }
  return keys;
}

export class Piano {
  private host: HTMLElement;
  private keys: KeyDef[];
  private keyEls: HTMLButtonElement[] = [];
  private selected = new Set<number>();   // midi numbers
  private highlights = new Map<number, KeyHighlight>();
  private interactive = true;
  private onChange: (selectedPcs: Set<PitchClass>) => void;

  constructor(host: HTMLElement, onChange: (selectedPcs: Set<PitchClass>) => void) {
    this.host = host;
    this.onChange = onChange;
    this.keys = buildKeys();
    this.render();
  }

  private render(): void {
    this.host.innerHTML = '';
    const root = document.createElement('div');
    root.className = 'piano';

    const whiteCount = this.keys.filter((k) => !k.isBlack).length;
    root.style.setProperty('--white-count', String(whiteCount));

    const whiteRow = document.createElement('div');
    whiteRow.className = 'piano-white-row';
    root.appendChild(whiteRow);

    const blackLayer = document.createElement('div');
    blackLayer.className = 'piano-black-layer';
    root.appendChild(blackLayer);

    this.keyEls = [];

    for (const k of this.keys) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `piano-key ${k.isBlack ? 'black' : 'white'}`;
      btn.dataset.midi = String(k.midi);
      btn.setAttribute('aria-label', k.label);
      btn.addEventListener('click', () => this.handleClick(k.midi));
      this.keyEls[k.midi] = btn;

      if (k.isBlack) {
        // Position centered on the boundary between whiteIndex and whiteIndex+1.
        // We place its center at (whiteIndex + 1) / whiteCount of the row width.
        btn.style.left = `calc(${(k.whiteIndex + 1)} * (100% / var(--white-count)) - var(--black-half-width))`;
        blackLayer.appendChild(btn);
      } else {
        whiteRow.appendChild(btn);
      }
    }

    this.host.appendChild(root);
    this.applyVisuals();
  }

  private handleClick(midi: number): void {
    if (!this.interactive) return;
    if (this.selected.has(midi)) {
      this.selected.delete(midi);
    } else {
      this.selected.add(midi);
    }
    this.applyVisuals();
    this.onChange(this.selectedPcs());
  }

  selectedPcs(): Set<PitchClass> {
    const set = new Set<PitchClass>();
    for (const m of this.selected) {
      set.add((m % 12) as PitchClass);
    }
    return set;
  }

  selectedMidis(): Set<number> {
    return new Set(this.selected);
  }

  clear(): void {
    this.selected.clear();
    this.highlights.clear();
    this.applyVisuals();
  }

  setInteractive(on: boolean): void {
    this.interactive = on;
    this.applyVisuals();
  }

  showFeedback(scalePcs: Set<PitchClass>): void {
    // Clear highlights.
    this.highlights.clear();
    const markedPcs = this.selectedPcs();

    for (const k of this.keys) {
      const inScale = scalePcs.has(k.pc);
      const userMarkedAny = markedPcs.has(k.pc);
      const userMarkedThis = this.selected.has(k.midi);

      if (inScale && userMarkedAny) {
        this.highlights.set(k.midi, 'correct');
      } else if (inScale && !userMarkedAny) {
        this.highlights.set(k.midi, 'missed');
      } else if (!inScale && userMarkedThis) {
        this.highlights.set(k.midi, 'wrong');
      }
    }
    this.applyVisuals();
  }

  private applyVisuals(): void {
    for (const k of this.keys) {
      const el = this.keyEls[k.midi];
      if (!el) continue;
      el.classList.toggle('selected', this.selected.has(k.midi));
      el.classList.remove('correct', 'wrong', 'missed');
      const h = this.highlights.get(k.midi);
      if (h) el.classList.add(h);
      el.disabled = !this.interactive;
    }
  }
}
