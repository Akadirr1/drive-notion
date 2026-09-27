/** Closed list from ARCHITECTURE.md → Events */
export type ProjectEventType =
  | 'TASK_STARTED'
  | 'TASK_COMPLETED'
  | 'TASK_BLOCKED'
  | 'TASK_UNBLOCKED'
  | 'DOC_CREATED'
  | 'DOC_UPDATED';

export interface NormalizedEvent {
  type: ProjectEventType;
  departmentId: string | null;
  subjectTitle: string;
  detail: string | null;
  docType: string | null;
  source: 'notion' | 'drive';
  sourceId: string;
  url: string | null;
  occurredAt: string;
  rawEventId: number;
}
