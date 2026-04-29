import type { AttemptLog, Mode, Session, Stored } from './types';

const KEY = 'scale-practice-game/v1';
const HISTORY_CAP = 1000;
const RECENT_CAP = 10;
const SESSIONS_CAP = 200;

const DEFAULT: Stored = {
  mode: 'scales',
  difficulty: 'easy',
  history: [],
  scaleStats: {},
  chordHistory: [],
  chordStats: {},
  sessions: [],
  settings: { muted: false },
};

export function load(): Stored {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT };
    const parsed = JSON.parse(raw) as Partial<Stored>;
    const sessions = (parsed.sessions ?? []).map((s) => ({
      ...s,
      mode: (s as Session).mode ?? 'scales',
    })) as Session[];
    return {
      mode: parsed.mode ?? DEFAULT.mode,
      difficulty: parsed.difficulty ?? DEFAULT.difficulty,
      history: parsed.history ?? [],
      scaleStats: parsed.scaleStats ?? {},
      chordHistory: parsed.chordHistory ?? [],
      chordStats: parsed.chordStats ?? {},
      sessions,
      settings: { ...DEFAULT.settings, ...(parsed.settings ?? {}) },
    };
  } catch {
    return { ...DEFAULT };
  }
}

export function save(state: Stored): void {
  localStorage.setItem(KEY, JSON.stringify(state));
}

export function recordAttempt(state: Stored, mode: Mode, attempt: AttemptLog): Stored {
  const isChord = mode === 'chords';
  const historyArr = isChord ? state.chordHistory : state.history;
  const statsMap = isChord ? state.chordStats : state.scaleStats;

  const history = [attempt, ...historyArr].slice(0, HISTORY_CAP);
  const prev = statsMap[attempt.scaleId] ?? { attempts: 0, recentResults: [] };
  const recentResults = [attempt, ...prev.recentResults].slice(0, RECENT_CAP);
  const updatedStats = {
    ...statsMap,
    [attempt.scaleId]: {
      attempts: prev.attempts + 1,
      recentResults,
    },
  };
  const next: Stored = isChord
    ? { ...state, chordHistory: history, chordStats: updatedStats }
    : { ...state, history, scaleStats: updatedStats };
  save(next);
  return next;
}

export function recordSession(state: Stored, session: Session): Stored {
  const sessions = [...state.sessions, session].slice(-SESSIONS_CAP);
  const next: Stored = { ...state, sessions };
  save(next);
  return next;
}

export function resetStats(state: Stored): Stored {
  const next: Stored = {
    ...state,
    history: [],
    scaleStats: {},
    chordHistory: [],
    chordStats: {},
    sessions: [],
  };
  save(next);
  return next;
}
