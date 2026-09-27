import { eq, asc } from "drizzle-orm";
import type { WriterDb } from "@/server/db/client";
import { rawEvents, projectEvents } from "@/server/db/schema";
import { normalizeRawEvent } from "./normalize";

/**
 * Reads unprocessed raw events, normalizes each via normalizeRawEvent(),
 * and inserts resulting project events. Each raw event is handled in its own transaction.
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
