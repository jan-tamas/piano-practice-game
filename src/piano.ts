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
  whiteIndex: number;
  label: string;
  backShape: 'L' | 'T' | 'J' | 'full';
};

export type KeyHighlight = 'correct' | 'wrong' | 'missed';

// 'toggle' — clicks and MIDI note-on toggle membership; note-off does nothing.
//            Used for scales (you can't physically hold 7 keys at once).
// 'held'  — selection follows the currently-pressed set: note-on adds, note-off
//            removes. Clicks still toggle (no release event for a click).
//            Used for chords so "no extra keys" is meaningful.
export type SelectionMode = 'toggle' | 'held';

function buildKeys(): KeyDef[] {
  const keys: KeyDef[] = [];
  let whiteIndex = -1;
  for (let m = RANGE_START; m <= RANGE_END_INCL; m++) {
    const pc = (m % 12) as PitchClass;
    const octave = Math.floor(m / 12) - 1;
    const isBlack = BLACK_PCS.has(pc);
    if (!isBlack) whiteIndex++;
    // Determine white key shape at back based on chromatic position within octave
    let backShape: 'L' | 'T' | 'J' | 'full' = 'full';
    if (!isBlack) {
      // White key: C=0, D=2, E=4, F=5, G=7, A=9, B=11
      if (pc === 0 || pc === 5) backShape = 'L';      // C, F - stem on left
      else if (pc === 2 || pc === 7 || pc === 9) backShape = 'T'; // D, G, A - stem center
      else if (pc === 4 || pc === 11) backShape = 'J'; // E, B - stem on right
      // E-F and B-C boundaries: E=4, F=5 and B=11, C=0 are adjacent, handled by shape
    } else {
      backShape = 'full'; // Black keys are full-height rectangles
    }
    keys.push({
      midi: m,
      pc,
      octave,
      isBlack,
      whiteIndex,
      label: `${PC_NAMES[pc]}${octave}`,
      backShape,
    });
  }
  return keys;
}

export class Piano {
  private host: HTMLElement;
  private keys: KeyDef[];
  private keyEls: HTMLButtonElement[] = [];
  private selected = new Set<number>();
  private highlights = new Map<number, KeyHighlight>();
  private interactive = true;
  private selectionMode: SelectionMode;
  private onChange: (selectedPcs: Set<PitchClass>) => void;

  constructor(
    host: HTMLElement,
    onChange: (selectedPcs: Set<PitchClass>) => void,
    selectionMode: SelectionMode = 'toggle',
    initialSelected: Iterable<number> = [],
  ) {
    this.host = host;
    this.onChange = onChange;
    this.selectionMode = selectionMode;
    for (const m of initialSelected) {
      if (m >= RANGE_START && m <= RANGE_END_INCL) this.selected.add(m);
    }
    this.keys = buildKeys();
    this.render();
  }

  private render(): void {
    this.host.innerHTML = '';
    const root = document.createElement('div');
    root.className = 'piano';

    const whiteCount = this.keys.filter((k) => !k.isBlack).length;
    root.style.setProperty('--white-count', String(whiteCount));

    const keyRow = document.createElement('div');
    keyRow.className = 'piano-key-row';
    root.appendChild(keyRow);

    this.keyEls = [];

    // Build an array of all keys in chromatic order with computed positions
    const keysInChromaticOrder = this.keys.sort((a, b) => a.midi - b.midi);

    // Precompute white key front width (100% / whiteCount)
    const whiteKeyFrontWidthPct = 100 / whiteCount;
    // Black key width = 64% of white key front width (0.64)
    const blackKeyWidthPct = whiteKeyFrontWidthPct * 0.64;
    // At the back, we have 12 equal columns per octave
    const backColWidthPct = (whiteKeyFrontWidthPct * 7) / 12;

    for (const k of keysInChromaticOrder) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `piano-key ${k.isBlack ? 'black' : 'white'}`;
      btn.dataset.midi = String(k.midi);
      btn.dataset.testid = `piano-key-${k.label}`;
      btn.setAttribute('aria-label', k.label);
      btn.addEventListener('click', () => this.handleClick(k.midi));
      this.keyEls[k.midi] = btn;

      // Calculate position and shape
      const whiteIndex = k.whiteIndex;
      const whiteFrontX = whiteIndex * whiteKeyFrontWidthPct;

      if (k.isBlack) {
        // Black key: centered between adjacent white keys
        // Position: left edge at whiteFrontX + (whiteKeyFrontWidthPct - blackKeyWidthPct) / 2
        const leftPos = whiteFrontX + (whiteKeyFrontWidthPct - blackKeyWidthPct) / 2;
        btn.style.left = `${leftPos}%`;
        btn.style.width = `${blackKeyWidthPct}%`;
        btn.style.height = '62%';
        btn.style.position = 'absolute';
        keyRow.appendChild(btn);
      } else {
        // White key: positioned at front, shape depends on backShape
        btn.style.left = `${whiteFrontX}%`;
        btn.style.width = `${whiteKeyFrontWidthPct}%`;
        btn.style.height = '100%';
        btn.style.position = 'relative';
        
        // Create SVG for the key shape
        const svg = this.createWhiteKeyShapeSVG(k, whiteKeyFrontWidthPct, blackKeyWidthPct, backColWidthPct);
        btn.appendChild(svg);
        keyRow.appendChild(btn);
      }
    }

