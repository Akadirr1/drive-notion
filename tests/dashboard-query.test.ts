import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import path from 'node:path';
import * as schema from '@/server/db/schema';
import { notionTasks, projectEvents } from '@/server/db/schema';
import { computeDashboardData } from '@/server/queries/dashboard';
import type { ProjectConfig } from '@/server/config';
import type { WriterDb } from '@/server/db/client';

function createTestDb(): WriterDb {
  const sqlite = new Database(':memory:');
  const db = drizzle(sqlite, { schema });
  migrate(db, {
    migrationsFolder: path.join(process.cwd(), 'src/server/db/migrations'),
  });
  return db;
}

const testConfig: ProjectConfig = {
  project: {
    name: 'BUMIN-2 Test',
    deadline: '2026-12-31',
    deliverable: '2 uçan prototip',
    timezone: 'Europe/Istanbul',
    stale_days: 4,
  },
  departments: [
    { id: '00', name: 'Sistem', notion_value: '00', drive_folder_id: 'folder-00' },
    { id: '01', name: 'Avionik', notion_value: '01', drive_folder_id: 'folder-01' },
  ],
  notion: {
    tasks_data_source_id: 'ds-1',
    properties: {
      status: 'Durum',
      department: 'WP',
      title: 'Ad',
      blocked: 'Bloke',
    },
    status_groups: {
      todo: ['BAŞLANMADI'],
      active: ['AKTİF'],
      done: ['TAMAM'],
    },
  },
  drive: {
    root_folder_id: 'root-1',
    silent_mime_prefixes: [],
    silent_name_patterns: [],
  },
  doc_types: {},
};

