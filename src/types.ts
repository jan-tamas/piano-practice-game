export type Difficulty = 'easy' | 'medium' | 'hard';

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

export type PitchClass = number; // 0..11, 0 = C

export type Scale = {
  id: string;            // e.g. "D_major"
  rootPc: PitchClass;
  type: ScaleType;
  displayName: string;   // e.g. "D Major", "Bb Minor"
  pitchClasses: PitchClass[]; // sorted ascending
};

export type AttemptLog = {
  scaleId: string;
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
  difficulty: Difficulty;
  attempts: number;
  correctAttempts: number;
  sessionScore: number;       // 0..100
  avgCorrectTimeMs: number;
};

export type Stored = {
  difficulty: Difficulty;
  history: AttemptLog[];
  scaleStats: Record<string, ScaleStats>;
  sessions: Session[];
  settings: Settings;
};