    this.host.appendChild(root);
    this.applyVisuals();
  }

  /**
   * Create SVG path for white key shape based on backShape.
   * The key is rendered as a path with:
   * - Front edge: full width at y=0 (top)
   * - Back edge: shaped according to backShape, with uniform column width at y=100% (bottom)
   * 
   * Coordinate system: (0,0) = top-left of key, (100,100) = bottom-right of key
   * All dimensions are in percent relative to the white key's front width.
   * 
   * Back column width (for stems and black keys) = (7 × white_key_full_width) / 12
   * This ensures uniform key widths at the back.
   */
  private createWhiteKeyShapeSVG(
    k: KeyDef,
    whiteKeyFrontWidthPct: number,
    _blackKeyWidthPct: number,
    backColWidthPct: number
  ): SVGElement {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.style.width = '100%';
    svg.style.height = '100%';

    // Back column width in SVG units (100 units = 100% of white key front width)
    const backColWidthUnits = (backColWidthPct / whiteKeyFrontWidthPct) * 100;

    // Determine back edge coordinates
    let backPath: string;
    const xCenter = 50; // Center of white key (50% of its width)
    const stemMargin = (backColWidthUnits / 2) + 1; // Slight margin for visual clarity

    switch (k.backShape) {
      case 'L': // C, F - stem on LEFT at back
        // Left side: stem extends to back, right side cuts in
        // Back edge: stem from left to x=(100 - backColWidthUnits)
        backPath = `M 0 0 L 100 0 L 100 100 L ${100 - backColWidthUnits} 100 L ${100 - backColWidthUnits} ${50 - stemMargin} L 0 ${50 - stemMargin} Z`;
        break;
      case 'T': // D, G, A - stem near CENTER at back
        // Center stem extends to back
        backPath = `M 0 0 L 100 0 L 100 100 L ${xCenter + backColWidthUnits/2} 100 L ${xCenter + backColWidthUnits/2} ${50 - stemMargin} L ${xCenter - backColWidthUnits/2} ${50 - stemMargin} L ${xCenter - backColWidthUnits/2} 100 L 0 100 Z`;
        break;
      case 'J': // E, B - stem on RIGHT at back
        // Right side: stem extends to back, left side cuts in
        // Back edge: stem from x=backColWidthUnits to right edge
        backPath = `M 0 0 L 100 0 L 100 ${50 - stemMargin} L ${backColWidthUnits} ${50 - stemMargin} L ${backColWidthUnits} 100 L 0 100 Z`;
        break;
      default: // full - shouldn't happen for white keys
        backPath = 'M 0 0 L 100 0 L 100 100 L 0 100 Z';
    }

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', backPath);
    path.setAttribute('fill', 'var(--white-key)');
    path.setAttribute('stroke', 'var(--white-key-edge)');
    path.setAttribute('stroke-width', '1');

    svg.appendChild(path);
    return svg;
  }

  private handleClick(midi: number): void {
    if (!this.interactive) return;
    if (this.selected.has(midi)) this.selected.delete(midi);
    else this.selected.add(midi);
    this.applyVisuals();
    this.onChange(this.selectedPcs());
  }

  // Called by external MIDI plumbing.
  noteOn(midi: number): void {
    if (!this.interactive) return;
    if (midi < RANGE_START || midi > RANGE_END_INCL) return;
    if (this.selectionMode === 'held') {
      if (this.selected.has(midi)) return;
      this.selected.add(midi);
    } else {
      // toggle
      if (this.selected.has(midi)) this.selected.delete(midi);
      else this.selected.add(midi);
    }
    this.applyVisuals();
    this.onChange(this.selectedPcs());
  }

  noteOff(midi: number): void {
    if (this.selectionMode !== 'held') return;
    if (!this.selected.has(midi)) return;
    this.selected.delete(midi);
    this.applyVisuals();
    this.onChange(this.selectedPcs());
  }

  selectedPcs(): Set<PitchClass> {
    const set = new Set<PitchClass>();
    for (const m of this.selected) set.add((m % 12) as PitchClass);
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
