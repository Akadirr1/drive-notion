import { describe, expect, it } from 'vitest';
import {
  formatDateTimeTurkish,
  formatDateTurkish,
  formatDeadline,
  formatStaleMessage,
  getOldestLastSuccessAt,
  relativeTime,
  relativeTimeAgo,
  stripExtension,
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

describe('formatDateTimeTurkish', () => {
  const baseNow = new Date('2026-09-28T12:00:00.000Z');

  it('formats timestamp in project timezone for current year without year', () => {
    // 11:32 UTC = 14:32 in Europe/Istanbul (+3)
    const iso = '2026-09-27T11:32:00.000Z';
    expect(formatDateTimeTurkish(iso, 'Europe/Istanbul', baseNow)).toBe('27 Eylül 14:32');
  });

  it('formats timestamp in different year with year', () => {
    const iso = '2025-09-27T11:32:00.000Z';
    expect(formatDateTimeTurkish(iso, 'Europe/Istanbul', baseNow)).toBe('27 Eylül 2025 14:32');
  });

  it('handles custom timezone correctly', () => {
    // 11:32 UTC = 11:32 in UTC
    const iso = '2026-09-27T11:32:00.000Z';
    expect(formatDateTimeTurkish(iso, 'UTC', baseNow)).toBe('27 Eylül 11:32');
  });
});

describe('stripExtension', () => {
  it('strips extension from filenames', () => {
    expect(stripExtension('WP-01_Report.pdf')).toBe('WP-01_Report');
    expect(stripExtension('Flight_Test_v1.2.docx')).toBe('Flight_Test_v1.2');
    expect(stripExtension('archive.tar.gz')).toBe('archive.tar');
  });

  it('leaves files without extension unchanged', () => {
    expect(stripExtension('Adsız doküman')).toBe('Adsız doküman');
    expect(stripExtension('')).toBe('');
    expect(stripExtension('.hidden')).toBe('.hidden');
  });
});

describe('getOldestLastSuccessAt', () => {
  it('returns the oldest timestamp among implemented sources', () => {
    const sources = {
      notion: {
        lastSuccessAt: '2026-09-28T10:00:00.000Z',
        lastError: null,
        lastErrorAt: null,
        seeded: true,
        implemented: true,
      },
      drive: {
        lastSuccessAt: '2026-09-28T11:30:00.000Z',
        lastError: null,
        lastErrorAt: null,
        seeded: true,
        implemented: true,
      },
    };

    expect(getOldestLastSuccessAt(sources)).toBe('2026-09-28T10:00:00.000Z');
  });

  it('skips null lastSuccessAt and returns the non-null one', () => {
    const sources = {
      notion: {
        lastSuccessAt: '2026-09-28T10:00:00.000Z',
        lastError: null,
        lastErrorAt: null,
        seeded: true,
        implemented: true,
      },
      drive: {
        lastSuccessAt: null,
        lastError: null,
        lastErrorAt: null,
        seeded: false,
        implemented: true,
      },
    };

    expect(getOldestLastSuccessAt(sources)).toBe('2026-09-28T10:00:00.000Z');
  });

  it('returns null if all implemented sources are null', () => {
    const sources = {
      notion: {
        lastSuccessAt: null,
        lastError: null,
        lastErrorAt: null,
        seeded: false,
        implemented: true,
      },
      drive: {
        lastSuccessAt: null,
        lastError: null,
        lastErrorAt: null,
        seeded: false,
        implemented: true,
      },
    };

    expect(getOldestLastSuccessAt(sources)).toBeNull();
  });
});

describe('formatStaleMessage', () => {
  const baseNow = new Date('2026-09-28T12:00:00.000Z');

  it('formats single failing source with prior success', () => {
    const sources = {
      notion: {
        lastSuccessAt: '2026-09-28T10:00:00.000Z', // 2 hours ago
        lastError: null,
        lastErrorAt: null,
        seeded: true,
        implemented: true,
      },
      drive: {
        lastSuccessAt: '2026-09-28T11:55:00.000Z', // 5 min ago (healthy)
        lastError: null,
        lastErrorAt: null,
        seeded: true,
        implemented: true,
      },
    };

    expect(formatStaleMessage(sources, baseNow)).toBe(
      'Notion senkronu çalışmıyor. Son başarı: 2 sa önce.'
    );
  });

  it('formats single failing source that never synced', () => {
    const sources = {
      notion: {
        lastSuccessAt: '2026-09-28T11:50:00.000Z', // healthy
        lastError: null,
        lastErrorAt: null,
        seeded: true,
        implemented: true,
      },
      drive: {
        lastSuccessAt: null, // never synced
        lastError: null,
        lastErrorAt: null,
        seeded: false,
        implemented: true,
      },
    };

    expect(formatStaleMessage(sources, baseNow)).toBe(
      'Drive henüz hiç senkron olmadı.'
    );
  });

  it('formats multiple failing sources joined with a space (no combined forms)', () => {
    const sources = {
      notion: {
        lastSuccessAt: '2026-09-28T10:00:00.000Z', // 2 hours ago
        lastError: null,
        lastErrorAt: null,
        seeded: true,
        implemented: true,
      },
      drive: {
        lastSuccessAt: null, // never synced
        lastError: null,
        lastErrorAt: null,
        seeded: false,
        implemented: true,
      },
    };

    expect(formatStaleMessage(sources, baseNow)).toBe(
      'Notion senkronu çalışmıyor. Son başarı: 2 sa önce. Drive henüz hiç senkron olmadı.'
    );
  });

  it('formats both never synced sources joined with a space', () => {
    const sources = {
      notion: {
        lastSuccessAt: null,
        lastError: null,
        lastErrorAt: null,
        seeded: false,
        implemented: true,
      },
      drive: {
        lastSuccessAt: null,
        lastError: null,
        lastErrorAt: null,
        seeded: false,
        implemented: true,
      },
    };

    expect(formatStaleMessage(sources, baseNow)).toBe(
      'Notion henüz hiç senkron olmadı. Drive henüz hiç senkron olmadı.'
    );
  });

  it('returns empty string when all implemented sources are healthy', () => {
    const sources = {
      notion: {
        lastSuccessAt: '2026-09-28T11:55:00.000Z',
        lastError: null,
        lastErrorAt: null,
        seeded: true,
        implemented: true,
      },
      drive: {
        lastSuccessAt: '2026-09-28T11:50:00.000Z',
        lastError: null,
        lastErrorAt: null,
        seeded: true,
        implemented: true,
      },
    };

    expect(formatStaleMessage(sources, baseNow)).toBe('');
  });
});


