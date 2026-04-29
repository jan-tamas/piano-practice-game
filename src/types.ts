export type Difficulty = 'easy' | 'medium' | 'hard';

export type Mode = 'scales' | 'chords';

export type ScaleType =
  | 'major'
  | 'naturalMinor'
  | 'harmonicMinor'
  | 'melodicMinor'
  | 'majorPentatonic'
  | 'minorPentatonic'
  | 'blues'
  | 'dorian'
  | 'phrygian'
  | 'lydian'
  | 'mixolydian'
  | 'locrian'
  | 'wholeTone'
  | 'diminished';

export type ChordType =
  | 'majorTriad'
  | 'minorTriad'
  | 'maj7'
  | 'min7'
  | 'dom7'
  | 'diminished'
  | 'augmented'
  | 'sus2'
  | 'sus4'
  | 'min7b5'
  | 'dim7'
  | 'dom9'
  | 'maj9'
  | 'min9'
  | 'dom11'
  | 'dom13';

export type PitchClass = number; // 0..11, 0 = C

export type Scale = {
  id: string;            // e.g. "D_major"
  rootPc: PitchClass;
  type: ScaleType;
  displayName: string;   // e.g. "D Major", "Bb Minor"
  pitchClasses: PitchClass[]; // sorted ascending
};

export type Chord = {
  id: string;            // e.g. "D_min7"
  rootPc: PitchClass;
  type: ChordType;
  displayName: string;   // e.g. "Dm7", "G7", "C#dim"
  pitchClasses: PitchClass[]; // sorted ascending
};

// Common shape used by the round/feedback UI.
export type Prompt = {
  id: string;
  rootPc: PitchClass;
  displayName: string;
  pitchClasses: PitchClass[];
};

export type AttemptLog = {
  scaleId: string;       // also used for chord ids in chord mode
  timestamp: number;
  elapsedMs: number;
  correct: boolean;
  missedNotes: PitchClass[];
  extraNotes: PitchClass[];
};

export type ScaleStats = {
  attempts: number;
  recentResults: AttemptLog[];
};

export type Settings = {
  muted: boolean;
};

export type Session = {
  id: string;
  startedAt: number;
  endedAt: number;
  mode: Mode;
  difficulty: Difficulty;
  attempts: number;
  correctAttempts: number;
  sessionScore: number;       // 0..100
  avgCorrectTimeMs: number;
};

export type Stored = {
  mode: Mode;
  difficulty: Difficulty;
  history: AttemptLog[];
  scaleStats: Record<string, ScaleStats>;
  chordHistory: AttemptLog[];
  chordStats: Record<string, ScaleStats>;
  sessions: Session[];
  settings: Settings;
};
