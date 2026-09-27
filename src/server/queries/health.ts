import { syncState } from "@/server/db/schema";
import type { drizzle } from "drizzle-orm/better-sqlite3";

/** Explicit list of implemented sync sources.
 *  Phase 1: empty. Phase 2 adds 'notion'. Phase 4 adds 'drive'.
 *  This is a code constant, not inferred from data. */
export const IMPLEMENTED_SOURCES: ReadonlyArray<"notion" | "drive"> = [];

export interface SourceHealth {
  lastSuccessAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
  seeded: boolean;
  implemented: boolean;
}

export interface HealthPayload {
  ok: boolean;
  sources: {
    notion: SourceHealth;
    drive: SourceHealth;
  };
  worker: {
    lastLoopAt: string | null;
  };
  checkedAt: string;
}

/** Row type inferred from the Drizzle schema. */
export type SyncStateRow = typeof syncState.$inferSelect;

const STALE_THRESHOLD_MS = 30 * 60 * 1000;

function isStale(isoTimestamp: string | null, now: Date, maxAgeMs = STALE_THRESHOLD_MS): boolean {
  if (!isoTimestamp) return true;
  const time = new Date(isoTimestamp).getTime();
  if (Number.isNaN(time)) return true;
  return now.getTime() - time > maxAgeMs;
}

/**
 * Pure function — no DB access. Unit-testable.
 *
 * @param syncRows           - All rows from the sync_state table (may be empty if DB is missing).
 * @param now                - Current time, injected for testability.
 * @param implementedSources - List of implemented sources, defaults to IMPLEMENTED_SOURCES.
 */
export function computeHealth(
  syncRows: SyncStateRow[],
  now: Date,
  implementedSources: ReadonlyArray<"notion" | "drive"> = IMPLEMENTED_SOURCES,
): HealthPayload {
  const rowMap = new Map<string, SyncStateRow>();
  for (const row of syncRows) {
    rowMap.set(row.source, row);
  }

  const workerRow = rowMap.get("worker");
  const workerLastLoopAt = workerRow?.lastSuccessAt ?? null;

  const buildSourceHealth = (source: "notion" | "drive"): SourceHealth => {
    const row = rowMap.get(source);
    return {
      lastSuccessAt: row?.lastSuccessAt ?? null,
      lastError: row?.lastError ?? null,
      lastErrorAt: row?.lastErrorAt ?? null,
      seeded: Boolean(row?.seeded),
      implemented: implementedSources.includes(source),
    };
  };

  const sources = {
    notion: buildSourceHealth("notion"),
    drive: buildSourceHealth("drive"),
  };

  let ok = true;

  if (syncRows.length === 0) {
    ok = false;
  } else if (isStale(workerLastLoopAt, now)) {
    ok = false;
  } else {
    for (const source of implementedSources) {
      const sourceHealth = sources[source];
      if (isStale(sourceHealth.lastSuccessAt, now)) {
        ok = false;
        break;
      }
    }
  }

  return {
    ok,
    sources,
    worker: {
      lastLoopAt: workerLastLoopAt,
    },
    checkedAt: now.toISOString(),
  };
}

/**
 * DB-backed query that retrieves all rows from sync_state and computes health.
 */
export function getHealth(
  db: ReturnType<typeof drizzle> | null,
): HealthPayload {
  if (!db) {
    return computeHealth([], new Date());
  }
  const rows = db.select().from(syncState).all();
  return computeHealth(rows, new Date());
}
