// Both persisted delay formats are numeric. Reserve two negative values for
// explicit random modes (existing nonnegative delays retain their meaning).
export const RANDOM_30_MINUTES = -30;
export const RANDOM_60_MINUTES = -60;
export const DEFAULT_SCHEDULED_DELAY = RANDOM_30_MINUTES;
export const MINUTE_MS = 60_000;

export const RANDOM_DELAY_OPTIONS = [
  { value: RANDOM_30_MINUTES, label: 'Random (0–30 min)' },
  { value: RANDOM_60_MINUTES, label: 'Random (0–60 min)' },
] as const;

export function resolveScheduledDelay(value: unknown, unitMs: number, random: () => number = Math.random): number {
  const numeric = Number(value ?? 0);
  const window = numeric === RANDOM_30_MINUTES ? 30 : numeric === RANDOM_60_MINUTES ? 60 : 0;
  if (window) {
    return Math.floor(random() * (window * MINUTE_MS + 1));
  }
  return Number.isFinite(numeric) && numeric >= 0 ? numeric * unitMs : 0;
}
