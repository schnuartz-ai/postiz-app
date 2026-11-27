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

// Preferences use minutes; internal plugs persist fixed delays in milliseconds.
export const SCHEDULED_DELAY_OPTIONS = [
  { value: 0, label: 'Immediately' },
  RANDOM_DELAY_OPTIONS[0],
  RANDOM_DELAY_OPTIONS[1],
  { value: 1, label: '1m' },
  { value: 2, label: '2m' },
  { value: 5, label: '5m' },
  { value: 10, label: '10m' },
  { value: 15, label: '15m' },
  { value: 30, label: '30m' },
  { value: 60, label: '1h' },
  { value: 120, label: '2h' },
  { value: 180, label: '3h' },
  { value: 480, label: '8h' },
  { value: 720, label: '12h' },
  { value: 900, label: '15h' },
  { value: 1440, label: '24h' },
] as const;

export const toDelayUnit = (minutes: number, unitMs = MINUTE_MS): number =>
  minutes < 0 ? minutes : (minutes * MINUTE_MS) / unitMs;

export const scheduledDelayOptions = (unitMs = MINUTE_MS) =>
  SCHEDULED_DELAY_OPTIONS.map(({ value, label }) => ({ value: toDelayUnit(value, unitMs), label }));

export const isMissingDelay = (value: unknown) =>
  value === undefined || value === null || value === '';

export const withDefaultDelay = (value: unknown, preference: number, unitMs = MINUTE_MS): number =>
  isMissingDelay(value) ? toDelayUnit(preference, unitMs) : Number(value);

export function resolveScheduledDelay(value: unknown, unitMs: number, random: () => number = Math.random): number {
  const numeric = Number(value ?? 0);
  const window = numeric === RANDOM_30_MINUTES ? 30 : numeric === RANDOM_60_MINUTES ? 60 : 0;
  if (window) {
    return Math.floor(random() * (window * MINUTE_MS + 1));
  }
  return Number.isFinite(numeric) && numeric >= 0 ? numeric * unitMs : 0;
}
