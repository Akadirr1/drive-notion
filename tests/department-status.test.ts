import { describe, expect, it } from 'vitest';
import {
  computeDepartmentStatus,
  computeQuietSummary,
  type DepartmentStatusResult,
} from '@/server/domain/department-status';
import {
  activeDeptTasks,
  blockedDeptTasks,
  doneDeptTasks,
  notStartedDeptTasks,
  staleDeptTasks,
  waitingDeptTasks,
} from './fixtures/domain-fixtures';

describe('computeDepartmentStatus', () => {
  const baseNow = new Date('2026-09-28T12:00:00.000Z');
  const staleDays = 4;

  it('1: returns idle when task list is empty', () => {
    const result = computeDepartmentStatus({
      departmentId: '00',
      tasks: [],
      latestActivityAt: null,
      staleDays,
      now: baseNow,
    });
    expect(result.status).toBe('idle');
  });

  it('2: returns done when all tasks are done', () => {
    const result = computeDepartmentStatus({
      departmentId: '01',
      tasks: doneDeptTasks,
      latestActivityAt: '2026-09-20T10:00:00.000Z',
      staleDays,
      now: baseNow,
    });
    expect(result.status).toBe('done');
  });

  it('3: returns not_started when all tasks are todo', () => {
    const result = computeDepartmentStatus({
      departmentId: '02',
      tasks: notStartedDeptTasks,
      latestActivityAt: null,
      staleDays,
      now: baseNow,
    });
    expect(result.status).toBe('not_started');
  });

  it('4: returns waiting when some tasks are done and rest are todo', () => {
    const result = computeDepartmentStatus({
      departmentId: '03',
      tasks: waitingDeptTasks,
      latestActivityAt: '2026-09-20T10:00:00.000Z',
      staleDays,
      now: baseNow,
    });
    expect(result.status).toBe('waiting');
  });

  it('5: returns blocked when an active task is blocked', () => {
    const result = computeDepartmentStatus({
      departmentId: '04',
      tasks: [{ statusGroup: 'active', blocked: 1 }],
      latestActivityAt: '2026-09-27T10:00:00.000Z',
      staleDays,
      now: baseNow,
    });
    expect(result.status).toBe('blocked');
  });

  it('6: returns stale when active tasks have no activity in stale_days', () => {
    const result = computeDepartmentStatus({
      departmentId: '05',
      tasks: staleDeptTasks,
      latestActivityAt: '2026-09-20T10:00:00.000Z', // 8 days ago (> 4)
      staleDays,
      now: baseNow,
    });
    expect(result.status).toBe('stale');
    expect(result.staleDaysCount).toBe(8);
  });

  it('7: returns active when active tasks have recent event activity', () => {
    const result = computeDepartmentStatus({
      departmentId: '06',
      tasks: activeDeptTasks,
      latestActivityAt: '2026-09-27T10:00:00.000Z', // 1 day ago
      staleDays,
      now: baseNow,
    });
    expect(result.status).toBe('active');
  });

  it('8: returns active when active tasks have no events but recent task edit', () => {
    // latestActivityAt is the max of event and task edit
    const recentEdit = '2026-09-27T20:00:00.000Z'; // < 1 day ago
    const result = computeDepartmentStatus({
      departmentId: '07',
      tasks: [{ statusGroup: 'active', blocked: 0 }],
      latestActivityAt: recentEdit,
      staleDays,
      now: baseNow,
    });
    expect(result.status).toBe('active');
  });

  it('9: returns blocked when department has both active non-blocked and blocked tasks', () => {
    const result = computeDepartmentStatus({
      departmentId: '08',
      tasks: blockedDeptTasks,
      latestActivityAt: '2026-09-27T10:00:00.000Z',
      staleDays,
      now: baseNow,
    });
    expect(result.status).toBe('blocked');
  });
});

describe('computeQuietSummary', () => {
  it('10: formats quiet summary with not_started, waiting, and done', () => {
    const statuses: DepartmentStatusResult[] = [
      { departmentId: '01', status: 'not_started' },
      { departmentId: '02', status: 'not_started' },
      { departmentId: '03', status: 'not_started' },
      { departmentId: '04', status: 'waiting' },
      { departmentId: '05', status: 'waiting' },
      { departmentId: '06', status: 'done' },
    ];
    const summary = computeQuietSummary(statuses);
    expect(summary.notStartedCount).toBe(3);
    expect(summary.waitingCount).toBe(2);
    expect(summary.doneCount).toBe(1);
    expect(summary.idleCount).toBe(0);
    expect(summary.text).toBe('3 WP başlamadı · 2 WP beklemede · 1 tamamlandı');
  });

  it('11: returns empty string when all departments are loud', () => {
    const statuses: DepartmentStatusResult[] = [
      { departmentId: '01', status: 'blocked' },
      { departmentId: '02', status: 'stale' },
      { departmentId: '03', status: 'active' },
    ];
    const summary = computeQuietSummary(statuses);
    expect(summary.text).toBe('');
  });

  it('12: formats quiet summary when only idle departments exist as başlamadı', () => {
    const statuses: DepartmentStatusResult[] = [
      { departmentId: '01', status: 'idle' },
    ];
    const summary = computeQuietSummary(statuses);
    expect(summary.idleCount).toBe(1);
    expect(summary.notStartedCount).toBe(0);
    expect(summary.text).toBe('1 WP başlamadı');
  });

  it('13: counts idle and not_started together with waiting in summary text', () => {
    const statuses: DepartmentStatusResult[] = [
      ...Array.from({ length: 15 }, (_, i) => ({
        departmentId: String(i + 2).padStart(2, '0'),
        status: 'idle' as const,
      })),
      { departmentId: '01', status: 'waiting' as const },
    ];
    const summary = computeQuietSummary(statuses);
    expect(summary.idleCount).toBe(15);
    expect(summary.waitingCount).toBe(1);
    expect(summary.text).toBe('15 WP başlamadı · 1 WP beklemede');
  });
});
