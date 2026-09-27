import { describe, expect, it } from 'vitest';
import {
  compareTaskPriority,
  type NextActionTask,
  pickNextAction,
} from '@/server/domain/next-action';

function makeTask(overrides: Partial<NextActionTask> = {}): NextActionTask {
  return {
    pageId: 'task-1',
    title: 'Test task',
    statusGroup: 'active',
    departmentId: '00',
    dueDate: '2026-10-01',
    blocked: 0,
    isNext: 0,
    priorityRank: 1,
    sortOrder: 1,
    url: 'https://notion.so/test-task',
    ...overrides,
  };
}

describe('pickNextAction', () => {
  it('1: returns null for an empty list', () => {
    expect(pickNextAction([])).toBeNull();
  });

  it('2: picks the task with is_next = 1', () => {
    const task = makeTask({ pageId: 'next-1', isNext: 1 });
    const result = pickNextAction([task]);
    expect(result?.pageId).toBe('next-1');
  });

  it('3: is_next task wins over another task with higher priority rank', () => {
    const taskRank0 = makeTask({ pageId: 'rank-0', priorityRank: 0, isNext: 0 });
    const taskIsNext = makeTask({ pageId: 'is-next', priorityRank: 3, isNext: 1 });
    const result = pickNextAction([taskRank0, taskIsNext]);
    expect(result?.pageId).toBe('is-next');
  });

  it('4: picks lower priorityRank among active tasks when no is_next', () => {
    const task1 = makeTask({ pageId: 'rank-1', priorityRank: 1 });
    const task2 = makeTask({ pageId: 'rank-2', priorityRank: 2 });
    const result = pickNextAction([task2, task1]);
    expect(result?.pageId).toBe('rank-1');
  });

  it('5: picks lower sortOrder when priorityRank is equal', () => {
    const taskA = makeTask({ pageId: 'order-1', priorityRank: 1, sortOrder: 0.1 });
    const taskB = makeTask({ pageId: 'order-2', priorityRank: 1, sortOrder: 0.2 });
    const result = pickNextAction([taskB, taskA]);
    expect(result?.pageId).toBe('order-1');
  });

  it('6: picks earlier due date when priorityRank and sortOrder are equal', () => {
    const taskEarlier = makeTask({
      pageId: 'earlier',
      priorityRank: 1,
      sortOrder: 1,
      dueDate: '2026-09-30',
    });
    const taskLater = makeTask({
      pageId: 'later',
      priorityRank: 1,
      sortOrder: 1,
      dueDate: '2026-10-05',
    });
    const result = pickNextAction([taskLater, taskEarlier]);
    expect(result?.pageId).toBe('earlier');
  });

  it('7: sorts null due dates last', () => {
    const taskWithDate = makeTask({
      pageId: 'with-date',
      priorityRank: 1,
      sortOrder: 1,
      dueDate: '2026-10-01',
    });
    const taskNullDate = makeTask({
      pageId: 'null-date',
      priorityRank: 1,
      sortOrder: 1,
      dueDate: null,
    });
    const result = pickNextAction([taskNullDate, taskWithDate]);
    expect(result?.pageId).toBe('with-date');
  });

  it('8: sorts null priorityRank last', () => {
    const taskWithRank = makeTask({
      pageId: 'with-rank',
      priorityRank: 2,
    });
    const taskNullRank = makeTask({
      pageId: 'null-rank',
      priorityRank: null,
    });
    const result = pickNextAction([taskNullRank, taskWithRank]);
    expect(result?.pageId).toBe('with-rank');
  });

  it('9: skips blocked tasks and picks first non-blocked active task', () => {
    const taskBlocked = makeTask({
      pageId: 'blocked',
      priorityRank: 0,
      blocked: 1,
    });
    const taskActive = makeTask({
      pageId: 'active-ok',
      priorityRank: 1,
      blocked: 0,
    });
    const result = pickNextAction([taskBlocked, taskActive]);
    expect(result?.pageId).toBe('active-ok');
  });

  it('10: picks first todo task by priority when no active tasks exist', () => {
    const todo1 = makeTask({
      pageId: 'todo-1',
      statusGroup: 'todo',
      priorityRank: 1,
    });
    const todo2 = makeTask({
      pageId: 'todo-2',
      statusGroup: 'todo',
      priorityRank: 2,
    });
    const result = pickNextAction([todo2, todo1]);
    expect(result?.pageId).toBe('todo-1');
  });

  it('11: active tasks always win over higher-priority todo tasks', () => {
    const todoHighPri = makeTask({
      pageId: 'todo-high',
      statusGroup: 'todo',
      priorityRank: 0,
    });
    const activeLowPri = makeTask({
      pageId: 'active-low',
      statusGroup: 'active',
      priorityRank: 3,
    });
    const result = pickNextAction([todoHighPri, activeLowPri]);
    expect(result?.pageId).toBe('active-low');
  });
});

describe('compareTaskPriority', () => {
  it('correctly compares two tasks', () => {
    const a = makeTask({ priorityRank: 1 });
    const b = makeTask({ priorityRank: 2 });
    expect(compareTaskPriority(a, b)).toBeLessThan(0);
    expect(compareTaskPriority(b, a)).toBeGreaterThan(0);
    expect(compareTaskPriority(a, a)).toBe(0);
  });
});
