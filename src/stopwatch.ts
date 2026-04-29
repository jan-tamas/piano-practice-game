export class Stopwatch {
  private startedAt: number | null = null;
  private stoppedAt: number | null = null;
  private rafId: number | null = null;
  private onTick?: (ms: number) => void;

  start(onTick?: (ms: number) => void): void {
    this.startedAt = performance.now();
    this.stoppedAt = null;
    this.onTick = onTick;
    this.tick();
  }

  stop(): number {
    if (this.startedAt === null) return 0;
    this.stoppedAt = performance.now();
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    return this.stoppedAt - this.startedAt;
  }

  elapsed(): number {
    if (this.startedAt === null) return 0;
    const end = this.stoppedAt ?? performance.now();
    return end - this.startedAt;
  }

  private tick = (): void => {
    if (this.onTick) this.onTick(this.elapsed());
    if (this.stoppedAt === null) {
      this.rafId = requestAnimationFrame(this.tick);
    }
  };
}

export function formatMs(ms: number): string {
  const totalCs = Math.floor(ms / 10);
  const cs = totalCs % 100;
  const totalSec = Math.floor(totalCs / 100);
  const sec = totalSec % 60;
  const min = Math.floor(totalSec / 60);
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}