describe('computeDashboardData', () => {
  let db: WriterDb;
  const baseNow = new Date('2026-09-28T12:00:00.000Z');

  beforeEach(() => {
    db = createTestDb();
  });

  it('1: ignores archived tasks in progress, counts, and next action', () => {
    // Non-archived active task
    db.insert(notionTasks)
      .values({
        pageId: 'task-active-1',
        title: 'Active task',
        status: 'AKTİF',
        statusGroup: 'active',
        departmentId: '00',
        blocked: 0,
        archived: 0,
        lastEditedTime: '2026-09-27T10:00:00.000Z',
        url: 'https://notion.so/active-1',
      })
      .run();

    // Non-archived done task
    db.insert(notionTasks)
      .values({
        pageId: 'task-done-1',
        title: 'Done task',
        status: 'TAMAM',
        statusGroup: 'done',
        departmentId: '00',
        blocked: 0,
        archived: 0,
        lastEditedTime: '2026-09-27T10:00:00.000Z',
        url: 'https://notion.so/done-1',
      })
      .run();

    // Archived blocked task (should not count as blocked)
    db.insert(notionTasks)
      .values({
        pageId: 'task-archived-blocked',
        title: 'Archived blocked task',
        status: 'AKTİF',
        statusGroup: 'active',
        departmentId: '00',
        blocked: 1,
        archived: 1,
        lastEditedTime: '2026-09-27T10:00:00.000Z',
        url: 'https://notion.so/archived-blocked',
      })
      .run();

    // Archived is_next task (should not be picked as next action)
    db.insert(notionTasks)
      .values({
        pageId: 'task-archived-next',
        title: 'Archived next task',
        status: 'AKTİF',
        statusGroup: 'active',
        departmentId: '00',
        blocked: 0,
        isNext: 1,
        archived: 1,
        lastEditedTime: '2026-09-27T10:00:00.000Z',
        url: 'https://notion.so/archived-next',
      })
      .run();

    const data = computeDashboardData(db, testConfig, baseNow);

    // Progress: only 2 non-archived tasks (1 done, 1 active)
    expect(data.progress.totalTasks).toBe(2);
    expect(data.progress.doneTasks).toBe(1);
    expect(data.progress.percent).toBe(50);

    // Counts: blocked is 0 because the blocked task is archived
    expect(data.counts.blockedCount).toBe(0);
    expect(data.counts.activeNotBlockedCount).toBe(1);

    // Next action: picks active-1, not the archived is_next task
    expect(data.nextAction?.pageId).toBe('task-active-1');
  });

  it('2: limits recent events to last 48 hours, max 5 rows, sorted descending', () => {
    // Insert raw events and project events
    const hoursAgo = (h: number) =>
      new Date(baseNow.getTime() - h * 3600 * 1000).toISOString();

    // Event older than 48 hours (50 hours ago)
    db.insert(projectEvents)
      .values({
        type: 'DOC_CREATED',
        departmentId: '00',
        subjectTitle: 'Old doc',
        source: 'drive',
        sourceId: 'old-doc',
        occurredAt: hoursAgo(50),
      })
      .run();

    // 6 events within 48 hours
    for (let i = 1; i <= 6; i++) {
      db.insert(projectEvents)
        .values({
          type: 'TASK_STARTED',
          departmentId: '01',
          subjectTitle: `Task ${i}`,
          source: 'notion',
          sourceId: `task-${i}`,
          occurredAt: hoursAgo(i),
        })
        .run();
    }

    const data = computeDashboardData(db, testConfig, baseNow);

    // Max 5 rows
    expect(data.recentEvents).toHaveLength(5);
    // Most recent is Task 1 (1 hour ago)
    expect(data.recentEvents[0].subjectTitle).toBe('Task 1');
    // 5th is Task 5 (5 hours ago)
    expect(data.recentEvents[4].subjectTitle).toBe('Task 5');
    // None has subject 'Old doc'
    expect(data.recentEvents.some((e) => e.subjectTitle === 'Old doc')).toBe(false);
  });

  it('3: counts completed tasks this week since Monday 00:00 Istanbul', () => {
    // baseNow is Monday 2026-09-28T12:00:00Z. Istanbul Monday 00:00 is 2026-09-27T21:00:00Z.
    // Completed task on Monday 08:00 UTC (this week)
    db.insert(projectEvents)
      .values({
        type: 'TASK_COMPLETED',
        departmentId: '00',
        subjectTitle: 'Completed this week',
        source: 'notion',
        sourceId: 'completed-1',
        occurredAt: '2026-09-28T08:00:00.000Z',
      })
      .run();

    // Completed task on Sunday 18:00 UTC (before Monday 00:00 Istanbul, last week)
    db.insert(projectEvents)
      .values({
        type: 'TASK_COMPLETED',
        departmentId: '00',
        subjectTitle: 'Completed last week',
        source: 'notion',
        sourceId: 'completed-old',
        occurredAt: '2026-09-27T18:00:00.000Z',
      })
      .run();

    // Another event type this week (should not be counted in completedThisWeekCount)
    db.insert(projectEvents)
      .values({
        type: 'TASK_STARTED',
        departmentId: '00',
        subjectTitle: 'Started this week',
        source: 'notion',
        sourceId: 'started-1',
        occurredAt: '2026-09-28T09:00:00.000Z',
      })
      .run();

    const data = computeDashboardData(db, testConfig, baseNow);
    expect(data.counts.completedThisWeekCount).toBe(1);
  });

  it('4: seeded data with no events shows active, not stale, if last_edited_time is recent', () => {
    // 1 day before baseNow (staleDays is 4)
    db.insert(notionTasks)
      .values({
        pageId: 'task-seeded',
        title: 'Seeded task',
        status: 'AKTİF',
        statusGroup: 'active',
        departmentId: '00',
        blocked: 0,
        archived: 0,
        lastEditedTime: '2026-09-27T12:00:00.000Z',
        url: 'https://notion.so/seeded-task',
      })
      .run();

    // No project events in DB
    const data = computeDashboardData(db, testConfig, baseNow);
    const dept00 = data.departments.find((d) => d.departmentId === '00');
    expect(dept00?.status).toBe('active');
  });
});
