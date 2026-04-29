import type { Chord, ChordType, Difficulty, PitchClass } from './types';

export const CHORD_PATTERNS: Record<ChordType, number[]> = {
  majorTriad: [0, 4, 7],
  minorTriad: [0, 3, 7],
  maj7:       [0, 4, 7, 11],
  min7:       [0, 3, 7, 10],
  dom7:       [0, 4, 7, 10],
  diminished: [0, 3, 6],
  augmented:  [0, 4, 8],
  sus2:       [0, 2, 7],
  sus4:       [0, 5, 7],
  min7b5:     [0, 3, 6, 10],
  dim7:       [0, 3, 6, 9],
  dom9:       [0, 2, 4, 7, 10],
  maj9:       [0, 2, 4, 7, 11],
  min9:       [0, 2, 3, 7, 10],
  // dom11 includes the 3rd for theoretical completeness, even though jazz
  // voicings often omit it.
  dom11:      [0, 2, 4, 5, 7, 10],
  // dom13 omits the 11 to match common jazz practice.
  dom13:      [0, 2, 4, 7, 9, 10],
};

// Suffix appended to root name in display.
export const CHORD_SUFFIX: Record<ChordType, string> = {
  majorTriad: '',
  minorTriad: 'm',
  maj7:       'maj7',
  min7:       'm7',
  dom7:       '7',
  diminished: 'dim',
  augmented:  'aug',
  sus2:       'sus2',
  sus4:       'sus4',
  min7b5:     'm7♭5',
  dim7:       'dim7',
  dom9:       '9',
  maj9:       'maj9',
  min9:       'm9',
  dom11:      '11',
  dom13:      '13',
};

const TIER_TYPES: Record<Difficulty, ChordType[]> = {
  easy: ['majorTriad', 'minorTriad', 'maj7', 'min7', 'dom7'],
  medium: [
    'majorTriad', 'minorTriad', 'maj7', 'min7', 'dom7',
    'diminished', 'augmented', 'sus2', 'sus4', 'min7b5', 'dim7',
  ],
  hard: [
    'majorTriad', 'minorTriad', 'maj7', 'min7', 'dom7',
    'diminished', 'augmented', 'sus2', 'sus4', 'min7b5', 'dim7',
    'dom9', 'maj9', 'min9', 'dom11', 'dom13',
  ],
};

// Jazz lead-sheet root spellings — flats preferred for non-natural roots
// other than F#, matching standard fake-book convention.
const ROOT_NAME: Record<PitchClass, string> = {
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

function idRoot(pc: PitchClass): string {
  return ROOT_NAME[pc].replace('#', 's').replace('b', 'f');
}

export function buildChord(rootPc: PitchClass, type: ChordType): Chord {
  const pattern = CHORD_PATTERNS[type];
  const pcs = pattern.map((iv) => ((rootPc + iv) % 12) as PitchClass).sort((a, b) => a - b);
  return {
    id: `${idRoot(rootPc)}_${type}`,
    rootPc,
    type,
    displayName: `${ROOT_NAME[rootPc]}${CHORD_SUFFIX[type]}`,
    pitchClasses: pcs,
  };
}

export function chordsForTier(tier: Difficulty): Chord[] {
  const types = TIER_TYPES[tier];
  const chords: Chord[] = [];
  for (const t of types) {
    for (let pc = 0; pc < 12; pc++) {
      chords.push(buildChord(pc as PitchClass, t));
    }
  }
  return chords;
}
