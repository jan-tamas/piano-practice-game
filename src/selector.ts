import { scalesForTier } from './scales';
import type { Difficulty, Scale, ScaleStats, Stored } from './types';

type Stats = {
  errorRate: number;
  avgTimeMs: number | null;
};

function computeStats(s: ScaleStats | undefined): Stats {
  if (!s || s.recentResults.length === 0) {
    return { errorRate: 0, avgTimeMs: null };
  }
  const recent = s.recentResults;
  const errors = recent.filter((r) => !r.correct).length;
  const errorRate = errors / recent.length;
  const correct = recent.filter((r) => r.correct);
  const sample = correct.length > 0 ? correct : recent;
  const avgTimeMs = sample.reduce((acc, r) => acc + r.elapsedMs, 0) / sample.length;
  return { errorRate, avgTimeMs };
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

export function pickScale(state: Stored, tier: Difficulty, lastScaleId: string | null): Scale {
  const tierScales = scalesForTier(tier);

  const tierTimes: number[] = [];
  for (const s of tierScales) {
    const st = computeStats(state.scaleStats[s.id]);
    if (st.avgTimeMs !== null) tierTimes.push(st.avgTimeMs);
  }
  const tierMedianMs = median(tierTimes) || 10_000;

  const weights: number[] = tierScales.map((s) => {
    const stats = state.scaleStats[s.id];
    const attempts = stats?.attempts ?? 0;
    const { errorRate, avgTimeMs } = computeStats(stats);
    const normalizedTime = avgTimeMs === null
      ? 0
      : clamp((avgTimeMs - tierMedianMs) / tierMedianMs, 0, 2);
    let w =
      1 +
      4 * errorRate +
      2 * normalizedTime +
      (attempts === 0 ? 3 : 0);
    if (s.id === lastScaleId) w *= 0.2;
    return Math.max(w, 0.05);
  });

  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < tierScales.length; i++) {
    r -= weights[i];
    if (r <= 0) return tierScales[i];
  }
  return tierScales[tierScales.length - 1];
}
