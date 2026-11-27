import 'reflect-metadata';
import { validateSync } from 'class-validator';
import { DefaultDelayDto } from '@gitroom/nestjs-libraries/dtos/settings/default-delay.dto';
import { scheduledDelayOptions, withDefaultDelay, DEFAULT_SCHEDULED_DELAY, MINUTE_MS, RANDOM_30_MINUTES, RANDOM_60_MINUTES, resolveScheduledDelay } from '@gitroom/helpers/utils/scheduled.delay';

describe('scheduled delays', () => {
  it('uses the shared default and resolves both random windows at execution', () => {
    expect(DEFAULT_SCHEDULED_DELAY).toBe(RANDOM_30_MINUTES);
    expect(resolveScheduledDelay(RANDOM_30_MINUTES, 1, () => 0)).toBe(0);
    expect(resolveScheduledDelay(String(RANDOM_30_MINUTES), 1, () => 0.999999999)).toBe(30 * MINUTE_MS);
    expect(resolveScheduledDelay(RANDOM_60_MINUTES, MINUTE_MS, () => 0.999999999)).toBe(60 * MINUTE_MS);
  });
  it('uses the same presets for threads and internal plugs without changing explicit delays', () => {
    expect(scheduledDelayOptions(1).map((option) => option.value)).toEqual(
      scheduledDelayOptions().map((option) => option.value < 0 ? option.value : option.value * MINUTE_MS)
    );
    expect(withDefaultDelay(undefined, 15)).toBe(15);
    expect(withDefaultDelay('', 15, 1)).toBe(15 * MINUTE_MS);
    expect(withDefaultDelay(null, RANDOM_60_MINUTES, 1)).toBe(RANDOM_60_MINUTES);
    expect(withDefaultDelay(0, RANDOM_30_MINUTES, 1)).toBe(0);
    expect(withDefaultDelay('0', RANDOM_30_MINUTES)).toBe(0);
    expect(withDefaultDelay('7200000', 15, 1)).toBe(7200000);
  });

  it('accepts only supported workspace default presets', () => {
    for (const { value } of scheduledDelayOptions()) {
      expect(validateSync(Object.assign(new DefaultDelayDto(), { defaultDelay: value }))).toHaveLength(0);
    }
    for (const value of [-1, -999, 3600000, '15', null, undefined]) {
      expect(validateSync(Object.assign(new DefaultDelayDto(), { defaultDelay: value }))).not.toHaveLength(0);
    }
  });

  it('keeps existing fixed milliseconds and thread minutes unchanged', () => {
    expect(resolveScheduledDelay('3600000', 1)).toBe(3600000);
    expect(resolveScheduledDelay(5, MINUTE_MS)).toBe(300000);
    expect(resolveScheduledDelay(0, MINUTE_MS)).toBe(0);
    expect(resolveScheduledDelay(-5, MINUTE_MS)).toBe(0);
    expect(resolveScheduledDelay('not a number', 1)).toBe(0);
  });
});
