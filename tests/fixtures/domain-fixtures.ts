// Task fixtures for different department states
export const blockedDeptTasks = [
  { statusGroup: 'active' as const, blocked: 1, lastEditedTime: '2026-09-20' },
  { statusGroup: 'active' as const, blocked: 0, lastEditedTime: '2026-09-20' },
  { statusGroup: 'todo' as const, blocked: 0, lastEditedTime: '2026-09-20' },
];

export const staleDeptTasks = [
  { statusGroup: 'active' as const, blocked: 0, lastEditedTime: '2026-09-01' },
  { statusGroup: 'todo' as const, blocked: 0, lastEditedTime: '2026-09-01' },
];

export const activeDeptTasks = [
  { statusGroup: 'active' as const, blocked: 0, lastEditedTime: '2026-09-27' },
  { statusGroup: 'done' as const, blocked: 0, lastEditedTime: '2026-09-27' },
];

export const waitingDeptTasks = [
  { statusGroup: 'done' as const, blocked: 0, lastEditedTime: '2026-09-20' },
  { statusGroup: 'todo' as const, blocked: 0, lastEditedTime: '2026-09-20' },
];

export const notStartedDeptTasks = [
  { statusGroup: 'todo' as const, blocked: 0, lastEditedTime: '2026-09-20' },
  { statusGroup: 'todo' as const, blocked: 0, lastEditedTime: '2026-09-20' },
];

export const doneDeptTasks = [
  { statusGroup: 'done' as const, blocked: 0, lastEditedTime: '2026-09-20' },
  { statusGroup: 'done' as const, blocked: 0, lastEditedTime: '2026-09-20' },
];
