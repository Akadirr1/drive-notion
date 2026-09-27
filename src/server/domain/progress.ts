export interface ProgressInput {
  totalTasks: number; // non-archived
  doneTasks: number; // non-archived, status_group = 'done'
  deadline: string; // YYYY-MM-DD from config
  timezone: string; // e.g. "Europe/Istanbul"
  now: Date;
}

export interface ProgressResult {
  daysLeft: number;
  totalTasks: number;
  doneTasks: number;
  percent: number; // 0-100, integer
  /** e.g. "38 / 112 görev tamamlandı · %34" */
  progressText: string;
}

export interface CountsInput {
  blockedCount: number; // non-done, blocked=1
  activeNotBlockedCount: number; // status_group='active', blocked=0
  completedThisWeekCount: number; // TASK_COMPLETED events since Monday 00:00 timezone
}

export function computeProgress(input: ProgressInput): ProgressResult {
  const { totalTasks, doneTasks, deadline, timezone, now } = input;

  const todayStr = now.toLocaleDateString('en-CA', { timeZone: timezone });
  const todayMs = new Date(`${todayStr}T00:00:00Z`).getTime();
  const deadlineMs = new Date(`${deadline.slice(0, 10)}T00:00:00Z`).getTime();
  const daysLeft = Math.ceil((deadlineMs - todayMs) / 86_400_000);

  const percent = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;
  const progressText = `${doneTasks} / ${totalTasks} görev tamamlandı · %${percent}`;

  return {
    daysLeft,
    totalTasks,
    doneTasks,
    percent,
    progressText,
  };
}

/**
 * Returns the Monday 00:00 in the given timezone as an ISO string.
 * Exported for testability.
 */
export function getMondayMidnight(now: Date, timezone: string): string {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
  });

  const parts = dtf.formatToParts(now);
  const partMap: Record<string, string> = {};
  for (const part of parts) {
    partMap[part.type] = part.value;
  }

  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dayIdx = days.indexOf(partMap.weekday);
  const daysSinceMonday = (dayIdx + 6) % 7;

  const year = parseInt(partMap.year, 10);
  const month = parseInt(partMap.month, 10);
  const day = parseInt(partMap.day, 10);

  // UTC date of the Monday in question
  const mondayUtc = new Date(Date.UTC(year, month - 1, day - daysSinceMonday, 0, 0, 0, 0));
  const mYear = mondayUtc.getUTCFullYear();
  const mMonth = mondayUtc.getUTCMonth() + 1;
  const mDay = mondayUtc.getUTCDate();

  // Find the exact UTC moment that corresponds to 00:00:00 on (mYear, mMonth, mDay) in `timezone`
  const targetUtcMs = Date.UTC(mYear, mMonth - 1, mDay, 0, 0, 0, 0);

  // Check what time targetUtcMs is in the given timezone
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const tzParts = fmt.formatToParts(new Date(targetUtcMs));
  const tzMap: Record<string, string> = {};
  for (const part of tzParts) {
    tzMap[part.type] = part.value;
  }

  const tzAsUtcMs = Date.UTC(
    parseInt(tzMap.year, 10),
    parseInt(tzMap.month, 10) - 1,
    parseInt(tzMap.day, 10),
    parseInt(tzMap.hour, 10) % 24,
    parseInt(tzMap.minute, 10),
    parseInt(tzMap.second, 10)
  );

  const offsetMs = tzAsUtcMs - targetUtcMs;
  const exactMondayMidnight = new Date(targetUtcMs - offsetMs);

  return exactMondayMidnight.toISOString();
}
