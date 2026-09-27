import type { NormalizedEvent } from "./types";

export interface RawEventRow {
  id: number;
  source: string;
  kind: string;
  externalId: string;
  payload: string;
  occurredAt: string;
  ingestedAt: string;
  processed: number;
}

/**
 * Pure function that maps a raw event to a normalized semantic project event.
 * AGENTS.md: "One normalizer."
 * Returns null if the raw event does not correspond to a semantic event.
 */
export function normalizeRawEvent(raw: RawEventRow): NormalizedEvent | null {
  if (raw.source !== "notion") {
    // Drive events are handled in Phase 4
    return null;
  }

  let payload: {
    after?: {
      title: string;
      departmentId?: string | null;
      blockerNote?: string | null;
      url?: string | null;
    };
  };

  try {
    payload = JSON.parse(raw.payload);
  } catch {
    return null;
  }

  const after = payload?.after;
  if (!after) {
    return null;
  }

  switch (raw.kind) {
    case "status:active":
      return {
        type: "TASK_STARTED",
        departmentId: after.departmentId ?? null,
        subjectTitle: after.title,
        detail: null,
        docType: null,
        source: "notion",
        sourceId: raw.externalId,
        url: after.url ?? null,
        occurredAt: raw.occurredAt,
        rawEventId: raw.id,
      };

    case "status:done":
      return {
        type: "TASK_COMPLETED",
        departmentId: after.departmentId ?? null,
        subjectTitle: after.title,
        detail: null,
        docType: null,
        source: "notion",
        sourceId: raw.externalId,
        url: after.url ?? null,
        occurredAt: raw.occurredAt,
        rawEventId: raw.id,
      };

    case "status:todo":
      return null; // Not a semantic event

    case "blocked:true":
      return {
        type: "TASK_BLOCKED",
        departmentId: after.departmentId ?? null,
        subjectTitle: after.title,
        detail: after.blockerNote ?? null,
        docType: null,
        source: "notion",
        sourceId: raw.externalId,
        url: after.url ?? null,
        occurredAt: raw.occurredAt,
        rawEventId: raw.id,
      };

    case "blocked:false":
      return {
        type: "TASK_UNBLOCKED",
        departmentId: after.departmentId ?? null,
        subjectTitle: after.title,
        detail: null,
        docType: null,
        source: "notion",
        sourceId: raw.externalId,
        url: after.url ?? null,
        occurredAt: raw.occurredAt,
        rawEventId: raw.id,
      };

    default:
      return null;
  }
}
