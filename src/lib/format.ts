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

