export const rawEventFixtures = {
  // Status changes
  todoToActive: {
    id: 1,
    source: "notion" as const,
    kind: "status:active",
    externalId: "page-001",
    payload: JSON.stringify({
      before: { statusGroup: "todo" },
      after: {
        statusGroup: "active",
        title: "Design motor mount",
        departmentId: "01",
        url: "https://notion.so/page-001",
        blocked: 0,
        blockerNote: null,
      },
    }),
    occurredAt: "2026-09-27T10:00:00.000Z",
    ingestedAt: "2026-09-27T10:01:00.000Z",
    processed: 0,
  },

  doneToActive: {
    id: 2,
    source: "notion" as const,
    kind: "status:active",
    externalId: "page-002",
    payload: JSON.stringify({
      before: { statusGroup: "done" },
      after: {
        statusGroup: "active",
        title: "Revise wiring diagram",
        departmentId: "02",
        url: "https://notion.so/page-002",
        blocked: 0,
        blockerNote: null,
      },
    }),
    occurredAt: "2026-09-27T10:05:00.000Z",
    ingestedAt: "2026-09-27T10:06:00.000Z",
    processed: 0,
  },

  activeToDone: {
    id: 3,
    source: "notion" as const,
    kind: "status:done",
    externalId: "page-003",
    payload: JSON.stringify({
      before: { statusGroup: "active" },
      after: {
        statusGroup: "done",
        title: "Order batteries",
        departmentId: "00",
        url: "https://notion.so/page-003",
        blocked: 0,
        blockerNote: null,
      },
    }),
    occurredAt: "2026-09-27T10:10:00.000Z",
    ingestedAt: "2026-09-27T10:11:00.000Z",
    processed: 0,
  },

  todoToDone: {
    id: 4,
    source: "notion" as const,
    kind: "status:done",
    externalId: "page-004",
    payload: JSON.stringify({
      before: { statusGroup: "todo" },
      after: {
        statusGroup: "done",
        title: "Book test site",
        departmentId: "00",
        url: "https://notion.so/page-004",
        blocked: 0,
        blockerNote: null,
      },
    }),
    occurredAt: "2026-09-27T10:15:00.000Z",
    ingestedAt: "2026-09-27T10:16:00.000Z",
    processed: 0,
  },

  statusTodo: {
    id: 12,
    source: "notion" as const,
    kind: "status:todo",
    externalId: "page-012",
    payload: JSON.stringify({
      before: { statusGroup: "active" },
      after: {
        statusGroup: "todo",
        title: "Deprioritized task",
        departmentId: "00",
        url: "https://notion.so/page-012",
        blocked: 0,
        blockerNote: null,
      },
    }),
    occurredAt: "2026-09-27T10:40:00.000Z",
    ingestedAt: "2026-09-27T10:41:00.000Z",
    processed: 0,
  },

  // Blocked changes
  unblockedToBlocked: {
    id: 5,
    source: "notion" as const,
    kind: "blocked:true",
    externalId: "page-005",
    payload: JSON.stringify({
      before: { blocked: 0 },
      after: {
        statusGroup: "active",
        blocked: 1,
        blockerNote: "Waiting for PCB delivery",
        title: "Assemble avionics",
        departmentId: "01",
        url: "https://notion.so/page-005",
      },
    }),
    occurredAt: "2026-09-27T10:20:00.000Z",
    ingestedAt: "2026-09-27T10:21:00.000Z",
    processed: 0,
  },

  blockedToUnblocked: {
    id: 6,
    source: "notion" as const,
    kind: "blocked:false",
    externalId: "page-006",
    payload: JSON.stringify({
      before: { blocked: 1 },
      after: {
        statusGroup: "active",
        blocked: 0,
        blockerNote: null,
        title: "Test GPS module",
        departmentId: "01",
        url: "https://notion.so/page-006",
      },
    }),
    occurredAt: "2026-09-27T10:25:00.000Z",
    ingestedAt: "2026-09-27T10:26:00.000Z",
    processed: 0,
  },

  // New task directly in active (before = null)
  newTaskActive: {
    id: 7,
    source: "notion" as const,
    kind: "status:active",
    externalId: "page-007",
    payload: JSON.stringify({
      before: null,
      after: {
        statusGroup: "active",
        title: "Calibrate ESCs",
        departmentId: "02",
        url: "https://notion.so/page-007",
        blocked: 0,
        blockerNote: null,
      },
    }),
    occurredAt: "2026-09-27T10:30:00.000Z",
    ingestedAt: "2026-09-27T10:31:00.000Z",
    processed: 0,
  },

  // New task directly in done (before = null)
  newTaskDone: {
    id: 8,
    source: "notion" as const,
    kind: "status:done",
    externalId: "page-008",
    payload: JSON.stringify({
      before: null,
      after: {
        statusGroup: "done",
        title: "Register team",
        departmentId: "00",
        url: "https://notion.so/page-008",
        blocked: 0,
        blockerNote: null,
      },
    }),
    occurredAt: "2026-09-27T10:35:00.000Z",
    ingestedAt: "2026-09-27T10:36:00.000Z",
    processed: 0,
  },

  // Null department (should still produce event)
  noDepartment: {
    id: 11,
    source: "notion" as const,
    kind: "status:active",
    externalId: "page-011",
    payload: JSON.stringify({
      before: { statusGroup: "todo" },
      after: {
        statusGroup: "active",
        title: "Unassigned task",
        departmentId: null,
        url: "https://notion.so/page-011",
        blocked: 0,
        blockerNote: null,
      },
    }),
    occurredAt: "2026-09-27T10:50:00.000Z",
    ingestedAt: "2026-09-27T10:51:00.000Z",
    processed: 0,
  },
};
