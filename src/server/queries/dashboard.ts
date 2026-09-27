import { and, desc, eq, gte, max } from 'drizzle-orm';
import type { ProjectConfig } from '@/server/config';
import type { WriterDb } from '@/server/db/client';
import { notionTasks, projectEvents, rawEvents } from '@/server/db/schema';
import {
  computeDepartmentStatus,
  computeQuietSummary,
  type DepartmentStatusResult,
  type QuietSummary,
} from '@/server/domain/department-status';
import {
  type NextAction,
  type NextActionTask,
  pickNextAction,
} from '@/server/domain/next-action';
import {
  type CountsInput,
  computeProgress,
  getMondayMidnight,
  type ProgressResult,
} from '@/server/domain/progress';

export interface ProjectEventRow {
  id: number;
  type: string;
  departmentId: string | null;
  subjectTitle: string;
  detail: string | null;
  docType: string | null;
  source: string;
  sourceId: string;
  url: string | null;
  occurredAt: string;
  ingestedAt: string; // From raw_events
}

export interface DashboardData {
  progress: ProgressResult;
  nextAction: NextAction | null;
  counts: CountsInput;
  departments: DepartmentStatusResult[];
  quietSummary: QuietSummary;
  recentEvents: ProjectEventRow[];
  projectName: string;
  deadline: string;
  deliverable: string;
}

/**
 * DB-aware wrapper for getting dashboard data.
 * Returns null when the database client is null (e.g. database file does not exist yet).
 */
export function getDashboardData(
  db: WriterDb | null,
  config: ProjectConfig,
): DashboardData | null {
  if (!db) return null;
  return computeDashboardData(db, config, new Date());
}

/**
 * Core query logic with injected dependencies for testability.
 */
export function computeDashboardData(
  db: WriterDb,
  config: ProjectConfig,
  now: Date,
): DashboardData {
  // 1. All non-archived tasks
  const tasks = db
    .select()
    .from(notionTasks)
    .where(eq(notionTasks.archived, 0))
    .all();

  // 2. Progress
  const doneTasks = tasks.filter((t) => t.statusGroup === 'done').length;
  const progress = computeProgress({
    totalTasks: tasks.length,
    doneTasks,
    deadline: config.project.deadline,
    timezone: config.project.timezone,
    now,
  });

  // 3. Next action
  const nextAction = pickNextAction(
    tasks.filter((t) => t.statusGroup !== 'done') as NextActionTask[],
  );

  // 4. Counts
  const blockedCount = tasks.filter(
    (t) => t.statusGroup !== 'done' && t.blocked === 1,
  ).length;

  const activeNotBlockedCount = tasks.filter(
    (t) => t.statusGroup === 'active' && t.blocked === 0,
  ).length;

  const mondayMidnight = getMondayMidnight(now, config.project.timezone);
  const completedEvents = db
    .select({ id: projectEvents.id })
    .from(projectEvents)
    .where(
      and(
        eq(projectEvents.type, 'TASK_COMPLETED'),
        gte(projectEvents.occurredAt, mondayMidnight),
      ),
    )
    .all();
  const completedThisWeekCount = completedEvents.length;

  // 5. Department statuses
  const departments: DepartmentStatusResult[] = config.departments.map((dept) => {
    const deptTasks = tasks.filter((t) => t.departmentId === dept.id);

    // Latest activity is max of latest project_event occurred_at and max notion_tasks last_edited_time
    const latestEventRow = db
      .select({ maxOccurred: max(projectEvents.occurredAt) })
      .from(projectEvents)
      .where(eq(projectEvents.departmentId, dept.id))
      .get();
    const latestEventAt = latestEventRow?.maxOccurred ?? null;

    let maxTaskEditedAt: string | null = null;
    for (const t of deptTasks) {
      if (t.lastEditedTime && (!maxTaskEditedAt || t.lastEditedTime > maxTaskEditedAt)) {
        maxTaskEditedAt = t.lastEditedTime;
      }
    }

    let latestActivityAt: string | null = null;
    if (latestEventAt && maxTaskEditedAt) {
      latestActivityAt = latestEventAt > maxTaskEditedAt ? latestEventAt : maxTaskEditedAt;
    } else {
      latestActivityAt = latestEventAt ?? maxTaskEditedAt;
    }

    return computeDepartmentStatus({
      departmentId: dept.id,
      tasks: deptTasks as Array<{
        statusGroup: 'todo' | 'active' | 'done';
        blocked: number;
      }>,
      latestActivityAt,
      staleDays: config.project.stale_days,
      now,
    });
  });

  const quietSummary = computeQuietSummary(departments);

  // 6. Recent events (last 48 hours, max 5)
  const cutoff48h = new Date(now.getTime() - 48 * 3600 * 1000).toISOString();
  const eventRows = db
    .select({
      id: projectEvents.id,
      type: projectEvents.type,
      departmentId: projectEvents.departmentId,
      subjectTitle: projectEvents.subjectTitle,
      detail: projectEvents.detail,
      docType: projectEvents.docType,
      source: projectEvents.source,
      sourceId: projectEvents.sourceId,
      url: projectEvents.url,
      occurredAt: projectEvents.occurredAt,
      ingestedAt: rawEvents.ingestedAt,
    })
    .from(projectEvents)
    .leftJoin(rawEvents, eq(projectEvents.rawEventId, rawEvents.id))
    .where(gte(projectEvents.occurredAt, cutoff48h))
    .orderBy(desc(projectEvents.occurredAt))
    .limit(5)
    .all();

  const recentEvents: ProjectEventRow[] = eventRows.map((r) => ({
    id: r.id,
    type: r.type,
    departmentId: r.departmentId,
    subjectTitle: r.subjectTitle,
    detail: r.detail,
    docType: r.docType,
    source: r.source,
    sourceId: r.sourceId,
    url: r.url,
    occurredAt: r.occurredAt,
    ingestedAt: r.ingestedAt ?? r.occurredAt,
  }));

  return {
    progress,
    nextAction,
    counts: {
      blockedCount,
      activeNotBlockedCount,
      completedThisWeekCount,
    },
    departments,
    quietSummary,
    recentEvents,
    projectName: config.project.name,
    deadline: config.project.deadline,
    deliverable: config.project.deliverable,
  };
}
