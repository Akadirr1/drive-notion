import { eq, asc, desc, and, inArray } from "drizzle-orm";
import type { WriterDb } from "@/server/db/client";
import { rawEvents, projectEvents } from "@/server/db/schema";
import { normalizeRawEvent } from "./normalize";
import { shouldCoalesce, pickLaterOccurredAt } from "./coalesce";

/**
 * Reads unprocessed raw events, normalizes each via normalizeRawEvent(),
 * and inserts/coalesces resulting project events. Each raw event is handled in its own transaction.
 */
export function normalizePending(db: WriterDb): void {
  const pending = db
    .select()
    .from(rawEvents)
    .where(eq(rawEvents.processed, 0))
    .orderBy(asc(rawEvents.occurredAt))
    .all();

  let createdCount = 0;

  for (const raw of pending) {
    db.transaction((tx) => {
      const normalized = normalizeRawEvent(raw);
      if (normalized !== null) {
        let coalesced = false;

        if (normalized.type === "DOC_CREATED" || normalized.type === "DOC_UPDATED") {
          const [existing] = tx
            .select()
            .from(projectEvents)
            .where(
              and(
                eq(projectEvents.sourceId, normalized.sourceId),
                inArray(projectEvents.type, ["DOC_CREATED", "DOC_UPDATED"])
              )
            )
            .orderBy(desc(projectEvents.occurredAt))
            .limit(1)
            .all();

          if (existing && shouldCoalesce(existing, raw)) {
            tx.update(projectEvents)
              .set({
                occurredAt: pickLaterOccurredAt(existing.occurredAt, normalized.occurredAt),
                rawEventId: normalized.rawEventId,
                subjectTitle: normalized.subjectTitle,
                departmentId: normalized.departmentId,
                docType: normalized.docType,
                url: normalized.url,
              })
              .where(eq(projectEvents.id, existing.id))
              .run();
            coalesced = true;
          }
        }

        if (!coalesced) {
          tx.insert(projectEvents)
            .values({
              type: normalized.type,
              departmentId: normalized.departmentId,
              subjectTitle: normalized.subjectTitle,
              detail: normalized.detail,
              docType: normalized.docType,
              source: normalized.source,
              sourceId: normalized.sourceId,
              url: normalized.url,
              occurredAt: normalized.occurredAt,
              rawEventId: normalized.rawEventId,
            })
            .run();
          createdCount++;
        }
      }

      tx.update(rawEvents)
        .set({ processed: 1 })
        .where(eq(rawEvents.id, raw.id))
        .run();
    });
  }

  console.log(
    JSON.stringify({
      event: "normalize_complete",
      processed: pending.length,
      eventsCreated: createdCount,
      timestamp: new Date().toISOString(),
    })
  );
}
