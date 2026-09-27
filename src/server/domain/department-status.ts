export type DepartmentStatus =
  | 'blocked'
  | 'stale'
  | 'active'
  | 'waiting'
  | 'not_started'
  | 'done'
  | 'idle';

export interface DepartmentStatusInput {
  departmentId: string;
  tasks: Array<{
    statusGroup: 'todo' | 'active' | 'done';
    blocked: number; // 0 or 1
  }>;
  latestActivityAt: string | null; // Max of (latest project_event occurred_at, max notion_tasks last_edited_time)
  staleDays: number;
  now: Date;
}

export interface DepartmentStatusResult {
  departmentId: string;
  status: DepartmentStatus;
  /** For stale: how many days since the last activity */
  staleDaysCount?: number;
}

export function computeDepartmentStatus(
  input: DepartmentStatusInput,
): DepartmentStatusResult {
  const { departmentId, tasks, latestActivityAt, staleDays, now } = input;

  if (tasks.length === 0) {
    return { departmentId, status: 'idle' };
  }

  const nonDone = tasks.filter((t) => t.statusGroup !== 'done');
  if (nonDone.length === 0) {
    return { departmentId, status: 'done' };
  }

  if (nonDone.some((t) => t.blocked === 1)) {
    return { departmentId, status: 'blocked' };
  }

  const activeTasks = tasks.filter((t) => t.statusGroup === 'active');
  if (activeTasks.length > 0) {
    if (!latestActivityAt) {
      return {
        departmentId,
        status: 'stale',
        staleDaysCount: staleDays + 1,
      };
    }

    const activityTime = new Date(latestActivityAt).getTime();
    const daysSince = Math.floor((now.getTime() - activityTime) / 86_400_000);

    if (daysSince >= staleDays) {
      return {
        departmentId,
        status: 'stale',
        staleDaysCount: Math.max(daysSince, 0),
      };
    }

    return { departmentId, status: 'active' };
  }

  if (tasks.every((t) => t.statusGroup === 'todo')) {
    return { departmentId, status: 'not_started' };
  }

  const hasDone = tasks.some((t) => t.statusGroup === 'done');
  const allRemainingTodo = tasks
    .filter((t) => t.statusGroup !== 'done')
    .every((t) => t.statusGroup === 'todo');

  if (hasDone && allRemainingTodo) {
    return { departmentId, status: 'waiting' };
  }

  return { departmentId, status: 'idle' };
}

export interface QuietSummary {
  notStartedCount: number;
  waitingCount: number;
  doneCount: number;
  idleCount: number;
  /** Turkish summary string, e.g. "9 WP başlamadı · 2 WP beklemede · 2 tamamlandı". Empty string if all counts are 0. */
  text: string;
}

export function computeQuietSummary(
  statuses: DepartmentStatusResult[],
): QuietSummary {
  let notStartedCount = 0;
  let waitingCount = 0;
  let doneCount = 0;
  let idleCount = 0;

  for (const s of statuses) {
    if (s.status === 'not_started') notStartedCount++;
    else if (s.status === 'waiting') waitingCount++;
    else if (s.status === 'done') doneCount++;
    else if (s.status === 'idle') idleCount++;
  }

  const notStartedTotal = notStartedCount + idleCount;
  const parts: string[] = [];
  if (notStartedTotal > 0) {
    parts.push(`${notStartedTotal} WP başlamadı`);
  }
  if (waitingCount > 0) {
    parts.push(`${waitingCount} WP beklemede`);
  }
  if (doneCount > 0) {
    parts.push(`${doneCount} tamamlandı`);
  }

  return {
    notStartedCount,
    waitingCount,
    doneCount,
    idleCount,
    text: parts.join(' · '),
  };
}
