import type { AttemptLog, Difficulty, Mode, Session } from './types';

export function roundScore(attempt: AttemptLog): number {
  if (!attempt.correct) return 0;
  const elapsedSec = attempt.elapsedMs / 1000;
  return 50 + Math.max(0, 50 - elapsedSec * 2);
}

export type LiveSession = {
  id: string;
  startedAt: number;
  mode: Mode;
  difficulty: Difficulty;
  attempts: AttemptLog[];
};

export function newLiveSession(mode: Mode, difficulty: Difficulty): LiveSession {
  return {
    id: `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    startedAt: Date.now(),
    mode,
    difficulty,
    attempts: [],
  };
}

export function finalize(live: LiveSession): Session | null {
  if (live.attempts.length === 0) return null;
  const correct = live.attempts.filter((a) => a.correct);
  const scores = live.attempts.map(roundScore);
  const sessionScore = scores.reduce((a, b) => a + b, 0) / scores.length;
  const avgCorrectTimeMs =
    correct.length > 0
      ? correct.reduce((a, b) => a + b.elapsedMs, 0) / correct.length
      : 0;
  return {
    id: live.id,
    startedAt: live.startedAt,
    endedAt: Date.now(),
    mode: live.mode,
    difficulty: live.difficulty,
    attempts: live.attempts.length,
    correctAttempts: correct.length,
    sessionScore,
    avgCorrectTimeMs,
  };
}

export function liveScore(live: LiveSession): number {
  if (live.attempts.length === 0) return 0;
  const scores = live.attempts.map(roundScore);
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

export function scoreBracket(score: number): {
  label: string;
  className: string;
} {
  if (score >= 90) return { label: 'Excellent', className: 'excellent' };
  if (score >= 70) return { label: 'Strong', className: 'strong' };
  if (score >= 50) return { label: 'Building', className: 'building' };
  return { label: 'Practice more', className: 'low' };
}
