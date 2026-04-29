import type { Difficulty, PitchClass, Scale, ScaleType } from './types';

export const SCALE_PATTERNS: Record<ScaleType, number[]> = {
  major:           [0, 2, 4, 5, 7, 9, 11],
  naturalMinor:    [0, 2, 3, 5, 7, 8, 10],
  harmonicMinor:   [0, 2, 3, 5, 7, 8, 11],
  melodicMinor:    [0, 2, 3, 5, 7, 9, 11],
  majorPentatonic: [0, 2, 4, 7, 9],
  minorPentatonic: [0, 3, 5, 7, 10],
  blues:           [0, 3, 5, 6, 7, 10],
  dorian:          [0, 2, 3, 5, 7, 9, 10],
  phrygian:        [0, 1, 3, 5, 7, 8, 10],
  lydian:          [0, 2, 4, 6, 7, 9, 11],
  mixolydian:      [0, 2, 4, 5, 7, 9, 10],
  locrian:         [0, 1, 3, 5, 6, 8, 10],
  wholeTone:       [0, 2, 4, 6, 8, 10],
  diminished:      [0, 2, 3, 5, 6, 8, 9, 11],
};

export const SCALE_TYPE_LABEL: Record<ScaleType, string> = {
  major: 'Major',
  naturalMinor: 'Minor',
  harmonicMinor: 'Harmonic Minor',
  melodicMinor: 'Melodic Minor',
  majorPentatonic: 'Major Pentatonic',
  minorPentatonic: 'Minor Pentatonic',
  blues: 'Blues',
  dorian: 'Dorian',
  phrygian: 'Phrygian',
  lydian: 'Lydian',
  mixolydian: 'Mixolydian',
  locrian: 'Locrian',
  wholeTone: 'Whole Tone',
  diminished: 'Diminished',
};

const TIER_TYPES: Record<Difficulty, ScaleType[]> = {
  easy: ['major', 'naturalMinor'],
  medium: [
    'major', 'naturalMinor',
    'harmonicMinor', 'melodicMinor',
    'majorPentatonic', 'minorPentatonic',
  ],
  hard: [
    'major', 'naturalMinor',
    'harmonicMinor', 'melodicMinor',
    'majorPentatonic', 'minorPentatonic',
    'blues', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'locrian',
    'wholeTone', 'diminished',
  ],
};

// Conventional root spelling per (rootPc, parentMode). "parent" indicates
// whether the scale is best spelled like its parallel major (sharp/flat
// preference of major) or its parallel minor.
type Parent = 'major' | 'minor';

// Major-key spellings: pick the simpler key signature for each pitch class.
// (e.g. F# major = 6 sharps; Gb major = 6 flats — convention favors F# when
// equal, but for the rest we follow the standard circle of fifths choice.)
const MAJOR_ROOT_NAME: Record<PitchClass, string> = {
  0:  'C',
  1:  'Db',
  2:  'D',
  3:  'Eb',
  4:  'E',
  5:  'F',
  6:  'F#',
  7:  'G',
  8:  'Ab',
  9:  'A',
  10: 'Bb',
  11: 'B',
};

// Minor-key spellings.
const MINOR_ROOT_NAME: Record<PitchClass, string> = {
  0:  'C',
  1:  'C#',
  2:  'D',
  3:  'Eb',
  4:  'E',
  5:  'F',
  6:  'F#',
  7:  'G',
  8:  'G#',
  9:  'A',
  10: 'Bb',
  11: 'B',
};

// Which "parent" each scale type uses for its root spelling.
const SCALE_PARENT: Record<ScaleType, Parent> = {
  major: 'major',
  naturalMinor: 'minor',
  harmonicMinor: 'minor',
  melodicMinor: 'minor',
  majorPentatonic: 'major',
  minorPentatonic: 'minor',
  blues: 'minor',
  dorian: 'minor',        // dorian is a minor mode
  phrygian: 'minor',
  lydian: 'major',
  mixolydian: 'major',
  locrian: 'minor',
  wholeTone: 'major',
  diminished: 'minor',
};

export function rootName(pc: PitchClass, type: ScaleType): string {
  const parent = SCALE_PARENT[type];
  const table = parent === 'major' ? MAJOR_ROOT_NAME : MINOR_ROOT_NAME;
  return table[pc];
}

export function buildScale(rootPc: PitchClass, type: ScaleType): Scale {
  const pattern = SCALE_PATTERNS[type];
  const pcs = pattern.map((iv) => ((rootPc + iv) % 12) as PitchClass).sort((a, b) => a - b);
  const id = `${rootName(rootPc, type).replace('#', 's').replace('b', 'f')}_${type}`;
  const displayName = `${rootName(rootPc, type)} ${SCALE_TYPE_LABEL[type]}`;
  return {
    id,
    rootPc,
    type,
    displayName,
    pitchClasses: pcs,
  };
}

export function scalesForTier(tier: Difficulty): Scale[] {
  const types = TIER_TYPES[tier];
  const scales: Scale[] = [];
  for (const type of types) {
    for (let pc = 0; pc < 12; pc++) {
      scales.push(buildScale(pc as PitchClass, type));
    }
  }
  return scales;
}

export function getScaleById(id: string, tier: Difficulty): Scale | undefined {
  return scalesForTier(tier).find((s) => s.id === id);
}

export function pitchClassesEqual(a: PitchClass[], b: PitchClass[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort((x, y) => x - y);
  const sb = [...b].sort((x, y) => x - y);
  return sa.every((v, i) => v === sb[i]);
}
