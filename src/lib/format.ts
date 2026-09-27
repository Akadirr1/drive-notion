import type { HealthPayload } from '@/server/queries/health';

const STALE_THRESHOLD_MS = 30 * 60 * 1000;

const TURKISH_MONTHS = [
  'Ocak',
  'Şubat',
  'Mart',
  'Nisan',
  'Mayıs',
  'Haziran',
  'Temmuz',
  'Ağustos',
  'Eylül',
  'Ekim',
  'Kasım',
  'Aralık',
];

/**
 * Removes the file extension from a file name.
 * e.g. "WP-01_Report.pdf" -> "WP-01_Report", "Notes.docx" -> "Notes", "Adsız doküman" -> "Adsız doküman"
 */
export function stripExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  if (lastDot <= 0) {
    return filename;
  }
  return filename.substring(0, lastDot);
}

/**
 * Returns the oldest non-null lastSuccessAt among implemented sources.
 * Returns null if none of the implemented sources have succeeded yet.
 */
export function getOldestLastSuccessAt(
  sources: HealthPayload['sources']
): string | null {
  let oldest: string | null = null;
  let oldestTime = Infinity;

  const entries: Array<keyof HealthPayload['sources']> = ['notion', 'drive'];
  for (const key of entries) {
    const s = sources[key];
    if (s && s.implemented && s.lastSuccessAt) {
      const time = new Date(s.lastSuccessAt).getTime();
      if (!Number.isNaN(time) && time < oldestTime) {
        oldestTime = time;
        oldest = s.lastSuccessAt;
      }
    }
  }

  return oldest;
}

/**
 * Formats stale warning message for the stale banner.
 * One sentence per failing implemented source, joined with a space.
 * E.g. "Drive henüz hiç senkron olmadı." or "Notion senkronu çalışmıyor. Son başarı: 2 sa önce."
 */
export function formatStaleMessage(
  sources: HealthPayload['sources'],
  now: Date = new Date()
): string {
  const sourceEntries: Array<{ key: 'notion' | 'drive'; label: string }> = [
    { key: 'notion', label: 'Notion' },
    { key: 'drive', label: 'Drive' },
  ];

  const sentences: string[] = [];

  for (const { key, label } of sourceEntries) {
    const source = sources[key];
    if (!source || !source.implemented) {
      continue;
    }

    if (!source.lastSuccessAt) {
      sentences.push(`${label} henüz hiç senkron olmadı.`);
    } else {
      const time = new Date(source.lastSuccessAt).getTime();
      if (Number.isNaN(time) || now.getTime() - time > STALE_THRESHOLD_MS) {
        const ago = relativeTimeAgo(source.lastSuccessAt, now);
        sentences.push(`${label} senkronu çalışmıyor. Son başarı: ${ago}.`);
      }
    }
  }

  return sentences.join(' ');
}


/**
 * Turkish relative time string (short form for feed rows).
 * Rules from DESIGN.md:
 * - < 1 min  → "az önce"
 * - < 60 min → "{n} dk"
 * - < 24 hr  → "{n} sa"
 * - < 48 hr  → "dün"
 * - else     → "{n} gün"
 */
export function relativeTime(isoTimestamp: string, now: Date = new Date()): string {
  const target = new Date(isoTimestamp);
  const diffMs = Math.max(0, now.getTime() - target.getTime());
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffMin < 1) {
    return 'az önce';
  }
  if (diffMin < 60) {
    return `${diffMin} dk`;
  }
  if (diffHour < 24) {
    return `${diffHour} sa`;
  }
  if (diffHour < 48) {
    return 'dün';
  }
  return `${diffDay} gün`;
}

/**
 * Turkish relative time string for sentences (sync status, stale banner).
 * Rules:
 * - < 1 min  → "az önce"
 * - < 60 min → "{n} dk önce"
 * - < 24 hr  → "{n} sa önce"
 * - < 48 hr  → "dün"
 * - else     → "{n} gün önce"
 */
export function relativeTimeAgo(isoTimestamp: string, now: Date = new Date()): string {
  const target = new Date(isoTimestamp);
  const diffMs = Math.max(0, now.getTime() - target.getTime());
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffMin < 1) {
    return 'az önce';
  }
  if (diffMin < 60) {
    return `${diffMin} dk önce`;
  }
  if (diffHour < 24) {
    return `${diffHour} sa önce`;
  }
  if (diffHour < 48) {
    return 'dün';
  }
  return `${diffDay} gün önce`;
}

/**
 * Format a YYYY-MM-DD date as Turkish: "3 Ekim", "31 Aralık 2026"
 * Includes year only if different from current year.
 */
export function formatDateTurkish(dateStr: string, now: Date = new Date()): string {
  const datePart = dateStr.slice(0, 10);
  const [yearStr, monthStr, dayStr] = datePart.split('-');
  const year = parseInt(yearStr, 10);
  const monthIndex = parseInt(monthStr, 10) - 1;
  const day = parseInt(dayStr, 10);

  const monthName = TURKISH_MONTHS[monthIndex] ?? '';
  const currentYear = now.getFullYear();

  if (year !== currentYear) {
    return `${day} ${monthName} ${year}`;
  }
  return `${day} ${monthName}`;
}

/**
 * Format deadline as Turkish: "31 Aralık, 2 uçan prototip"
 */
export function formatDeadline(deadline: string, deliverable: string, now: Date = new Date()): string {
  const formattedDate = formatDateTurkish(deadline, now);
  return `${formattedDate}, ${deliverable}`;
}

/**
 * Format an ISO timestamp as Turkish date and time in a given timezone:
 * e.g. "27 Eylül 14:32", or "27 Eylül 2025 14:32" if year differs from now.
 * Never shows raw ISO timestamp per DESIGN.md.
 */
export function formatDateTimeTurkish(
  isoTimestamp: string,
  timezone: string = 'Europe/Istanbul',
  now: Date = new Date()
): string {
  const date = new Date(isoTimestamp);

  const yearFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
  });
  const dateYear = parseInt(yearFormatter.format(date), 10);
  const currentYear = parseInt(yearFormatter.format(now), 10);

  if (dateYear !== currentYear) {
    const formatter = new Intl.DateTimeFormat('tr-TR', {
      timeZone: timezone,
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    return formatter.format(date);
  }

  const formatter = new Intl.DateTimeFormat('tr-TR', {
    timeZone: timezone,
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  return formatter.format(date);
}

