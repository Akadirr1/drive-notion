import { describe, expect, it } from 'vitest';
import {
  formatDateTurkish,
  formatDeadline,
  relativeTime,
  relativeTimeAgo,
} from '@/lib/format';

describe('relativeTime', () => {
  const baseNow = new Date('2026-09-28T12:00:00.000Z');

  it('formats < 1 min as "az önce"', () => {
    const timestamp = new Date(baseNow.getTime() - 30 * 1000).toISOString();
    expect(relativeTime(timestamp, baseNow)).toBe('az önce');
  });

  it('formats 5 minutes ago as "5 dk"', () => {
    const timestamp = new Date(baseNow.getTime() - 5 * 60 * 1000).toISOString();
    expect(relativeTime(timestamp, baseNow)).toBe('5 dk');
  });

  it('formats 3 hours ago as "3 sa"', () => {
    const timestamp = new Date(baseNow.getTime() - 3 * 3600 * 1000).toISOString();
    expect(relativeTime(timestamp, baseNow)).toBe('3 sa');
  });

  it('formats 25 hours ago as "dün"', () => {
    const timestamp = new Date(baseNow.getTime() - 25 * 3600 * 1000).toISOString();
    expect(relativeTime(timestamp, baseNow)).toBe('dün');
  });

  it('formats 3 days ago as "3 gün"', () => {
    const timestamp = new Date(baseNow.getTime() - 3 * 86400 * 1000).toISOString();
    expect(relativeTime(timestamp, baseNow)).toBe('3 gün');
  });
});

describe('relativeTimeAgo', () => {
  const baseNow = new Date('2026-09-28T12:00:00.000Z');

  it('formats < 1 min as "az önce"', () => {
    const timestamp = new Date(baseNow.getTime() - 30 * 1000).toISOString();
    expect(relativeTimeAgo(timestamp, baseNow)).toBe('az önce');
  });

  it('formats 5 minutes ago as "5 dk önce"', () => {
    const timestamp = new Date(baseNow.getTime() - 5 * 60 * 1000).toISOString();
    expect(relativeTimeAgo(timestamp, baseNow)).toBe('5 dk önce');
  });

  it('formats 3 hours ago as "3 sa önce"', () => {
    const timestamp = new Date(baseNow.getTime() - 3 * 3600 * 1000).toISOString();
    expect(relativeTimeAgo(timestamp, baseNow)).toBe('3 sa önce');
  });

  it('formats 25 hours ago as "dün"', () => {
    const timestamp = new Date(baseNow.getTime() - 25 * 3600 * 1000).toISOString();
    expect(relativeTimeAgo(timestamp, baseNow)).toBe('dün');
  });

  it('formats 3 days ago as "3 gün önce"', () => {
    const timestamp = new Date(baseNow.getTime() - 3 * 86400 * 1000).toISOString();
    expect(relativeTimeAgo(timestamp, baseNow)).toBe('3 gün önce');
  });
});

describe('formatDateTurkish', () => {
  const baseNow = new Date('2026-09-28T12:00:00.000Z');

  it('formats date in same year without year', () => {
    expect(formatDateTurkish('2026-10-03', baseNow)).toBe('3 Ekim');
    expect(formatDateTurkish('2026-12-31', baseNow)).toBe('31 Aralık');
  });

  it('formats date in different year with year', () => {
    expect(formatDateTurkish('2027-01-15', baseNow)).toBe('15 Ocak 2027');
    expect(formatDateTurkish('2025-05-20', baseNow)).toBe('20 Mayıs 2025');
  });
});

describe('formatDeadline', () => {
  const baseNow = new Date('2026-09-28T12:00:00.000Z');

  it('formats deadline with deliverable', () => {
    expect(formatDeadline('2026-12-31', '2 uçan prototip', baseNow)).toBe(
      '31 Aralık, 2 uçan prototip',
    );
  });
});
