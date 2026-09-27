import type { NotionTaskSnapshot } from "./map-page";

export interface RawEventDescriptor {
  kind: string; // e.g. 'status:active', 'blocked:true'
  externalId: string; // page_id
  payload: string; // JSON string
  occurredAt: string; // last_edited_time
}

export interface TaskAfterPayload {
  statusGroup: string;
  blocked: number;
  blockerNote: string | null;
  title: string;
  departmentId: string | null;
  url: string;
}

/**
 * Builds a raw-event payload's "after" object. Always includes title, departmentId, url.
 * This is the ONLY function that builds "after" payloads.
 */
export function buildAfterPayload(snapshot: NotionTaskSnapshot): TaskAfterPayload {
  return {
    statusGroup: snapshot.statusGroup,
    blocked: snapshot.blocked,
    blockerNote: snapshot.blockerNote,
    title: snapshot.title,
    departmentId: snapshot.departmentId,
    url: snapshot.url,
  };
}

/**
 * Returns raw events for all changes between before and after.
 * before = null means a new task. Returns [] for no-op (no changes).
 */
export function diffTask(
  before: NotionTaskSnapshot | null,
  after: NotionTaskSnapshot
): RawEventDescriptor[] {
  const events: RawEventDescriptor[] = [];
  const afterPayload = buildAfterPayload(after);

  // New task: before is null
  if (!before) {
    if (after.statusGroup === "active") {
      events.push({
        kind: "status:active",
        externalId: after.pageId,
        payload: JSON.stringify({
          before: null,
          after: afterPayload,
        }),
        occurredAt: after.lastEditedTime,
      });
    } else if (after.statusGroup === "done") {
      events.push({
        kind: "status:done",
        externalId: after.pageId,
        payload: JSON.stringify({
          before: null,
          after: afterPayload,
        }),
        occurredAt: after.lastEditedTime,
      });
    }
    // New todo produces no event. New task never emits blocked event.
    return events;
  }

  // Existing task: check if completely unchanged
  const hasChanged =
    before.title !== after.title ||
    before.status !== after.status ||
    before.statusGroup !== after.statusGroup ||
    before.departmentId !== after.departmentId ||
    before.milestoneId !== after.milestoneId ||
    before.dueDate !== after.dueDate ||
    before.blocked !== after.blocked ||
    before.blockerNote !== after.blockerNote ||
    before.isNext !== after.isNext ||
    before.url !== after.url ||
    before.archived !== after.archived;

  if (!hasChanged) {
    return [];
  }

  // Status group changed
  if (before.statusGroup !== after.statusGroup) {
    events.push({
      kind: `status:${after.statusGroup}`,
      externalId: after.pageId,
      payload: JSON.stringify({
        before: { statusGroup: before.statusGroup },
        after: afterPayload,
      }),
      occurredAt: after.lastEditedTime,
    });
  }

  // Blocked status changed
  if (before.blocked !== after.blocked) {
    events.push({
      kind: `blocked:${after.blocked === 1 ? "true" : "false"}`,
      externalId: after.pageId,
      payload: JSON.stringify({
        before: { blocked: before.blocked },
        after: afterPayload,
      }),
      occurredAt: after.lastEditedTime,
    });
  }

  return events;
}
