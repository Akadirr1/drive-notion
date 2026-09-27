export interface NextActionTask {
  pageId: string;
  title: string;
  statusGroup: 'todo' | 'active' | 'done';
  departmentId: string | null;
  dueDate: string | null;
  blocked: number;
  isNext: number;
  priorityRank: number | null;
  sortOrder: number | null;
  url: string;
}

export interface NextAction {
  pageId: string;
  title: string;
  departmentId: string | null;
  dueDate: string | null;
  url: string;
}

export function compareTaskPriority(a: NextActionTask, b: NextActionTask): number {
  if (a.isNext !== b.isNext) {
    return b.isNext - a.isNext;
  }

  if (a.blocked !== b.blocked) {
    return a.blocked - b.blocked;
  }

  if (a.statusGroup !== b.statusGroup) {
    if (a.statusGroup === 'active') return -1;
    if (b.statusGroup === 'active') return 1;
    if (a.statusGroup === 'todo') return -1;
    if (b.statusGroup === 'todo') return 1;
  }

  if (a.priorityRank !== b.priorityRank) {
    if (a.priorityRank === null) return 1;
    if (b.priorityRank === null) return -1;
    return a.priorityRank - b.priorityRank;
  }

  if (a.sortOrder !== b.sortOrder) {
    if (a.sortOrder === null) return 1;
    if (b.sortOrder === null) return -1;
    return a.sortOrder - b.sortOrder;
  }

  if (a.dueDate !== b.dueDate) {
    if (a.dueDate === null) return 1;
    if (b.dueDate === null) return -1;
    return a.dueDate.localeCompare(b.dueDate);
  }

  return 0;
}

export function pickNextAction(tasks: NextActionTask[]): NextAction | null {
  const nonDone = tasks.filter((t) => t.statusGroup !== 'done');
  if (nonDone.length === 0) return null;

  const nextTask = nonDone.find((t) => t.isNext === 1);
  if (nextTask) {
    return {
      pageId: nextTask.pageId,
      title: nextTask.title,
      departmentId: nextTask.departmentId,
      dueDate: nextTask.dueDate,
      url: nextTask.url,
    };
  }

  const sorted = [...nonDone].sort(compareTaskPriority);
  const candidate = sorted.find((t) => t.blocked === 0);
  if (!candidate) return null;

  return {
    pageId: candidate.pageId,
    title: candidate.title,
    departmentId: candidate.departmentId,
    dueDate: candidate.dueDate,
    url: candidate.url,
  };
}
