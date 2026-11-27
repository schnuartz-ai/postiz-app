import { DEFAULT_SCHEDULED_DELAY, MINUTE_MS, RANDOM_30_MINUTES, RANDOM_60_MINUTES, resolveScheduledDelay } from '@gitroom/helpers/utils/scheduled.delay';

describe('scheduled delays', () => {
  it('uses the shared default and resolves both random windows at execution', () => {
    expect(DEFAULT_SCHEDULED_DELAY).toBe(RANDOM_30_MINUTES);
    expect(resolveScheduledDelay(RANDOM_30_MINUTES, 1, () => 0)).toBe(0);
    expect(resolveScheduledDelay(String(RANDOM_30_MINUTES), 1, () => 0.999999999)).toBe(30 * MINUTE_MS);
    expect(resolveScheduledDelay(RANDOM_60_MINUTES, MINUTE_MS, () => 0.999999999)).toBe(60 * MINUTE_MS);
  });
  it('keeps existing fixed milliseconds and thread minutes unchanged', () => {
    expect(resolveScheduledDelay('3600000', 1)).toBe(3600000);
    expect(resolveScheduledDelay(5, MINUTE_MS)).toBe(300000);
    expect(resolveScheduledDelay(0, MINUTE_MS)).toBe(0);
    expect(resolveScheduledDelay(-5, MINUTE_MS)).toBe(0);
    expect(resolveScheduledDelay('not a number', 1)).toBe(0);
  });
});
