import { describe, expect, it } from 'vitest';
import { computeProgress, getMondayMidnight } from '@/server/domain/progress';

describe('computeProgress', () => {
  it('1: computes progress for 38/112 with deadline 2026-12-31', () => {
    const now = new Date('2026-09-28T12:00:00.000Z');
    const result = computeProgress({
      totalTasks: 112,
      doneTasks: 38,
      deadline: '2026-12-31',
      timezone: 'Europe/Istanbul',
      now,
    });

    expect(result.daysLeft).toBe(94);
    expect(result.percent).toBe(34);
    expect(result.progressText).toBe('38 / 112 görev tamamlandı · %34');
    expect(result.totalTasks).toBe(112);
    expect(result.doneTasks).toBe(38);
  });

  it('2: computes progress for 0/50', () => {
    const now = new Date('2026-09-28T12:00:00.000Z');
    const result = computeProgress({
      totalTasks: 50,
      doneTasks: 0,
      deadline: '2026-12-31',
      timezone: 'Europe/Istanbul',
      now,
    });

    expect(result.percent).toBe(0);
    expect(result.progressText).toBe('0 / 50 görev tamamlandı · %0');
  });

  it('3: computes progress for 50/50', () => {
    const now = new Date('2026-09-28T12:00:00.000Z');
    const result = computeProgress({
      totalTasks: 50,
      doneTasks: 50,
      deadline: '2026-12-31',
      timezone: 'Europe/Istanbul',
      now,
    });

    expect(result.percent).toBe(100);
    expect(result.progressText).toBe('50 / 50 görev tamamlandı · %100');
  });

  it('4: handles 0 total tasks gracefully', () => {
    const now = new Date('2026-09-28T12:00:00.000Z');
    const result = computeProgress({
      totalTasks: 0,
      doneTasks: 0,
      deadline: '2026-12-31',
      timezone: 'Europe/Istanbul',
      now,
    });

    expect(result.percent).toBe(0);
    expect(result.progressText).toBe('0 / 0 görev tamamlandı · %0');
  });
});

describe('getMondayMidnight', () => {
  const timezone = 'Europe/Istanbul';

  it('5: returns previous Monday 00:00 when called on a Wednesday', () => {
    // 2026-09-30 is a Wednesday
    const wednesday = new Date('2026-09-30T10:00:00.000Z');
    const mondayMidnight = getMondayMidnight(wednesday, timezone);
    // Monday is 2026-09-28. In Europe/Istanbul (UTC+3), 2026-09-28 00:00:00 is 2026-09-27T21:00:00.000Z.
    expect(mondayMidnight).toBe('2026-09-27T21:00:00.000Z');
  });

  it('6: returns same day 00:00 when called on a Monday', () => {
    // 2026-09-28 is a Monday at 12:00 UTC
    const monday = new Date('2026-09-28T12:00:00.000Z');
    const mondayMidnight = getMondayMidnight(monday, timezone);
    expect(mondayMidnight).toBe('2026-09-27T21:00:00.000Z');
  });

  it('7: returns Istanbul Monday 00:00 when called on Sunday UTC / Monday Istanbul', () => {
    // Sunday 2026-09-27 at 22:00 UTC is Monday 2026-09-28 at 01:00 in Istanbul
    const sundayUtcMondayIstanbul = new Date('2026-09-27T22:00:00.000Z');
    const mondayMidnight = getMondayMidnight(sundayUtcMondayIstanbul, timezone);
    expect(mondayMidnight).toBe('2026-09-27T21:00:00.000Z');
  });
});
