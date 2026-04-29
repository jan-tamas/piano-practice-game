import type { AttemptLog, Stored } from './types';

const KEY = 'scale-practice-game/v1';
const HISTORY_CAP = 1000;
const RECENT_CAP = 10;

const DEFAULT: Stored = {
  difficulty: 'easy',
  history: [],
  scaleStats: {},
  settings: { muted: false },
};

export function load(): Stored {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT };
    const parsed = JSON.parse(raw) as Partial<Stored>;
    return {
      difficulty: parsed.difficulty ?? DEFAULT.difficulty,
      history: parsed.history ?? [],
      scaleStats: parsed.scaleStats ?? {},
      settings: { ...DEFAULT.settings, ...(parsed.settings ?? {}) },
    };
  } catch {
    return { ...DEFAULT };
  }
}

export function save(state: Stored): void {
  localStorage.setItem(KEY, JSON.stringify(state));
}

export function recordAttempt(state: Stored, attempt: AttemptLog): Stored {
  const history = [attempt, ...state.history].slice(0, HISTORY_CAP);
  const prev = state.scaleStats[attempt.scaleId] ?? { attempts: 0, recentResults: [] };
  const recentResults = [attempt, ...prev.recentResults].slice(0, RECENT_CAP);
  const scaleStats = {
    ...state.scaleStats,
    [attempt.scaleId]: {
      attempts: prev.attempts + 1,
      recentResults,
    },
  };
  const next: Stored = { ...state, history, scaleStats };
  save(next);
  return next;
}

export function resetStats(state: Stored): Stored {
  const next: Stored = {
    ...state,
    history: [],
    scaleStats: {},
  };
  save(next);
  return next;
}
